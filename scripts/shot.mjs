// Throwaway: screenshot a console page at a given width, so UI can be checked
// by looking at it rather than by hoping. node scripts/shot.mjs <path> <w> <h> <out>

import fs from "node:fs";
import { CdpSession } from "../bridge/cdp.mjs";
import { getPassword, sessionToken } from "../lib/auth.ts";

const [route = "/graph", width = "402", height = "874", out = "/tmp/shot.png"] =
  process.argv.slice(2);

const session = new CdpSession(9333);
const token = await sessionToken(getPassword());

await session.call("Network.enable");
await session.call("Network.setCookie", {
  name: "stride_session",
  value: token,
  url: "http://localhost:3000",
  path: "/",
});
await session.call("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: Number(width) < 700,
});
await session.call("Page.enable");
await session.call("Page.navigate", { url: `http://localhost:3000${route}` });
await new Promise((r) => setTimeout(r, 9000));

// Optional: click a point first, to check an interaction rather than a still.
const click = process.argv[6];
if (click) {
  const [cx, cy] = click.split(",").map(Number);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.call("Input.dispatchMouseEvent", {
      type,
      x: cx,
      y: cy,
      button: "left",
      clickCount: 1,
      pointerType: "mouse",
    });
  }
  await new Promise((r) => setTimeout(r, 2500));
}

const shot = await session.call("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(out);
process.exit(0);
