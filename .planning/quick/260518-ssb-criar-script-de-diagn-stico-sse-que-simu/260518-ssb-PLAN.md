---
phase: quick
plan: 260518-ssb
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop-py/diagnose_sse.py
autonomous: true
requirements: []

must_haves:
  truths:
    - "Script runs standalone from terminal with plain print() output only"
    - "Reads gateway_url and api_key from ~/.jarvis/config.json (or defaults)"
    - "Sends a test message to /api/chat/stream the same way chat.py does"
    - "Prints each SSE token as it arrives with debug labels"
    - "Reports clearly if connection fails, stream is empty, or tokens flow correctly"
  artifacts:
    - path: "apps/desktop-py/diagnose_sse.py"
      provides: "Standalone SSE diagnostic script"
  key_links:
    - from: "diagnose_sse.py"
      to: "/api/chat/stream"
      via: "urllib.request (stdlib only, same as chat.py)"
      pattern: "urllib.request.urlopen"
---

<objective>
Create a standalone SSE diagnostic script at apps/desktop-py/diagnose_sse.py that
replicates exactly what chat.py does to send a message and receive the SSE stream,
but outputs everything via plain print() calls with no rich.Live interference.

Purpose: Isolate whether the missing terminal response is caused by (A) the gateway
not responding, (B) SSE parsing dropping tokens, or (C) rich.Live swallowing output.

Output: apps/desktop-py/diagnose_sse.py — runnable as `python apps/desktop-py/diagnose_sse.py`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/desktop-py/src/jarvis_desktop/chat.py
@apps/desktop-py/src/jarvis_desktop/config.py

<interfaces>
<!-- Key patterns replicated from chat.py and config.py -->

SSE sending logic (from chat.py _stream_response):
- URL: {gateway_url}/api/chat/stream?message={urllib.parse.quote(message)}
- Headers: {"Authorization": f"Bearer {api_key}"} if api_key else {}
- urllib.request.Request(url, headers=headers)
- urllib.request.urlopen(req, timeout=30)
- response.read(1024) loop until empty bytes
- chunk decode: raw.decode("utf-8", errors="replace")
- SSE parsing: buffer + chunk, split on "\n", lines[:-1], rstrip("\r"), check startswith("data: "), payload = line[6:]

Config loading (from config.py load_config):
- ~/.jarvis/config.json — JSON file with gateway_url, api_key fields
- Fallback: gateway_url="http://localhost:3000", api_key=""
- The diagnostic script reads this file directly with json.load() — no pydantic dependency
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create diagnose_sse.py standalone diagnostic script</name>
  <files>apps/desktop-py/diagnose_sse.py</files>
  <action>
Create apps/desktop-py/diagnose_sse.py as a standalone script. Use ONLY Python stdlib
(json, os, pathlib, sys, urllib.parse, urllib.request, urllib.error) — zero imports from
jarvis_desktop package so it runs even if the package has broken imports.

Script structure:

1. CONFIG LOADING section (replicate config.py load_config logic manually):
   - Read Path.home() / ".jarvis" / "config.json" with json.load()
   - Fall back to defaults: gateway_url="http://localhost:3000", api_key=""
   - Print the loaded values at startup: gateway_url and whether api_key is set

2. SSE PARSING section (copy parse_sse_chunk logic from chat.py verbatim):
   - def parse_sse_chunk(chunk: str, buffer: str) -> tuple — exact copy from chat.py
   - No changes — keeps the diagnostic honest to the real code path

