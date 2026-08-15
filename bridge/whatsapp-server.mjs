// The WhatsApp bridge, supervised.
//
// The actual WhatsApp connection is Go — lharries/whatsapp-mcp's
// whatsapp-bridge, vendored under bridge/whatsapp/ (MIT, LICENSE alongside)
// and patched twice: it binds 127.0.0.1 only (the upstream default answers
// every interface, wrong on a Mac that also faces Tailscale), and it prints
// the raw pairing string on its own line so this wrapper can turn it into an
// actual scannable image instead of parsing half-block art back out of a
// terminal.
//
// This process's job is small: start the Go binary, watch its stdout for the
// three moments that matter (a QR to show, a successful pairing, a logout),
// and keep data/whatsapp-bridge.json truthful so the console and a founder
// checking Settings never have to guess. If the binary dies it restarts,
// with backoff, the same posture as everything else on this Mac.
//
// Run: node bridge/whatsapp-server.mjs   (from the repo root)
//      npm run whatsapp

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BRIDGE_DIR = path.join(ROOT, "bridge", "whatsapp");
const BINARY = path.join(BRIDGE_DIR, "whatsapp-bridge");
const STATUS_FILE = path.join(ROOT, "data", "whatsapp-bridge.json");
const QR_FILE = path.join(ROOT, "data", "whatsapp-qr.png");

function log(message) {
  console.log(`[whatsapp] ${message}`);
}

function writeStatus(patch) {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  const current = readStatus();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const tmp = `${STATUS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATUS_FILE);
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return { paired: false };
  }
}

/** The raw pairing string, as a PNG a phone camera can actually read. */
function renderQr(raw) {
  execFile(
    "python3",
    ["-c", "import sys,qrcode; qrcode.make(sys.argv[1]).save(sys.argv[2])", raw, QR_FILE],
    (err) => {
      if (err) {
        log(`could not render the QR image: ${err.message} (pip install "qrcode[pil]" for this user)`);
        return;
      }
      fs.chmodSync(QR_FILE, 0o600);
      log("QR ready at data/whatsapp-qr.png — open Settings to see it, or scan from there.");
    },
  );
}

if (!fs.existsSync(BINARY)) {
  log(`no binary at ${BINARY} — run: cd bridge/whatsapp && go build -o whatsapp-bridge .`);
  process.exit(1);
}

let shuttingDown = false;
let restartDelayMs = 2_000;

function start() {
  writeStatus({ waitingForQr: false });
  const child = spawn(BINARY, [], { cwd: BRIDGE_DIR, stdio: ["ignore", "pipe", "pipe"] });

  let carry = "";
  const onOutput = (chunk) => {
    carry += chunk.toString("utf8");
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      process.stdout.write(`[bridge] ${line}\n`);

      if (line.startsWith("STRIDE_OWN_NUMBER:")) {
        writeStatus({ ownNumber: line.slice("STRIDE_OWN_NUMBER:".length) });
      } else if (line.startsWith("STRIDE_OWN_LID:")) {
        writeStatus({ ownLid: line.slice("STRIDE_OWN_LID:".length) });
      } else if (line.startsWith("STRIDE_QR_RAW:")) {
        const raw = line.slice("STRIDE_QR_RAW:".length);
        writeStatus({ paired: false, waitingForQr: true, qrAt: new Date().toISOString() });
        renderQr(raw);
      } else if (line.includes("Device logged out")) {
        writeStatus({ paired: false, waitingForQr: false });
      } else if (line.includes("Starting REST API server on")) {
        // Printed once the client is connected, on both the first pairing
        // and every reconnect after — the one line both paths share.
        try {
          fs.rmSync(QR_FILE, { force: true });
        } catch {
          /* nothing to remove */
        }
        writeStatus({ paired: true, waitingForQr: false, connectedAt: new Date().toISOString() });
        log("connected. Console can send and receive now.");
        restartDelayMs = 2_000; // a clean connection resets the backoff
      }
    }
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    writeStatus({ paired: false });
    log(`bridge exited (code ${code}, signal ${signal ?? "none"}). Restarting in ${restartDelayMs / 1000}s.`);
    setTimeout(start, restartDelayMs);
    restartDelayMs = Math.min(restartDelayMs * 2, 60_000);
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    shuttingDown = true;
    process.exit(0);
  });
}

log("starting the WhatsApp bridge…");
start();
