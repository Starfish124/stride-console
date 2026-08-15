// What the local model is allowed to know.
//
// The model answering questions here is small — small enough that it will
// confidently invent anything it is not told. So it is never asked to recall:
// every answer is grounded in a fact sheet built fresh on each question, and
// the prompt tells it to say it does not know rather than reach past the sheet.
//
// The sheet is also worth something on its own. It is the console's whole
// state in one screen of plain text, which is why the page shows it next to
// the answer — a founder can check the model against it without leaving.

import {
  listClients,
  listDrafts,
  listEvents,
  listNotes,
  listPostLog,
  listSignups,
  overdueClients,
  pipelineValue,
} from "../store.ts";
import { listArticles, listAudits, listKeywords } from "../seo/store.ts";
import { readPulse } from "../channels/attention.ts";
import { addDays, buildCalendar, overdue, todayISO, upcoming } from "../calendar.ts";
import { MENU } from "../menu.ts";
import { STAGE_LABELS, LANE_LABELS, NOTE_LANES, CLIENT_STAGES } from "../types.ts";
import { renderPassages, retrieve } from "../brain/retrieve.ts";

/** A heading and its lines. Empty sections are dropped before rendering. */
interface Block {
  heading: string;
  lines: string[];
}

function render(blocks: Block[]): string {
  return blocks
    .filter((b) => b.lines.length > 0)
    .map((b) => `## ${b.heading}\n${b.lines.join("\n")}`)
    .join("\n\n");
}

export interface AskContext {
  /** The fact sheet, as the model sees it. */
  text: string;
  /** When it was built, so a stale tab is obvious. */
  at: string;
}

