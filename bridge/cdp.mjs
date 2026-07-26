// A very small Chrome DevTools Protocol client.
//
// Linked Helper 2 is an Electron app. Launched with --remote-debugging-port it
// exposes exactly one page target: its own UI, served off an ephemeral local
// port. That renderer runs with nodeIntegration on, so evaluating JS inside it
// reaches window.require('electron').ipcRenderer — which is our way into LH2's
// main process. Everything the bridge does goes through evaluate() below.
//
// No dependencies on purpose: Node's global WebSocket is enough, and the
// console has a zero-paid-deps rule worth keeping.

const DEFAULT_PORT = Number(process.env.STRIDE_LH_CDP_PORT || 9222);
const CALL_TIMEOUT_MS = 15_000;

export class CdpError extends Error {
  constructor(message, code = "cdp_error") {
    super(message);
    this.name = "CdpError";
    this.code = code;
  }
}

/** Ask the debugger for its targets. Also our liveness check for LH2. */
export async function listTargets(port = DEFAULT_PORT) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new CdpError(
      `Nothing is listening on 127.0.0.1:${port}. Linked Helper is closed, or it was opened without --remote-debugging-port.`,
      "not_running",
    );
  }
  if (!res.ok) throw new CdpError(`Debugger returned HTTP ${res.status}`, "bad_response");
  return res.json();
}

/** The LH2 UI page. There is only ever one; anything else means a changed app. */
export async function findPageTarget(port = DEFAULT_PORT) {
  const targets = await listTargets(port);
  const pages = targets.filter((t) => t.type === "page");
  if (pages.length === 0) {
    throw new CdpError("Linked Helper is running but has no page yet — still starting up.", "no_page");
  }
  return pages[0];
}

/**
 * One CDP session, reused across calls. Reconnects by itself when Linked
 * Helper restarts, because its debug target changes identity every launch.
 */
export class CdpSession {
  #ws = null;
  #nextId = 0;
  #pending = new Map();
  #connecting = null;

  constructor(port = DEFAULT_PORT) {
    this.port = port;
  }

  get connected() {
    return this.#ws?.readyState === 1;
  }

  async #connect() {
    if (this.connected) return;
    if (this.#connecting) return this.#connecting;

    this.#connecting = (async () => {
      const target = await findPageTarget(this.port);
      const ws = new WebSocket(target.webSocketDebuggerUrl);

      await new Promise((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onError = () => {
          cleanup();
          reject(new CdpError("Could not open a debugger socket to Linked Helper.", "connect_failed"));
        };
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onError);
        };
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
      });

      ws.addEventListener("message", (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        const waiter = msg.id != null && this.#pending.get(msg.id);
        if (!waiter) return;
        this.#pending.delete(msg.id);
        waiter.resolve(msg);
      });

      const drop = () => {
        for (const { reject } of this.#pending.values()) {
          reject(new CdpError("Linked Helper closed the debugger connection.", "disconnected"));
        }
        this.#pending.clear();
        if (this.#ws === ws) this.#ws = null;
      };
      ws.addEventListener("close", drop);
      ws.addEventListener("error", drop);

      this.#ws = ws;
    })();

    try {
      await this.#connecting;
    } finally {
      this.#connecting = null;
    }
  }

  async #send(method, params = {}) {
    await this.#connect();
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new CdpError(`${method} did not answer within ${CALL_TIMEOUT_MS}ms.`, "timeout"));
      }, CALL_TIMEOUT_MS);

      this.#pending.set(id, {
        resolve: (msg) => { clearTimeout(timer); resolve(msg); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      try {
        this.#ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new CdpError(`Could not write to the debugger: ${err.message}`, "write_failed"));
      }
    });
  }

  /**
   * Run an expression inside the Linked Helper renderer and return its value.
   * The expression is awaited, so it may be async. Throwing inside the page
   * surfaces here as a CdpError rather than a silent undefined.
   */
  async evaluate(expression) {
    let msg;
    try {
      msg = await this.#send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
    } catch (err) {
      // A stale socket after an LH2 restart: drop it and try once more.
      if (err.code === "disconnected" || err.code === "write_failed") {
        this.close();
        msg = await this.#send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
      } else {
        throw err;
      }
    }

    if (msg.error) {
      throw new CdpError(msg.error.message || "Debugger rejected the call.", "protocol_error");
    }
    const details = msg.result?.exceptionDetails;
    if (details) {
      const text = details.exception?.description || details.text || "unknown error";
      throw new CdpError(`Linked Helper threw: ${text}`, "page_exception");
    }
    return msg.result?.result?.value;
  }

  /**
   * Any other CDP method — Input.dispatchMouseEvent in particular. Linked
   * Helper's row toolbars only appear under a genuine pointer, and React
   * ignores synthesised mouse events, so hovering has to be done for real.
   */
  async call(method, params = {}) {
    const msg = await this.#send(method, params);
    if (msg.error) throw new CdpError(msg.error.message || `${method} failed`, "protocol_error");
    return msg.result;
  }

  close() {
    try { this.#ws?.close(); } catch { /* already gone */ }
    this.#ws = null;
  }
}
