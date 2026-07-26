// Voice gate tests. Every rule must fire on a crafted bad sample and stay quiet
// on a good on-voice sample. Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { lint } from "../lib/pipeline/lint.ts";

function errorsFor(text, rule) {
  return lint(text).violations.filter((v) => v.rule === rule && v.severity === "error");
}

// A filler paragraph that keeps samples inside the hard length band without
// tripping any rule of its own.
const FILLER =
  "\n\nThe rollout took 3 weeks from the first call to the first live workflow, and the ops team owned it end to end from day one.\n\nWe measured the before and after for 30 days, then wrote up what changed for the client's monthly close, which used to take 4 people most of a week." +
  "\n\nThe automation now handles about 320 documents a day with a person reviewing anything above a set threshold, and the review queue takes 20 minutes." +
  "\n\nWhat surprised us was how fast the team started asking for the next workflow once the first one had run quietly for a couple of weeks." +
  "\n\nWe kept the scope to one handoff on purpose, because a small scope is what let us ship in weeks and measure something real at the end." +
  "\n\nThe client's ops lead now runs the weekly review herself, and the second workflow went live with 2 hours of our time." +
  "\n\nIf you want the same starting point, pick the one process your team complains about every single week and cost it in hours first.";

test("negationPivot: inline 'it's not about the tool, it's about the process'", () => {
  const bad = `We rebuilt the intake flow in 12 days.${FILLER}\n\nIt's not about the tool, it's about the process.`;
  assert.ok(errorsFor(bad, "negationPivot").length > 0);
});

test("negationPivot: 'not just X, but Y'", () => {
  const bad = `The pilot shipped in 21 days.${FILLER}\n\nThis was not just an experiment, but a working system.`;
  assert.ok(errorsFor(bad, "negationPivot").length > 0);
});

test("negationPivot: standalone 'It's not X. It's Y.' across sentences", () => {
  const bad = `The numbers landed this morning.${FILLER}\n\nIt's not magic. It's plumbing.`;
  assert.ok(errorsFor(bad, "negationPivot").length > 0);
});

test("bannedWords: 'We leverage cutting-edge synergies'", () => {
  const bad = `We shipped 4 automations this quarter.${FILLER}\n\nWe leverage cutting-edge synergies across the stack.`;
  const found = errorsFor(bad, "bannedWords");
  assert.ok(found.length >= 3, `expected >=3 banned words, got ${found.length}`);
});

test("bannedWords: single word 'delve' fires", () => {
  const bad = `The audit covered 14 workflows.${FILLER}\n\nLet me delve into the details of the setup.`;
  assert.ok(errorsFor(bad, "bannedWords").length > 0);
});

test("phantomSources: 'Studies show 90%...'", () => {
  const bad = `The team saved 11 hours a week.${FILLER}\n\nStudies show 90 percent of pilots stall before production.`;
  assert.ok(errorsFor(bad, "phantomSources").length > 0);
});

test("unanchoredBoosters: 'significantly faster' with no number nearby", () => {
  const bad = `The new queue cleared in 40 minutes.${FILLER}\n\nThe process is significantly faster than the manual version.`;
  assert.ok(errorsFor(bad, "unanchoredBoosters").length > 0);
});

test("unanchoredBoosters: booster WITH a number passes", () => {
  const good = `The new queue cleared in 40 minutes.${FILLER}\n\nThroughput moved significantly, up 38 percent in the first month.`;
  assert.equal(errorsFor(good, "unanchoredBoosters").length, 0);
});

test("emDash: two em-dashes fail", () => {
  const bad = `The build took 18 days — start to finish.${FILLER}\n\nThe result — fewer handoffs each week.`;
  assert.ok(errorsFor(bad, "emDash").length > 0);
});

test("emDash: a single em-dash is allowed", () => {
  const good = `The build took 18 days — start to finish.${FILLER}`;
  assert.equal(errorsFor(good, "emDash").length, 0);
});

test("emoji fails", () => {
  const bad = `The launch went live to 200 users 🚀 this week.${FILLER}`;
  assert.ok(errorsFor(bad, "emoji").length > 0);
});

test("exclamation fails", () => {
  const bad = `We shipped it in 9 days.${FILLER}\n\nWhat a week it was!`;
  assert.ok(errorsFor(bad, "exclamation").length > 0);
});

test("staccatoTriplet: three consecutive <=4-word sentences fail", () => {
  const bad = `The pilot paid for itself in 6 weeks.${FILLER}\n\nNo fluff. No filler. No wasted motion.`;
  assert.ok(errorsFor(bad, "staccatoTriplet").length > 0);
});

test("hookFold: first line over 140 chars fails", () => {
  const longHook =
    "This is a hook that keeps going and going and going well past the mobile fold because nobody edited it down to the length that actually shows up on a phone screen at 8am.";
  const bad = `${longHook}${FILLER}`;
  assert.ok(errorsFor(bad, "hookFold").length > 0);
});

