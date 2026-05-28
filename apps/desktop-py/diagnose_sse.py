#!/usr/bin/env python3
"""JARVIS SSE Diagnostic Script — agentic protocol aware.

Replicates what chat.py does end-to-end, but outputs everything via plain
print() — no rich.Live, no jarvis_desktop imports, no third-party deps.

Covers the full agentic flow:
  Phase 1 — Initial stream: receives task:plan + task:awaiting-confirmation
  Phase 2 — Auto-confirm:   POST /api/tasks/:taskId/resume {kind: confirm}
  Phase 3 — Resume stream:  receives task:step:* + task:done (with summary)

Diagnostic scenarios:
  A) Gateway unreachable     — [HEALTH] FAIL
  B) Backend error / crash   — HTTP error or task:error event
  C) Agentic plan generated  — Phase 1 OK, task:plan + task:awaiting-confirmation
  D) Resume receives summary  — Phase 3 OK, task:done with non-empty summary
  E) Resume returns empty     — task:done with empty summary → silent completion bug
  F) Tokens visible in diag  — means issue is in rich.Live display layer

Usage:
  python apps/desktop-py/diagnose_sse.py
  python apps/desktop-py/diagnose_sse.py "sua pergunta aqui"
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    defaults = {"gateway_url": "http://localhost:3000", "api_key": ""}
    gateway_url = os.environ.get("GATEWAY_URL", defaults["gateway_url"])
    api_key = os.environ.get("JARVIS_API_KEY", defaults["api_key"])
    config = {"gateway_url": gateway_url, "api_key": api_key}
    config_file = Path.home() / ".jarvis" / "config.json"
    if config_file.exists():
        try:
            with open(config_file, encoding="utf-8") as f:
                user_data = json.load(f)
            if "gateway_url" in user_data:
                config["gateway_url"] = user_data["gateway_url"]
            if "api_key" in user_data:
                config["api_key"] = user_data["api_key"]
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            print(f"[WARN] Could not read {config_file}: {exc}")
    return config


# ---------------------------------------------------------------------------
# SSE parsing — mirrors chat.py parse_sse_chunk (event-aware)
# ---------------------------------------------------------------------------

def parse_sse_chunk(chunk: str, buffer: str) -> tuple:
    """Parse SSE chunk into (event_type, payload) tuples.

    Handles named events (event: foo\ndata: ...) and plain data lines.
    Returns (events, new_buffer) like chat.py.
    """
    combined = buffer + chunk
    parts = combined.split("\n\n")
    incomplete = parts[-1]
    events = []
    for part in parts[:-1]:
        if not part.strip():
            continue
        lines = [line.rstrip("\r") for line in part.split("\n")]
        event_type = None
        data_lines = []
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data_lines.append(line[6:])
        if not data_lines:
            continue
        if event_type is not None:
            events.append((event_type, "\n".join(data_lines)))
        else:
            for payload in data_lines:
                events.append((None, payload))
    return events, incomplete


def build_headers(api_key: str) -> dict:
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    return {}


# ---------------------------------------------------------------------------
# Stream reader — prints everything
# ---------------------------------------------------------------------------

def read_stream(response, label: str) -> tuple:
    """Read SSE stream, print all events, return (task_id, all_tokens, all_events)."""
    buffer = ""
    all_tokens = []
    all_events = []
    total_chunks = 0
    task_id = None

    print(f"\n[{label}] Reading stream...")

    while True:
        raw = response.read(1024)
        if not raw:
            break
        total_chunks += 1
        chunk = raw.decode("utf-8", errors="replace")
        events, buffer = parse_sse_chunk(chunk, buffer)

        for event_type, payload in events:
            if event_type is None:
                token = payload.replace("\\n", "\n")
                all_tokens.append(token)
                print(f"  [TOKEN] {token!r}")
            else:
                all_events.append((event_type, payload))
                try:
                    data = json.loads(payload)
                    if not task_id and "taskId" in data:
                        task_id = data["taskId"]
                    print(f"  [EVENT] {event_type}")
                    # Pretty-print key fields
                    if event_type == "task:plan":
                        steps = data.get("plan", {}).get("steps", [])
                        for s in steps:
                            print(f"    step {s.get('id')}: {s.get('description')}")
                    elif event_type == "task:done":
                        summary = data.get("summary", "")
                        print(f"    summary: {summary!r}")
                    elif event_type in ("task:step:start", "task:step:end"):
                        print(f"    stepId={data.get('stepId')} status={data.get('status', '')} summary={data.get('summary', '')!r}")
                    elif event_type == "task:error":
                        print(f"    message: {data.get('message', '')!r}")
                    elif event_type == "task:awaiting-confirmation":
                        print(f"    taskId: {data.get('taskId')}")
                    else:
                        print(f"    data: {payload[:200]}")
                except json.JSONDecodeError:
                    print(f"  [EVENT] {event_type} (malformed JSON): {payload[:200]}")

    print(f"  [{label}] Done — {total_chunks} chunks, {len(all_tokens)} tokens, {len(all_events)} events")
    return task_id, all_tokens, all_events


# ---------------------------------------------------------------------------
# Main diagnostic
# ---------------------------------------------------------------------------

def main() -> None:
    config = _load_config()
    gateway_url = config["gateway_url"]
    api_key = config["api_key"]
    message = sys.argv[1] if len(sys.argv) > 1 else "olá, você está funcionando?"

    print("=== JARVIS SSE Diagnostic (agentic) ===")
    print(f"Gateway URL: {gateway_url}")
    print(f"API key:     {'set (' + str(len(api_key)) + ' chars)' if api_key else 'not set'}")
    print(f'Message:     "{message}"')
    print()

    # ── Health check ──────────────────────────────────────────────────────
    health_url = gateway_url.rstrip("/") + "/health"
    print(f"[HEALTH] {health_url}")
    try:
        with urllib.request.urlopen(health_url, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"[HEALTH] OK — HTTP {resp.status}  {body[:200]}")
    except urllib.error.HTTPError as exc:
        print(f"[HEALTH] FAIL HTTP {exc.code}: {exc.reason}")
    except urllib.error.URLError as exc:
        print(f"[HEALTH] FAIL: {exc.reason}")
        print("[HEALTH] Gateway unreachable — stopping here")
        return
    except Exception as exc:
        print(f"[HEALTH] FAIL: {exc}")

    print()

    # ── Phase 1: Initial stream ───────────────────────────────────────────
    stream_url = (
        gateway_url.rstrip("/")
        + "/api/chat/stream"
        + "?message="
        + urllib.parse.quote(message, safe="")
    )
    headers = build_headers(api_key)

    print(f"[PHASE 1] Initial stream: {stream_url}")

    task_id = None
    phase1_events = []
    phase1_tokens = []

    try:
        req = urllib.request.Request(stream_url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as response:
            print(f"[PHASE 1] Connected — HTTP {response.status} {response.reason}")
            task_id, phase1_tokens, phase1_events = read_stream(response, "PHASE 1")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        print(f"[PHASE 1] HTTP {exc.code}: {exc.reason}  body: {body}")
        return
    except urllib.error.URLError as exc:
        print(f"[PHASE 1] URLError: {exc.reason}")
        return
    except Exception as exc:
        print(f"[PHASE 1] Error: {exc}")
        return

    # Check for task:awaiting-confirmation
    awaiting = any(et == "task:awaiting-confirmation" for et, _ in phase1_events)
    has_plan = any(et == "task:plan" for et, _ in phase1_events)
    has_error = any(et == "task:error" for et, _ in phase1_events)

    print()
    print(f"[PHASE 1] task_id={task_id!r}  plan={has_plan}  awaiting-confirmation={awaiting}  error={has_error}")

    if has_error:
        print("[DIAGNOSIS] Backend returned task:error during planning — check backend logs")
        return

    if not awaiting:
        if phase1_tokens:
            print("[DIAGNOSIS] Non-agentic response (plain tokens received — AGENTIC_DISABLED=true?)")
            print("--- Response ---")
            print("".join(phase1_tokens))
            print("--- End ---")
        else:
            print("[DIAGNOSIS] No task:awaiting-confirmation and no tokens — backend may have crashed")
        return

    if not task_id:
        print("[DIAGNOSIS] task:awaiting-confirmation received but no taskId found in events")
        return

    print()

    # ── Phase 2: Resume (auto-confirm) ───────────────────────────────────
    resume_url = gateway_url.rstrip("/") + f"/api/tasks/{task_id}/resume"
    resume_body = json.dumps({"kind": "confirm"}).encode()
    resume_headers = {
        "Content-Type": "application/json",
        **build_headers(api_key),
    }

    print(f"[PHASE 2] Sending confirm resume to: {resume_url}")

    try:
        req2 = urllib.request.Request(resume_url, data=resume_body, headers=resume_headers)
        with urllib.request.urlopen(req2, timeout=60) as response2:
            print(f"[PHASE 2] Connected — HTTP {response2.status} {response2.reason}")
            _, phase3_tokens, phase3_events = read_stream(response2, "PHASE 3")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        print(f"[PHASE 2] HTTP {exc.code}: {exc.reason}  body: {body}")
        print("[DIAGNOSIS] Resume request failed — task may have expired or taskId invalid")
        return
    except urllib.error.URLError as exc:
        print(f"[PHASE 2] URLError: {exc.reason}")
        return
    except Exception as exc:
        print(f"[PHASE 2] Error: {exc}")
        return

    print()

    # ── Diagnosis ─────────────────────────────────────────────────────────
    done_events = [(et, p) for et, p in phase3_events if et == "task:done"]
    error_events = [(et, p) for et, p in phase3_events if et == "task:error"]

    if error_events:
        print("[DIAGNOSIS] task:error received from executor")
        return

    if not done_events:
        print("[DIAGNOSIS] No task:done event received — executor may have crashed or timed out")
        return

    _, done_payload = done_events[0]
    try:
        done_data = json.loads(done_payload)
        summary = done_data.get("summary", "").strip()
    except json.JSONDecodeError:
        summary = ""

    if phase3_tokens:
        print(f"[DIAGNOSIS] Scenario F — tokens received in resume stream ({len(phase3_tokens)} tokens)")
        print("            If terminal shows nothing, issue is in rich.Live display layer")
        print()
        print("--- Response tokens ---")
        print("".join(phase3_tokens))
        print("--- End ---")
    elif summary:
        print(f"[DIAGNOSIS] Scenario D — task:done summary received (no streaming tokens)")
        print(f"            summary: {summary!r}")
        print()
        print("            If terminal shows nothing, the summary is not being rendered.")
        print("            Check _handle_agentic_event('task:done') in chat.py")
    else:
        print("[DIAGNOSIS] Scenario E — task:done received but summary is EMPTY")
        print("            This explains why nothing appears: empty summary → silent completion")
        print("            Check generateFinalSummary in executor.ts")


if __name__ == "__main__":
    main()
