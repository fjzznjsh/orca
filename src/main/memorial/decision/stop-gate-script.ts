export const MEMORIAL_STOP_GATE_FILE_NAME = 'memorial-cursor-stop-gate.py'

/** Runs outside the app. Missing pane variables and any failure print an empty JSON object. */
export function stopGateScript(): string {
  return `#!/usr/bin/env python3
import json
import os
import sys
import urllib.request

def emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False))
    sys.stdout.flush()

try:
    pane = os.environ.get("ORCA_PANE_KEY") or ""
    port = os.environ.get("ORCA_AGENT_HOOK_PORT") or ""
    token = os.environ.get("ORCA_AGENT_HOOK_TOKEN") or ""
    if not pane or not port or not token:
        emit({})
        raise SystemExit(0)
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    body = json.dumps({
        "paneKey": pane,
        "generationId": payload.get("generation_id") or "",
    }).encode()
    request = urllib.request.Request(
        "http://127.0.0.1:%s/memorial/decision/fallback" % port,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Orca-Agent-Hook-Token": token,
            "X-Memorial-Pane-Key": pane,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=840) as response:
        parsed = json.loads(response.read().decode())
    if isinstance(parsed, dict) and isinstance(parsed.get("followup_message"), str):
        emit({"followup_message": parsed["followup_message"]})
    else:
        emit({})
except Exception:
    emit({})
`
}
