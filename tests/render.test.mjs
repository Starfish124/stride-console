// Design engine tests: all three templates render to real PNGs and the carousel
// assembles into a PDF. Outputs land in data/test-renders/. Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  renderPng,
  assemblePdf,
  tldrTree,
  newsTree,
  mythCoverTree,
  mythSlideTree,
  realitySlideTree,
  mythClosingTree,
  renderToDir,
} from "../lib/pipeline/design.ts";

const OUT = path.join(process.cwd(), "data", "test-renders");
fs.mkdirSync(OUT, { recursive: true });

const fixtures = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "fixtures", "items.json"), "utf8"),
);
const titles = fixtures.map((i) => i.title);

test("TLDR template renders a PNG over 10KB", async () => {
  const png = await renderPng(tldrTree(30, titles));
  assert.ok(png.length > 10_000, `png was ${png.length} bytes`);
  fs.writeFileSync(path.join(OUT, "tldr.png"), png);
});

test("NEWS template renders a PNG over 10KB with a marked indigo word", async () => {
  const png = await renderPng(
    newsTree("The 40 percent *price* cut changes the math.", "40% — BATCH TIER", "JUL 23, 2026"),
  );
  assert.ok(png.length > 10_000, `png was ${png.length} bytes`);
  fs.writeFileSync(path.join(OUT, "news.png"), png);
});

test("MYTH slides render and assemble into a PDF", async () => {
  const pngs = [
    await renderPng(mythCoverTree(1)),
    await renderPng(mythSlideTree(1, "AI projects have to be big to be worth it")),
    await renderPng(
      realitySlideTree(1, "One scoped workflow, one owner, live in under 30 days."),
    ),
    await renderPng(mythClosingTree()),
  ];
  for (const png of pngs) assert.ok(png.length > 10_000);
  const pdf = await assemblePdf(pngs);
  assert.ok(pdf.length > 20_000, `pdf was ${pdf.length} bytes`);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  fs.writeFileSync(path.join(OUT, "myth.pdf"), pdf);
});

test("renderToDir writes the full myth carousel set", async () => {
  const dir = path.join(OUT, "carousel");
  const result = await renderToDir(
    {
      recipe: "myth",
      weekNumber: 30,
      imageHeadline: "Myth vs *reality*.",
      slides: [
        { myth: "You need perfect data first", reality: "Start with 1 workflow and the data you have." },
      ],
      mythSeq: 2,
    },
    dir,
  );
  // cover + 1 myth + 1 reality + closing = 4 slides
  assert.equal(result.images.length, 4);
  assert.equal(result.pdf, "myth.pdf");
  for (const img of result.images) {
    assert.ok(fs.statSync(path.join(dir, img)).size > 10_000);
  }
});