export async function buildContext(question?: string): Promise<AskContext> {
  const today = todayISO();
  const blocks: Block[] = [];

  // ---------- what the brain remembers about this question ----------
  //
  // The fact sheet used to be the model's entire world: today's counts,
  // nothing that happened before today. When a question is present, the
  // brain's hybrid retrieval adds the past — and when the brain is empty or
  // the embedder cold, this block simply is not there, which is the same
  // console that shipped before it existed.
  if (question?.trim()) {
    try {
      const remembered = renderPassages(await retrieve(question, { limit: 8 }), "");
      if (remembered) {
        blocks.push({
          heading: "What the console remembers about this",
          lines: remembered.split("\n").filter((l) => l.startsWith("- ")),
        });
      }
    } catch {
      /* memory down: the sheet still answers the present tense */
    }
  }

  // ---------- what this thing is ----------
  blocks.push({
    heading: "What the Stride Console is",
    lines: [
      "A private marketing and sales machine for Stride AI, run by two founders: Jort Hubers and Sarvesh Singh.",
      "It writes LinkedIn posts, runs LinkedIn outreach through Linked Helper 2, tracks the website's search performance, and keeps the client pipeline.",
      "Nothing is ever posted or sent automatically. A founder approves everything.",
      `Today is ${today}.`,
    ],
  });

  // ---------- the pages ----------
  blocks.push({
    heading: "Pages in the console",
    lines: MENU.flatMap((section) =>
      section.items.map((i) => `${section.label} · ${i.label} (${i.href}): ${i.hint}`),
    ),
  });

  // ---------- LinkedIn ----------
  // The machine is the one part that can be out of reach; when it is, say so
  // rather than let a stale number read as a live one.
  const pulse = await readPulse().catch(() => null);
  blocks.push({
    heading: "LinkedIn and Linked Helper",
    lines: !pulse
      ? ["The Linked Helper bridge could not be reached, so nothing about LinkedIn is known right now."]
      : !pulse.reachable
        ? ["Linked Helper is not reachable. Its numbers are unknown, not zero."]
        : [
            `${pulse.campaigns} campaigns exist, ${pulse.running} running.`,
            `${pulse.sending} of the running campaigns have armed steps that can actually message a person. The rest only research.`,
            `${pulse.people} profiles are queued across campaigns.`,
            pulse.dailyMax ? `The daily action cap is ${pulse.dailyMax}.` : "No daily cap is set.",
            pulse.licenceDaysLeft !== null
              ? `The Linked Helper licence has ${pulse.licenceDaysLeft} days left. Everything on LinkedIn stops when it lapses.`
              : "The licence state is unknown.",
            // What needs a person is deliberately NOT repeated here. readPulse
            // merges the email sequencer's items into the same list
            // (lib/channels/attention.ts), so printing them under this heading
            // told the model the sequencer was part of LinkedIn — and it duly
            // reported the machine as stopped because email sending was. They
            // live in their own section at the top of the sheet instead.
          ],
  });

  // ---------- content ----------
  const drafts = listDrafts();
  const postLog = listPostLog();
  const withStats = postLog.filter((p) => p.stats);
  blocks.push({
    heading: "Content and posts",
    lines: [
      `${drafts.length} drafts have been written. ${drafts.filter((d) => d.status === "draft").length} still need approving, ${drafts.filter((d) => d.status === "approved").length} are approved, ${drafts.filter((d) => d.status === "posted").length} have been posted.`,
      `${postLog.length} posts have gone out. ${withStats.length} have numbers recorded.`,
      drafts[0]
        ? `The most recent draft is a ${drafts[0].recipe} written on ${drafts[0].createdAt.slice(0, 10)}.`
        : "No drafts have been written yet.",
    ],
  });

  // ---------- website ----------
  const audits = listAudits();
  const keywords = listKeywords();
  const articles = listArticles();
  const avgScore = audits.length
    ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length)
    : null;
  blocks.push({
    heading: "The website, stride-ai.nl",
    lines: [
      avgScore !== null
        ? `${audits.length} pages have been checked. The average on-page score is ${avgScore} out of 100.`
        : "No pages have been checked yet.",
      `${keywords.length} keywords are tracked.`,
      `${articles.length} articles have been written: ${articles.filter((a) => a.status === "published").length} published, ${articles.filter((a) => a.status !== "published" && a.status !== "rejected").length} still waiting to be published.`,
      // The panel on the front page makes this distinction and so must the
      // model: no measurement and no traffic look identical and mean opposite
      // things.
      "Google Search Console is not connected, so there are no click or impression numbers. That means traffic is unmeasured, not that it is zero.",
    ],
  });

  // ---------- clients ----------
  const clients = listClients();
  const totals = pipelineValue(clients);
  const late = overdueClients(clients, today);
  blocks.push({
    heading: "Clients and leads",
    lines: [
      `${clients.length} ${clients.length === 1 ? "person is" : "people are"} in the book.`,
      ...CLIENT_STAGES.map((s) => {
        const inStage = clients.filter((c) => c.stage === s);
        if (inStage.length === 0) return "";
        return `${STAGE_LABELS[s]}: ${inStage.length} — ${inStage.map((c) => c.company).join(", ")}.`;
      }).filter(Boolean),
      `€${(totals.lead + totals.talking + totals.proposal).toLocaleString("en-GB")} is still in play. €${totals.client.toLocaleString("en-GB")} has been won.`,
      late.length > 0
        ? `${late.length} owe a reply: ${late.map((c) => `${c.company} (${c.nextStepNote ?? "next step"} was due ${c.nextStep})`).join("; ")}.`
        : "Nobody is owed a reply right now.",
    ],
  });

  // ---------- calendar ----------
  const events = listEvents();
  const signups = listSignups();
  const calendar = buildCalendar(
    {
      clients,
      events,
      signups,
      postLog,
      licenceExpiry:
        pulse?.licenceDaysLeft != null ? addDays(today, pulse.licenceDaysLeft) : undefined,
    },
    today,
  );
  blocks.push({
    heading: "The calendar",
    lines: [
      ...overdue(calendar, today).map((e) => `Late since ${e.date}: ${e.title}${e.detail ? ` (${e.detail})` : ""}.`),
      ...upcoming(calendar, today, 8).map((e) => `${e.date}: ${e.title}${e.detail ? ` (${e.detail})` : ""}.`),
    ],
  });

  // ---------- events ----------
  blocks.push({
    heading: "Events",
    lines: [
      `${events.length} events exist and ${signups.length} people have signed up through the public page.`,
      ...events.map(
        (e) =>
          `${e.title} on ${e.date} at ${e.venue}, ${e.capacity} places. ${e.checklist.filter((i) => !i.done).length} prep items still open.`,
      ),
    ],
  });

  // ---------- the board ----------
  const notes = listNotes();
  blocks.push({
    heading: "The shared notes board",
    lines:
      notes.length === 0
        ? ["The board is empty."]
        : NOTE_LANES.map((lane) => {
            const inLane = notes.filter((n) => n.lane === lane);
            if (inLane.length === 0) return "";
            return `${LANE_LABELS[lane]} (${inLane.length}): ${inLane.map((n) => n.text).join(" | ")}`;
          }).filter(Boolean),
  });

  // ---------- the lede ----------
  // Measured, not guessed: asked "what needs me today", every model tried
  // (qwen2.5:3b, hermes3:8b, qwen3:8b) answered from the notes board and the
  // licence date and missed the blocked campaign entirely. The facts were all
  // present — buried under a twenty-four line menu, a third of the way down.
  // So the answer to the question the page leads with now leads the sheet.
  // These lines repeat what the sections below say in full; that is the job.
  const waiting = [
    ...(pulse?.items ?? []).map((i) => `${i.urgency}: ${i.title} — ${i.detail}`),
    ...late.map(
      (c) => `blocked: ${c.company} is owed a reply — ${c.nextStepNote ?? "next step"} was due ${c.nextStep}.`,
    ),
    ...overdue(calendar, today).map((e) => `blocked: ${e.title} was due ${e.date}.`),
    ...(drafts.filter((d) => d.status === "draft").length > 0
      ? [
          `waiting: ${drafts.filter((d) => d.status === "draft").length} drafts need approving before anything can be posted.`,
        ]
      : []),
  ];
  blocks.splice(1, 0, {
    heading: "What needs a person right now",
    lines:
      waiting.length > 0
        ? [
            "Ranked, most urgent first. This is the answer to what needs doing today.",
            "These come from every part of the machine at once — LinkedIn, the email sequencer, the client book and the calendar. Use them to say what a founder should do. Do not use them to describe what any one channel is doing; the sections below cover that.",
            ...waiting,
          ]
        : ["Nothing is waiting on a person right now."],
  });

  return { text: render(blocks), at: new Date().toISOString() };
}