3. MAIN DIAGNOSTIC function:
   - Accept optional message from sys.argv[1]; default to "olá, você está funcionando?"
   - Print: "=== JARVIS SSE Diagnostic ===" header
   - Print: gateway_url, api_key status, test message
   - Build URL: gateway_url.rstrip("/") + "/api/chat/stream" + "?message=" + urllib.parse.quote(message, safe="")
   - Build headers same as build_request_headers() in chat.py
   - Print: "Connecting to: {url}"

   Health check FIRST (before SSE):
   - urllib.request.urlopen(gateway_url.rstrip("/") + "/health", timeout=5)
   - Print: "[HEALTH] OK" or "[HEALTH] FAIL: {error}"
   - If health fails, print diagnosis hint and continue anyway (don't exit)

   SSE stream attempt:
   - urllib.request.Request(url, headers=headers)
   - urllib.request.urlopen(req, timeout=30)
   - Print: "[CONNECTED] HTTP {response.status} {response.reason}"
   - Read loop: response.read(1024) until empty bytes
     - Print: f"[CHUNK] {len(raw)} bytes raw"
     - Decode and call parse_sse_chunk(chunk, buffer)
     - For each token in returned tokens list:
       - Print: f"[TOKEN] {token!r}"  — use repr() to reveal whitespace/empty strings
     - Count total tokens and total chunks
   - After loop ends:
     - Print: f"[DONE] {total_chunks} chunks, {total_tokens} tokens received"
     - If total_tokens == 0: print "[DIAGNOSIS] Stream connected but NO tokens received — SSE parsing issue or gateway sent empty stream"
     - If total_tokens > 0: print "[DIAGNOSIS] Tokens received OK — issue is in rich.Live display layer"
     - Print full_response assembled from tokens

   Error handling:
   - urllib.error.URLError: print "[ERROR] Connection failed: {e.reason}" + "[DIAGNOSIS] Gateway unreachable — check gateway_url and that the server is running"
   - urllib.error.HTTPError: print "[ERROR] HTTP {e.code}: {e.reason}"
   - Exception: print "[ERROR] Unexpected: {e}"

4. if __name__ == "__main__": call main()

Use only plain print() throughout — NO rich, NO logging, NO console.print().
Add shebang line: #!/usr/bin/env python3
Add a brief docstring explaining the three diagnostic scenarios (A/B/C).
  </action>
  <verify>
    <automated>python apps/desktop-py/diagnose_sse.py --help 2>&1 || python apps/desktop-py/diagnose_sse.py "teste" 2>&1 | head -20</automated>
  </verify>
  <done>
Script exists at apps/desktop-py/diagnose_sse.py, runs without ImportError, prints
config values and attempts SSE connection. Output is plain text with [CHUNK]/[TOKEN]/
[DIAGNOSIS] labels. No rich imports anywhere in the file.
  </done>
</task>

</tasks>

<verification>
Run from repo root:
  python apps/desktop-py/diagnose_sse.py

Expected output pattern (gateway offline):
  === JARVIS SSE Diagnostic ===
  Gateway URL: http://localhost:3000
  API key: not set
  Message: "olá, você está funcionando?"
  [HEALTH] FAIL: ...
  [ERROR] Connection failed: ...
  [DIAGNOSIS] Gateway unreachable — ...

Expected output pattern (gateway online, tokens received):
  [CONNECTED] HTTP 200 OK
  [CHUNK] 512 bytes raw
  [TOKEN] 'Olá'
  [TOKEN] '!'
  [DONE] 3 chunks, 12 tokens received
  [DIAGNOSIS] Tokens received OK — issue is in rich.Live display layer

Confirm: no ImportError, no rich import, no jarvis_desktop import.
</verification>

<success_criteria>
- Script runs as `python apps/desktop-py/diagnose_sse.py` from any working directory
- Loads config from ~/.jarvis/config.json without pydantic or jarvis_desktop imports
- Replicates chat.py SSE request identically (same URL pattern, same headers, same parse_sse_chunk logic)
- Prints [TOKEN] repr for every SSE data line received
- Prints clear [DIAGNOSIS] conclusion at end distinguishing cases A/B/C
- Zero rich or jarvis_desktop imports in the file
</success_criteria>

<output>
No SUMMARY.md needed for quick tasks. Script is self-contained and disposable.
</output>
