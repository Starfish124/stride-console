import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { deviceForToken } from "@/lib/graph/store";

export const dynamic = "force-dynamic";

/**
 * The one command a founder pastes on their own Mac.
 *
 * Public in proxy.ts, and guarded the same way as the ingest route: without
 * a live device token this is a bare 404. It answers with a shell script
 * that installs the session hook, writes the token, and registers the hook
 * with Claude Code. The hook's source is the file in this repo, embedded
 * here rather than duplicated, so there is one copy of it in the world.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const device = deviceForToken(token);
  if (!device) return new NextResponse("Not found", { status: 404 });

  let hook: string;
  try {
    hook = fs.readFileSync(path.join(process.cwd(), "scripts", "graph-hook.py"), "utf8");
  } catch {
    return new NextResponse("The installer is missing on the console.", { status: 500 });
  }

  const base = process.env.STRIDE_PUBLIC_URL ?? "https://mac-mini.tailc91701.ts.net";
  // The heredoc is quoted so the shell expands nothing inside the Python.
  const script = `#!/bin/bash
set -euo pipefail

echo "Connecting this Mac to the Stride graph as: ${device.label}"

mkdir -p "$HOME/.stride-graph"
cat > "$HOME/.stride-graph/hook.py" <<'STRIDE_HOOK_EOF'
${hook}
STRIDE_HOOK_EOF
chmod 700 "$HOME/.stride-graph/hook.py"

cat > "$HOME/.stride-graph/config.json" <<'STRIDE_CONFIG_EOF'
{"url": "${base}/api/graph/ingest", "token": "${device.token}"}
STRIDE_CONFIG_EOF
chmod 600 "$HOME/.stride-graph/config.json"

python3 - <<'STRIDE_SETTINGS_EOF'
import json, os
from pathlib import Path

path = Path.home() / ".claude" / "settings.json"
path.parent.mkdir(parents=True, exist_ok=True)
try:
    settings = json.loads(path.read_text())
except Exception:
    settings = {}

command = str(Path.home() / ".stride-graph" / "hook.py")
hooks = settings.setdefault("hooks", {})
# settings.json ships "hooks": [] in some versions; a list has no room for
# an event map, so replace it rather than crash on it.
if not isinstance(hooks, dict):
    hooks = {}
    settings["hooks"] = hooks
entries = hooks.setdefault("SessionEnd", [])

already = any(
    command in json.dumps(entry) for entry in entries
)
if not already:
    entries.append({"hooks": [{"type": "command", "command": f"python3 {command}"}]})
    path.write_text(json.dumps(settings, indent=2) + "\\n")
    print("  hook registered in ~/.claude/settings.json")
else:
    print("  hook was already registered")
STRIDE_SETTINGS_EOF

echo "Done. Sessions in Stride folders register themselves from now on;"
echo "say \\"stride context\\" in any other session to include it."
`;

  return new NextResponse(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
