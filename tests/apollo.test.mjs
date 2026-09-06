// The pull, which is the only thing in this repo that spends money.
//
// One enrichment is one credit and credits do not come back, so every test
// here is about NOT spending: the ceiling holds however wide the filter is,
// anyone already in the book is skipped before the paid call, and a failure
// stops rather than grinding through the rest of the budget.
//
// Nothing here touches the network. pullLeads takes its two calls as
// arguments precisely so this file can count them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = (p) => JSON.stringify(pathToFileURL(path.join(ROOT, p)).href);

const PREAMBLE = `
import fs from "node:fs";
import * as apollo from ${mod("lib/apollo.ts")};
import * as leads from ${mod("lib/leads.ts")};

/** A book on disk holding whichever ids the test says are already owned. */
function book(ids = []) {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/apollo-leads.json", JSON.stringify({
    list: { id: "l", name: "Test list", url: "" },
    filters: { location: "NL", industries: [], employees: "", titles: [] },
    poolSize: 0, exportedAt: "",
    leads: ids.map((id) => ({ id, name: "Held", title: "", company: "", companyDomain: "",
      employees: null, industry: "", city: "", country: "", email: "held@x.nl",
      emailStatus: "verified", linkedin: "", apolloUrl: "" })),
  }));
}

/** A page of teasers, all contactable unless said otherwise. */
const people = (n, from = 0, hasEmail = true) =>
  Array.from({ length: n }, (_, i) => ({ id: "p" + (from + i), title: "Ops", company: "Co", hasEmail }));

const out = (v) => console.log(JSON.stringify(v));
`;

function inSandbox(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stride-apollo-"));
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", `${PREAMBLE}\n${source}`], {
      cwd: dir, encoding: "utf8", env: { ...process.env, APOLLO_API_KEY: "test-key" },
    });
    return JSON.parse(stdout.trim().split("\n").pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the ceiling holds however many people the filter matches", () => {
  const r = inSandbox(`
    book();
    let enriched = 0;
    const res = await apollo.pullLeads({
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 10 },
      max: 1000,                                   // asking for far more than the ceiling
      search: async () => ({ ok: true, total: 50000, people: people(100) }),
      enrich: async (id) => { enriched += 1; return { ok: true, lead: {
        id, name: "A B", title: "", company: "", companyDomain: "", employees: null,
        industry: "", city: "", country: "", email: id + "@x.nl", emailStatus: "verified",
        linkedin: "", apolloUrl: "" } }; },
    });
    out({ enriched, added: res.added, ceiling: res.ceiling, pool: res.pool });
  `);
  // 50,000 matched and 1,000 were asked for. Ten were paid for.
  assert.equal(r.enriched, 10);
  assert.equal(r.added, 10);
  assert.equal(r.ceiling, 10);
});

test("a person already in the book is never enriched", () => {
  const r = inSandbox(`
    book(["p0", "p1", "p2"]);                      // already owned
    const paidFor = [];
    const res = await apollo.pullLeads({
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 3 },
      search: async () => ({ ok: true, total: 10, people: people(10) }),
      enrich: async (id) => { paidFor.push(id); return { ok: true, lead: {
        id, name: "A B", title: "", company: "", companyDomain: "", employees: null,
        industry: "", city: "", country: "", email: id + "@x.nl", emailStatus: "verified",
        linkedin: "", apolloUrl: "" } }; },
    });
    out({ paidFor, alreadyHeld: res.alreadyHeld });
  `);
  assert.equal(r.alreadyHeld, 3);
  // The three owned ids cost nothing; the money went on new people only.
  assert.deepEqual(r.paidFor, ["p3", "p4", "p5"]);
});

test("someone Apollo has no address for is skipped before paying", () => {
  const r = inSandbox(`
    book();
    let enriched = 0;
    const res = await apollo.pullLeads({
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 5 },
      // Page-aware, like the real API: one page of results, then nothing.
      search: async (_icp, page) => ({ ok: true, total: 4, people: page === 1 ? people(4, 0, false) : [] }),
      enrich: async () => { enriched += 1; throw new Error("must not be called"); },
    });
    out({ enriched, noEmail: res.noEmail, added: res.added });
  `);
  assert.equal(r.enriched, 0);
  assert.equal(r.noEmail, 4);
  assert.equal(r.added, 0);
});

test("a dry run spends nothing and writes nothing", () => {
  const r = inSandbox(`
    book();
    let enriched = 0;
    const before = fs.readFileSync("data/apollo-leads.json", "utf8");
    const res = await apollo.pullLeads({
      dryRun: true,
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 5 },
      search: async () => ({ ok: true, total: 99, people: people(20) }),
      enrich: async () => { enriched += 1; throw new Error("must not be called"); },
    });
    out({ enriched, wouldAdd: res.added, unchanged: fs.readFileSync("data/apollo-leads.json","utf8") === before });
  `);
  assert.equal(r.enriched, 0, "a dry run must not spend a credit");
  assert.equal(r.wouldAdd, 5);
  assert.ok(r.unchanged, "a dry run must not write the book");
});

test("a ceiling of zero pauses the pull without unloading anything", () => {
  const r = inSandbox(`
    book();
    let searched = 0;
    const res = await apollo.pullLeads({
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 0 },
      search: async () => { searched += 1; return { ok: true, total: 9, people: people(9) }; },
      enrich: async () => { throw new Error("must not be called"); },
    });
    out({ searched, enriched: res.enriched, problem: res.problem });
  `);
  assert.equal(r.searched, 0, "a zero ceiling should not even search");
  assert.equal(r.enriched, 0);
  assert.match(r.problem, /ceiling is zero/);
});

test("a failure stops the run instead of grinding through the budget", () => {
  const r = inSandbox(`
    book();
    let calls = 0;
    const res = await apollo.pullLeads({
      icp: { titles: [], locations: [], employeeRanges: [], keywords: [], perRun: 20 },
      search: async () => ({ ok: true, total: 99, people: people(20) }),
      enrich: async () => { calls += 1; return { ok: false, problem: "Apollo rejected the API key." }; },
    });
    out({ calls, added: res.added, problem: res.problem });
  `);
  // A bad key fails identically for all twenty. Trying once is enough.
  assert.equal(r.calls, 1);
  assert.equal(r.added, 0);
  assert.match(r.problem, /rejected the API key/);
});

test("a locked placeholder is not an address", () => {
  const r = inSandbox(`
    const locked = apollo.leadFromPerson({ id: "p1", name: "A B", email: "email_not_unlocked@domain.com",
      email_status: "unavailable", linkedin_url: "https://www.linkedin.com/in/ab",
      organization: { name: "Co", estimated_num_employees: 80 } });
    const real = apollo.leadFromPerson({ id: "p2", name: "C D", email: "c@x.nl", email_status: "verified",
      organization: { name: "Co2" } });
    out({ lockedEmail: locked.email, lockedKeepsProfile: locked.linkedin, employees: locked.employees, realEmail: real.email });
  `);
  // Dropped, so contactableCount and the sequencer both tell the truth.
  assert.equal(r.lockedEmail, "");
  // But the person is still worth having: the LinkedIn profile is the half
  // this list exists for, and it is not locked.
  assert.equal(r.lockedKeepsProfile, "https://www.linkedin.com/in/ab");
  assert.equal(r.employees, 80);
  assert.equal(r.realEmail, "c@x.nl");
});
