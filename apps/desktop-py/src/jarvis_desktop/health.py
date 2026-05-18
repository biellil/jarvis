"""Gateway health check — stdlib only, no third-party imports.

Returns a dict so callers don't need to handle HTTP exceptions.
Never raises — always returns a dict even if gateway is unreachable.
"""
import json
import urllib.request
from urllib.error import URLError


def check_health(gateway_url: str) -> dict:
    """Call GET {gateway_url}/api/health and return the response as a dict.

    Returns:
        On success: {"gateway": "ok", "backend": "ok"|"not_ready"|...}
        On failure: {"gateway": "unreachable", "backend": "unreachable"}

    Never raises. Timeout: 3 seconds.
    """
    url = f"{gateway_url.rstrip('/')}/api/health"
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except (URLError, OSError, json.JSONDecodeError, Exception):
        return {"gateway": "unreachable", "backend": "unreachable"}
