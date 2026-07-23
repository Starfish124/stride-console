// No-network end-to-end proof: fixture items -> template writer -> voice gate ->
// design engine -> data/demo/{tldr.png,news.png,myth.pdf}. Run: node scripts/demo.mjs

import fs from "node:fs";
import path from "node:path";
import { templateWrite } from "../lib/pipeline/write.ts";
import { lint, formatViolations } from "../lib/pipeline/lint.ts";
import { assembleVariant } from "../lib/pipeline/run.ts";
import { renderToDir } from "../lib/pipeline/design.ts";
import { isoWeek } from "../lib/pipeline/source.ts";

const OUT = path.join(process.cwd(), "data", "demo");
fs.mkdirSync(OUT, { recursive: true });

const items = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "fixtures", "items.json"), "utf8"),
);
const weekNumber = isoWeek();

const myth = {
  id: "myth_demo",
  text: "AI replaces people",
  addedAt: new Date().toISOString(),
  used: true,
};

function banner(label) {
  console.log(`\n${"=".repeat(72)}\n${label}\n${"=".repeat(72)}`);
}

const runs = [
  { recipe: "tldr", input: { items, weekNumber } },
  { recipe: "news", input: { items, weekNumber } },
  { recipe: "myth", input: { items: [], myth, weekNumber } },
];

for (const { recipe, input } of runs) {
  banner(`RECIPE: ${recipe.toUpperCase()}`);
  const out = templateWrite(recipe, input);
  const text = assembleVariant(out.body, out.hashtags);
  console.log(text);

  const result = lint(text);
  console.log(`\nVOICE GATE: ${result.errors} errors, ${result.warns} warns`);
  if (result.violations.length > 0) console.log(formatViolations(result));
  if (result.errors > 0) {
    console.error(`\nFAIL: the ${recipe} template draft has blocking violations.`);
    process.exit(1);
  }

  const rendered = await renderToDir(
    {
      recipe,
      weekNumber,
      titles: items.map((i) => i.title),
      imageHeadline: out.imageHeadline,
      imageStat: out.imageStat,
      slides: out.slides,
      mythSeq: 1,
    },
    OUT,
  );
  console.log(
    `RENDERED: ${[...rendered.images, rendered.pdf].filter(Boolean).join(", ")}`,
  );
}

banner("DEMO OUTPUTS");
for (const file of ["tldr.png", "news.png", "myth.pdf"]) {
  const full = path.join(OUT, file);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${full}`);
    process.exit(1);
  }
  console.log(`${file}  ${(fs.statSync(full).size / 1024).toFixed(0)} KB  ${full}`);
}
console.log("\nThe machine works with zero external accounts.");
