#!/usr/bin/env python3
"""JARVIS SSE Diagnostic Script.

Replicates exactly what chat.py does to send a message and receive the SSE
stream, but outputs everything via plain print() calls — no rich.Live, no
jarvis_desktop imports, no third-party dependencies.

Diagnostic scenarios:
  A) Gateway unreachable  — [HEALTH] FAIL + [ERROR] Connection failed
  B) Stream connected but no tokens — [CONNECTED] + [DONE] 0 tokens + SSE parsing issue hint
  C) Tokens received OK  — [TOKEN] lines + [DIAGNOSIS] issue is in rich.Live display layer

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
# Config loading (replicates config.py load_config without pydantic/dotenv)
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    """Load gateway_url and api_key from ~/.jarvis/config.json or environment.

    Falls back to defaults: gateway_url="http://localhost:3000", api_key="".
    No pydantic, no dotenv — pure stdlib only.
    """
    defaults = {
        "gateway_url": "http://localhost:3000",
        "api_key": "",
    }

    # Read environment overrides (mirrors config.py load order)
    gateway_url = os.environ.get("GATEWAY_URL", defaults["gateway_url"])
    api_key = os.environ.get("JARVIS_API_KEY", defaults["api_key"])

    config = {"gateway_url": gateway_url, "api_key": api_key}

    # Read ~/.jarvis/config.json (user preferences override env defaults)
    config_file = Path.home() / ".jarvis" / "config.json"
    if config_file.exists():
        try:
            with open(config_file, encoding="utf-8") as f:
                user_data = json.load(f)
            # Only pull the two fields we care about — ignore everything else
            if "gateway_url" in user_data:
                config["gateway_url"] = user_data["gateway_url"]
            if "api_key" in user_data:
                config["api_key"] = user_data["api_key"]
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            print(f"[WARN] Could not read {config_file}: {exc} — using defaults")

    return config


# ---------------------------------------------------------------------------
# SSE parsing — verbatim copy from chat.py (keeps diagnostic honest)
# ---------------------------------------------------------------------------

def parse_sse_line(line: str):
    """Parse a single SSE line and return the data payload, or None if not a data line.

    Returns:
        str  — data payload (may be empty string for "data: " lines)
        None — for comment lines (:), event lines, id lines, or empty lines
    """
    if line.startswith("data: "):
        return line[6:]
    return None


def parse_sse_chunk(chunk: str, buffer: str) -> tuple:
    """Accumulate SSE chunk into buffer and extract complete data lines.

    Handles chunk-boundary splits: a 'data: token' line may arrive across two
    read() calls. The last incomplete line is kept in the buffer for the next call.

    Args:
        chunk:  New data received from read(1024).
        buffer: Leftover incomplete line from previous call. Pass "" for first call.

    Returns:
        (tokens, new_buffer):
            tokens     — list of extracted data payloads from complete lines
            new_buffer — remaining incomplete line (pass back to next call)
    """
    combined = buffer + chunk
    lines = combined.split("\n")
    # Last element may be an incomplete line — keep it in buffer
    incomplete = lines[-1]
    tokens = []
    for line in lines[:-1]:
        line = line.rstrip("\r")  # Strip CR from CRLF if present
        payload = parse_sse_line(line)
        if payload is not None:
            tokens.append(payload)
    return tokens, incomplete


# ---------------------------------------------------------------------------
# Build request headers — verbatim copy from chat.py build_request_headers
# ---------------------------------------------------------------------------

def build_request_headers(api_key: str) -> dict:
    """Build HTTP headers for SSE request.

    Returns Authorization header only if api_key is non-empty (D-06).
    """
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    return {}


# ---------------------------------------------------------------------------
# Main diagnostic
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the SSE diagnostic."""
    config = _load_config()
    gateway_url = config["gateway_url"]
    api_key = config["api_key"]

    # Accept optional message from CLI arg
    message = sys.argv[1] if len(sys.argv) > 1 else "olá, você está funcionando?"

    print("=== JARVIS SSE Diagnostic ===")
    print(f"Gateway URL: {gateway_url}")
    print(f"API key:     {'set (' + str(len(api_key)) + ' chars)' if api_key else 'not set'}")
    print(f'Message:     "{message}"')
    print()

    # ------------------------------------------------------------------
    # Health check — hit /health before attempting SSE stream
    # ------------------------------------------------------------------
    health_url = gateway_url.rstrip("/") + "/health"
    print(f"[HEALTH] Checking {health_url} ...")
    try:
        with urllib.request.urlopen(health_url, timeout=5) as resp:
            print(f"[HEALTH] OK — HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        print(f"[HEALTH] FAIL: HTTP {exc.code} {exc.reason}")
        print("[HEALTH] Gateway returned error — continuing with SSE attempt anyway")
    except urllib.error.URLError as exc:
        print(f"[HEALTH] FAIL: {exc.reason}")
        print("[HEALTH] Gateway unreachable — SSE attempt will likely also fail")
    except Exception as exc:  # noqa: BLE001
        print(f"[HEALTH] FAIL: {exc}")

    print()

    # ------------------------------------------------------------------
    # SSE stream attempt — replicates chat.py _stream_response exactly
    # ------------------------------------------------------------------
    url = (
        gateway_url.rstrip("/")
        + "/api/chat/stream"
        + "?message="
        + urllib.parse.quote(message, safe="")
    )
    headers = build_request_headers(api_key)

    print(f"Connecting to: {url}")
    if headers:
        print(f"Headers:       Authorization: Bearer ***{api_key[-4:]}")
    else:
        print("Headers:       (none — no API key)")
    print()

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            print(f"[CONNECTED] HTTP {response.status} {response.reason}")
            print()

            buffer = ""
            full_response: list = []
            total_chunks = 0
            total_tokens = 0

            while True:
                raw = response.read(1024)
                if not raw:
                    break

                total_chunks += 1
                print(f"[CHUNK] {len(raw)} bytes raw")

                chunk = raw.decode("utf-8", errors="replace")
                tokens, buffer = parse_sse_chunk(chunk, buffer)

                for token in tokens:
                    total_tokens += 1
                    print(f"[TOKEN] {token!r}")
                    full_response.append(token)

            print()
            print(f"[DONE] {total_chunks} chunks, {total_tokens} tokens received")
            print()

            if total_tokens == 0:
                print("[DIAGNOSIS] Stream connected but NO tokens received")
                print("            Possible causes:")
                print("            - SSE parsing dropping tokens (check parse_sse_chunk)")
                print("            - Gateway sent empty stream (no data: lines)")
                print("            - Scenario B: parsing issue")
            else:
                print("[DIAGNOSIS] Tokens received OK")
                print("            If terminal shows nothing, issue is in rich.Live display layer")
                print("            Scenario C: the gateway and SSE parsing work — fix the UI layer")

            if full_response:
                print()
                print("--- Full assembled response ---")
                print("".join(full_response))
                print("--- End ---")

    except urllib.error.URLError as exc:
        print(f"[ERROR] Connection failed: {exc.reason}")
        print("[DIAGNOSIS] Gateway unreachable — check gateway_url and that the server is running")
        print("            Scenario A: the problem is at the network/gateway level")
    except urllib.error.HTTPError as exc:
        print(f"[ERROR] HTTP {exc.code}: {exc.reason}")
        try:
            body = exc.read().decode("utf-8", errors="replace")
            if body:
                print(f"[ERROR] Response body: {body[:500]}")
        except Exception:  # noqa: BLE001
            pass
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] Unexpected: {exc}")


if __name__ == "__main__":
    main()
