import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceActions } from "../lib/workspace-overview.ts";
import {
  commandScore,
  isWorkspaceRoute,
  routeIsActive,
  workspaceLocation,
} from "../lib/workspace-nav.ts";
test("action queue includes overdue and today, excludes future and completed activity", () => {
  const entries = [
    {
      id: "late",
      date: "2026-09-05",
      title: "Late",
      actionable: true,
      href: "/clients/1",
    },
    { id: "today", date: "2026-09-06", title: "Today", actionable: true },
    { id: "future", date: "2026-09-07", title: "Future", actionable: true },
    { id: "done", date: "2026-09-01", title: "Done", actionable: false },
  ];
  const result = workspaceActions(entries, [], 0, "2026-09-06");
  assert.deepEqual(
    result.map((r) => r.id),
    ["late", "today"],
  );
  assert.equal(result[0].urgent, true);
  assert.equal(result[1].urgent, false);
  assert.equal(result[0].href, "/clients/1");
});
test("only drafts needing approval enter the queue, linking to the exact draft", () => {
  const result = workspaceActions(
    [],
    [
      { id: "d1", recipe: "tldr", status: "draft" },
      { id: "d2", recipe: "news", status: "approved" },
      { id: "d3", recipe: "myth", status: "posted" },
    ],
    2,
    "2026-09-06",
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].href, "/outreach#replies");
  assert.equal(result[1].href, "/drafts/d1");
});
test("empty state has no fabricated work", () => {
  assert.deepEqual(workspaceActions([], [], 0, "2026-09-06"), []);
});
test("public and print routes never receive founder chrome", () => {
  for (const path of [
    "/login",
    "/pitch",
    "/portal/token",
    "/invoices/1/print",
    "/clients/1/one-pager",
  ])
    assert.equal(isWorkspaceRoute(path), false, path);
  assert.equal(isWorkspaceRoute("/clients/1"), true);
});
test("active navigation does not confuse clients with similarly prefixed paths", () => {
  assert.equal(routeIsActive("/clients/1", "/clients"), true);
  assert.equal(routeIsActive("/clientship", "/clients"), false);
  assert.equal(routeIsActive("/drafts/1", "/"), false);
  assert.equal(workspaceLocation("/workspaces").label, "Projects");
});

test("command search ranks exact page names above descriptions", () => {
  assert.equal(commandScore("Calendar", "calendar"), 1);
  assert.equal(commandScore("Radar", "calendar", ["sources"]), 0);
  assert.ok(
    commandScore("Invoices", "inv") >
      commandScore("Projects", "inv", ["invoices"]),
  );
});
