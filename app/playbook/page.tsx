import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header, Radar } from "@/components/ui";
import { VOICE_GUIDE, RECIPE_FORMULAS } from "@/lib/voice/guide";
import { RECIPE_LABELS } from "@/lib/types";
import type { RecipeId } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The playbook renders the LIVE voice modules — the exact strings that ship
 * inside every writer prompt and that the linter enforces. Edit the guide in
 * lib/voice/guide.ts and this page follows. It can never drift.
 */

interface GuideSection {
  title: string;
  intro: string[];
  bullets: string[];
}

function parseGuide(guide: string): { lead: string[]; sections: GuideSection[] } {
  const lines = guide.split("\n").slice(1); // drop the ALL-CAPS title line
  const lead: string[] = [];
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^(NEVER|ALWAYS)\b(.*)/);
    if (heading) {
      current = { title: heading[1], intro: [heading[2].replace(/^[\s:(]+|[):]+$/g, "")].filter(Boolean), bullets: [] };
      sections.push(current);
      continue;
    }
    if (line.startsWith("- ")) {
      current?.bullets.push(line.slice(2));
      continue;
    }
    (current ? current.intro : lead).push(line);
  }
  return { lead, sections };
}

const PALETTE: { name: string; hex: string; note: string }[] = [
  { name: "Indigo", hex: "#3D44D9", note: "The brand color. Buttons, links, the one emphasized word." },
  { name: "Indigo deep", hex: "#2A2FB0", note: "Hover states." },
  { name: "Indigo tint", hex: "#E9EAFB", note: "Approved badges, soft fills." },
  { name: "Ink", hex: "#101116", note: "Text. Posted badges." },
  { name: "Slate", hex: "#5E647B", note: "Secondary text, labels." },
  { name: "Paper", hex: "#F4F4F8", note: "The background everything sits on." },
  { name: "Line", hex: "#E3E4EC", note: "Borders, dividers." },
];

const WORKFLOW: { step: string; detail: string }[] = [
  { step: "It sources.", detail: "19 feeds swept, scored and deduped. Top stories read in full. See the Radar." },
  { step: "It writes.", detail: "The voice guide below ships inside every prompt. The linter enforces it deterministically." },
  { step: "You review.", detail: "Edit anything. The lint panel shows every violation before you approve." },
  { step: "You approve.", detail: "One founder presses approve. Nothing ever auto-posts." },
  { step: "You post.", detail: "Copy the variant for the page or your own profile. Links go in the first comment." },
  { step: "You record.", detail: "A day or two later, put the LinkedIn numbers on the draft. The writer learns from them." },
];

const CADENCE = [
  { when: "Monday", what: "The Stride TLDR — pregen has it drafted and waiting by morning." },
  { when: "Wednesday", what: "Breaking This Week — same, drafted by pregen." },
  { when: "Any day", what: "Myth vs Reality, from the myth bank, whenever a client call fills it." },
  { when: "1 in 10", what: "The promo slice. Event posts stay rare on purpose; the runner warns past the ratio." },
];

export default async function PlaybookPage() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;
  const { lead, sections } = parseGuide(VOICE_GUIDE);
  const recipes = Object.entries(RECIPE_FORMULAS) as [RecipeId, string][];

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <Radar className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 text-slate opacity-30" />
          <p className="eyebrow text-slate">Playbook</p>
          <h1 className="display mt-3 text-4xl text-ink">How Stride sounds.</h1>
          <p className="mt-2 max-w-lg text-slate">
            The brand system, from the source. Everything on this page is
            rendered from the same code that writes and lints every post — it
            cannot go out of date.
          </p>
        </section>

        <section>
          <h2 className="eyebrow text-slate">The voice</h2>
          {lead.map((p) => (
            <p key={p.slice(0, 40)} className="mt-3 max-w-3xl text-sm leading-relaxed text-ink">
              {p}
            </p>
          ))}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {sections.map((s) => (
              <div key={s.title} className="rounded-card border border-line bg-white p-5">
                <h3 className="display text-lg text-ink">
                  {s.title === "NEVER" ? "Never." : "Always."}
                </h3>
                {s.intro.map((p) => (
                  <p key={p.slice(0, 40)} className="mt-1 text-xs text-slate">
                    {p}
                  </p>
                ))}
                <ul className="mt-3 space-y-2.5">
                  {s.bullets.map((b) => (
                    <li key={b.slice(0, 60)} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          s.title === "NEVER" ? "bg-slate" : "bg-indigo"
                        }`}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="eyebrow text-slate">The formulas — one per recipe</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {recipes.map(([id, formula]) => {
              const [, ...steps] = formula.split("\n");
              return (
                <div key={id} className="rounded-card border border-line bg-white p-5">
                  <h3 className="display text-[17px] text-ink">{RECIPE_LABELS[id]}.</h3>
                  <ol className="mt-2.5 space-y-1.5">
                    {steps
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((s) => (
                        <li key={s.slice(0, 60)} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                          {/^\d/.test(s) ? (
                            <>
                              <span className="eyebrow shrink-0 pt-0.5 text-indigo">
                                {s.slice(0, s.indexOf("."))}
                              </span>
                              <span>{s.slice(s.indexOf(".") + 1).trim()}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate">{s}</span>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="eyebrow text-slate">The look</h2>
          <div className="mt-3 rounded-card border border-line bg-white p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {PALETTE.map((c) => (
                <div key={c.name}>
                  <div
                    className="h-14 rounded-input border border-line"
                    style={{ background: c.hex }}
                  />
                  <p className="mt-1.5 text-xs font-semibold text-ink">{c.name}</p>
                  <p className="font-mono text-[10px] text-slate">{c.hex}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
              <div>
                <p className="display text-xl text-ink">Archivo, heavy.</p>
                <p className="mt-0.5 text-xs text-slate">
                  Display type. Tight tracking. Headlines end with a period.
                </p>
              </div>
              <div>
                <p className="eyebrow text-ink">IBM PLEX MONO — LABELS</p>
                <p className="mt-0.5 text-xs text-slate">
                  The label voice: uppercase, wide tracking, small.
                </p>
              </div>
              <div>
                <p className="text-sm text-ink">
                  One word per visual gets <span className="font-bold text-indigo">indigo</span>.
                </p>
                <p className="mt-0.5 text-xs text-slate">
                  The radar rings are the background device. No emoji, no
                  exclamation marks, max 3 hashtags.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="eyebrow text-slate">The cadence</h2>
            <ul className="mt-3 overflow-hidden rounded-card border border-line bg-white">
              {CADENCE.map((c, i) => (
                <li
                  key={c.when}
                  className={`flex gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span className="eyebrow w-16 shrink-0 pt-0.5 text-indigo">{c.when}</span>
                  <span className="text-sm text-ink">{c.what}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="eyebrow text-slate">The workflow</h2>
            <ol className="mt-3 overflow-hidden rounded-card border border-line bg-white">
              {WORKFLOW.map((w, i) => (
                <li
                  key={w.step}
                  className={`flex gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span className="eyebrow w-6 shrink-0 pt-0.5 text-indigo">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-ink">
                    <span className="font-semibold">{w.step}</span> {w.detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