/**
 * The rule the model works under.
 *
 * Two things carry the weight: everything comes from the sheet, and unknown is
 * a real answer. A small model given permission to say "that is not in here"
 * is far more useful than one that guesses to be helpful.
 */
export const SYSTEM_PROMPT = [
  "You answer questions about the Stride Console for the two founders who own it.",
  "",
  "Rules:",
  "- Every fact in your answer must come from the notes below. Nothing else.",
  // Without this the model reads the whole sheet and answers "what needs
  // doing" from whatever it found most quotable, which was the notes board.
  "- When asked what needs doing, what is urgent, or what to do today, answer from the section called What needs a person right now, most urgent first. Say it in sentences, do not copy the lines.",
  "- If the notes do not cover it, say exactly what is missing and point at the page that would show it. Never guess a number.",
  "- Where the notes say something is unknown or unreachable, say that. Do not report it as zero.",
  "- Be brief. Two or three sentences unless asked for more.",
  "- Plain words. No em dashes, no marketing language, no bullet lists unless asked.",
].join("\n");

/**
 * The fact sheet for ONE client: everything the console knows about them, in
 * one screen of text, so the model can walk a founder (or the client
 * themselves, screen-shared) through the whole engagement without inventing
 * a word. Same grounding rules as the console sheet: what is not on the
 * sheet does not exist.
 */
export async function buildClientContext(
  clientId: string,
  question?: string,
): Promise<AskContext | undefined> {
  const { getClient, listInvoices, listBlueprints } = await import("../store.ts");
  const { listProjects, listRuns } = await import("../workspace/store.ts");
  const { invoiceTotal } = await import("../types.ts");
  const { euro } = await import("../company.ts");

  const client = getClient(clientId);
  if (!client) return undefined;
  const who = client.company || client.name;
  const blocks: Block[] = [];

  blocks.push({
    heading: `Who ${who} is`,
    lines: [
      `${client.name}${client.role ? ` (${client.role})` : ""} at ${client.company || "—"}. Stage: ${STAGE_LABELS[client.stage]}.`,
      client.need ? `What they need, in our words: ${client.need}` : "",
      client.proposed ? `What we proposed: ${client.proposed}` : "",
      client.value ? `Deal size said out loud: €${client.value}.` : "",
      client.nextStep ? `Next step we owe them: ${client.nextStepNote ?? "next step"} on ${client.nextStep}.` : "",
    ].filter(Boolean),
  });

  const touches = [...(client.touches ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  blocks.push({
    heading: "The last things that happened",
    lines: touches.slice(0, 8).map((t) => `${t.at}: ${t.note}${t.who ? ` (${t.who})` : ""}`),
  });

  const projects = listProjects(clientId);
  blocks.push({
    heading: "Projects on the machine",
    lines: projects.map((p) => `${p.name}`),
  });
  const runs = projects
    .flatMap((p) => listRuns(p.id).map((r) => ({ p, r })))
    .sort((a, b) => (b.r.startedAt ?? "").localeCompare(a.r.startedAt ?? ""))
    .slice(0, 10);
  blocks.push({
    heading: "Recent delivery work",
    lines: runs.map(
      ({ p, r }) => `${(r.startedAt ?? "").slice(0, 10)} · ${p.name}: ${r.task.slice(0, 110)} (${r.status})`,
    ),
  });

  const invoices = listInvoices().filter((i) => i.clientId === clientId);
  blocks.push({
    heading: "Invoices",
    lines: invoices.map((i) => `${i.number} · ${i.date} · ${i.status} · ${euro(invoiceTotal(i))}`),
  });

  const reused = listBlueprints().filter((b) =>
    b.uses.some((u) => u.client.toLowerCase() === who.toLowerCase()),
  );
  blocks.push({
    heading: "Blueprints deployed for them",
    lines: reused.map((b) => `${b.name}: ${b.oneLiner}`),
  });

  // What the brain remembers about them: entity-filtered first, then a text
  // pass carrying their name, so transcripts and replies filed under a slug
  // rather than the client id still surface.
  try {
    const passages = await retrieve(question?.trim() ? `${who} ${question}` : who, { limit: 8 });
    const remembered = renderPassages(passages, "");
    if (remembered) {
      blocks.push({
        heading: "What the brain remembers about them",
        lines: remembered.split("\n").filter((l) => l.startsWith("- ")),
      });
    }
  } catch {
    /* memory down: the sheet still covers the present */
  }

  return { text: `# Everything about ${who}\n\n${render(blocks)}`, at: new Date().toISOString() };
}