test("length: 500 chars is a hard error", () => {
  const short = "We shipped a small thing in 3 days and it worked from the first run onward.";
  const found = lint(short).violations.filter((v) => v.rule === "length" && v.severity === "error");
  assert.ok(found.length > 0);
});

test("length: 1,000 chars warns but does not error", () => {
  const base = `The first automation went live in 19 days.${FILLER}`;
  const text = base.slice(0, 1000);
  const result = lint(text);
  const lengths = result.violations.filter((v) => v.rule === "length");
  assert.equal(lengths.length, 1);
  assert.equal(lengths[0].severity, "warn");
});

test("hashtags: four hashtags is an error", () => {
  const bad = `The pipeline ran clean for 30 days.${FILLER}\n\n#AI #Automation #Consulting #Growth`;
  assert.ok(errorsFor(bad, "hashtags").length > 0);
});

test("hashtags: mid-body hashtag warns", () => {
  const bad = `The pipeline ran clean for 30 days.${FILLER.replace("pick the one process", "pick the #AI process")}`;
  const found = lint(bad).violations.filter((v) => v.rule === "hashtags" && v.severity === "warn");
  assert.ok(found.length > 0);
});

test("needsNumber: digit-free body warns", () => {
  const noDigits = FILLER.replace(/\d+/g, "many");
  const bad = `The client asked a fair question about scope.${noDigits}`;
  const found = lint(bad).violations.filter((v) => v.rule === "needsNumber");
  assert.ok(found.length > 0);
});

test("paragraphs: a 3-sentence paragraph warns", () => {
  const bad = `The rollout went live on a Tuesday.${FILLER}\n\nWe started small on purpose. The scope stayed at one workflow for the whole build. The team shipped it without us in the room by week three.`;
  const found = lint(bad).violations.filter((v) => v.rule === "paragraphs");
  assert.ok(found.length > 0);
});

test("a good on-voice sample passes with zero errors", () => {
  const good = `An ops lead got 6 hours a week back from one small automation.${FILLER}\n\n#AI #Automation`;
  const result = lint(good);
  assert.equal(result.errors, 0, JSON.stringify(result.violations, null, 2));
  assert.ok(result.ok);
});

/* The AI-writing tells, from Wikipedia's WikiProject AI Cleanup list. These
   are the ones that survive every other edit because none of them looks like
   a mistake: they read as competent writing until you notice every LinkedIn
   post has them. */

test("ceremonyVerbs: 'serves as' where 'is' belongs", () => {
  const bad = `Our intake tool serves as the front door for 40 invoices a day.${FILLER}`;
  assert.ok(errorsFor(bad, "ceremonyVerbs").length > 0);
});

test("ceremonyVerbs: 'boasts a' is refused too", () => {
  const bad = `The workflow boasts a 92% match rate on 300 documents.${FILLER}`;
  assert.ok(errorsFor(bad, "ceremonyVerbs").length > 0);
});

test("ingAnalysis: a participle clause bolted on the end", () => {
  const bad = `We cut the review queue to 20 minutes, highlighting the value of a tight scope.${FILLER}`;
  assert.ok(errorsFor(bad, "ingAnalysis").length > 0);
});

test("ingAnalysis: 'ensuring' is the same trick", () => {
  const bad = `A person still checks anything above the threshold, ensuring nothing slips.${FILLER}`;
  assert.ok(errorsFor(bad, "ingAnalysis").length > 0);
});

test("falseDepth: phrases that promise a depth the next line never pays", () => {
  const bad = `At its core, the work took 3 weeks and one workflow.${FILLER}`;
  assert.ok(errorsFor(bad, "falseDepth").length > 0);
});

test("fakeCandour: announcing honesty is not being direct", () => {
  const bad = `Let's be honest, most teams never measure the 6 hours they lose.${FILLER}`;
  assert.ok(errorsFor(bad, "fakeCandour").length > 0);
});

test("falseRange: 'from X to Y' across no real scale warns", () => {
  const bad = `We handle everything from strategy to execution.${FILLER}`;
  const found = lint(bad).violations.filter((v) => v.rule === "falseRange");
  assert.ok(found.length > 0);
});

test("curlyQuotes: a paste from a chat window warns", () => {
  const bad = `The ops lead called it “the boring 6 hours” and she was right.${FILLER}`;
  const found = lint(bad).violations.filter((v) => v.rule === "curlyQuotes");
  assert.ok(found.length > 0);
});

test("the good sample still passes every new rule", () => {
  // The guard that matters: new rules must not start failing honest writing.
  const good = `An ops lead got 6 hours a week back from one small automation.${FILLER}\n\n#AI #Automation`;
  const result = lint(good);
  assert.equal(result.errors, 0, JSON.stringify(result.violations, null, 2));
});
