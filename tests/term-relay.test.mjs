// The terminal relay: the cookie gets you in, the deck token never crosses to
// the browser side, the working directory is pinned to Stride repos, and the
// session lands in the relay's own namespace.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELAY = path.join(ROOT, "scripts", "term-relay.mjs");
const SECRET = "cafe0000cafe0000cafe0000cafe0000";
const COOKIE = crypto.createHash("sha256").update("stride-console:test").digest("hex");
// Must be on the relay's allowlist — the repo itself always is.
const GOOD_CWD = path.join(os.homedir(), "stride-console");

/** A stub deck: records the upgrade request head, answers 101, then echoes. */
function startStubDeck() {
  const heads = [];
  const server = net.createServer((sock) => {
    let buf = "";
    let upgraded = false;
    sock.on("data", (chunk) => {
      if (upgraded) {
        sock.write(chunk); // echo
        return;
      }
      buf += chunk.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end !== -1) {
        heads.push(buf.slice(0, end));
        upgraded = true;
        sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, heads }));
  });
}

function ping(port) {
  return new Promise((resolve) => {
    http
      .get({ host: "127.0.0.1", port, path: "/ping", timeout: 500 }, (res) => resolve(res.statusCode))
      .on("error", () => resolve(0))
      .on("timeout", function () {
        this.destroy();
        resolve(0);
      });
  });
}

/** Raw upgrade attempt; resolves with everything received until close/settle. */
function upgrade(port, reqPath, cookie) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => {
      sock.write(
        `GET ${reqPath} HTTP/1.1\r\nHost: relay\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          (cookie ? `Cookie: stride_session=${cookie}\r\n` : "") +
          `Sec-WebSocket-Key: dGVzdA==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let buf = "";
    sock.on("data", (c) => {
      buf += c.toString("latin1");
      if (buf.includes("101")) resolve({ sock, head: buf });
    });
    sock.on("close", () => resolve({ sock: null, head: buf }));
    setTimeout(() => resolve({ sock, head: buf }), 1500);
  });
}

test("relay: auth, allowlist, token injection, splice", async () => {
  const stub = await startStubDeck();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stride-relay-"));
  const tokenFile = path.join(tmp, "token");
  fs.writeFileSync(tokenFile, SECRET + "\n");
  const relayPort = 17000 + (process.pid % 1000);

  const child = spawn(process.execPath, [RELAY], {
    env: {
      ...process.env,
      STRIDE_PASSWORD: "test",
      STRIDE_TERM_PORT: String(relayPort),
      DECK_PORT: String(stub.port),
      DECK_TOKEN_FILE: tokenFile,
    },
    stdio: "ignore",
  });

  try {
    let up = 0;
    for (let i = 0; i < 30 && up !== 200; i++) {
      up = await ping(relayPort);
      if (up !== 200) await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(up, 200, "relay came up");

    // No cookie → 401, and the stub deck never hears about it.
    const anon = await upgrade(relayPort, `/pty?cwd=${encodeURIComponent(GOOD_CWD)}`, null);
    assert.match(anon.head, /^HTTP\/1\.1 401/);

    // Bad cookie → 401.
    const bad = await upgrade(relayPort, `/pty?cwd=${encodeURIComponent(GOOD_CWD)}`, "wrong");
    assert.match(bad.head, /^HTTP\/1\.1 401/);

    // Off-list cwd → 403, even authenticated.
    const off = await upgrade(relayPort, `/pty?cwd=${encodeURIComponent(os.homedir())}`, COOKIE);
    assert.match(off.head, /^HTTP\/1\.1 403/);
    assert.equal(stub.heads.length, 0, "nothing reached the deck yet");

    // The real thing.
    const good = await upgrade(
      relayPort,
      `/pty?cwd=${encodeURIComponent(GOOD_CWD)}&preset=claude&rows=24&cols=80`,
      COOKIE,
    );
    assert.match(good.head, /101/, "handshake relayed");
    assert.equal(stub.heads.length, 1);
    const forwarded = stub.heads[0];
    assert.ok(forwarded.includes(`token=${SECRET}`), "deck token injected");
    assert.ok(forwarded.includes("session=b-stride-console"), "session forced into the b- namespace");
    assert.ok(!/cookie:/i.test(forwarded), "the cookie never crosses the seam");

    // Post-handshake bytes splice both ways (stub echoes).
    await new Promise((resolve, reject) => {
      good.sock.once("data", (c) => {
        try {
          assert.equal(c.toString(), "ping-bytes");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      good.sock.write("ping-bytes");
      setTimeout(() => reject(new Error("no echo")), 2000);
    });
    good.sock.destroy();
  } finally {
    child.kill();
    stub.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
