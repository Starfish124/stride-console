import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { claudeCliPath, writerMode } from "@/lib/pipeline/write";
import { lessons } from "@/lib/pipeline/memory";
import { Header } from "@/components/ui";
import { SourcesEditor } from "@/components/SourcesEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;
  const mode = writerMode();
  const cli = claudeCliPath();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const learned = lessons();

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-12">
          <p className="eyebrow text-slate">Settings</p>
          <h1 className="display mt-3 text-3xl text-ink">Sources and keys.</h1>
        </section>

        <section className="mb-10 rounded-card border border-line bg-white p-6">
          <p className="eyebrow text-slate">Writing engine</p>
          {mode === "subscription" ? (
            <p className="mt-2 text-sm text-ink">
              Claude subscription, via the Claude Code CLI at{" "}
              <span className="font-mono text-[13px]">{cli}</span>. Drafts are
              written with the full voice guide on your existing plan, and lint
              failures trigger one automatic rewrite. No API key, no per-token
              billing.
            </p>
          ) : mode === "api" ? (
            <p className="mt-2 text-sm text-ink">
              Anthropic API. Drafts are written by{" "}
              <span className="font-mono text-[13px]">{model}</span> with the full
              voice guide, and lint failures trigger one automatic rewrite.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate">
              No writer found. Drafts fall back to deterministic templates marked
              &quot;needs polish&quot;, and each draft carries a copy-ready Claude
              prompt you can run manually. Install Claude Code (and log in with
              your subscription) to switch on the writer, or set
              ANTHROPIC_API_KEY in .env.local.
            </p>
          )}
        </section>

        <section className="mb-10 rounded-card border border-line bg-white p-6">
          <p className="eyebrow text-slate">Feedback memory</p>
          {learned.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-slate">
                What the recorded numbers taught the writer. These lessons ride
                along in every writing prompt.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {learned.map((l, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink">
                    <span className="eyebrow mt-0.5 text-indigo">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate">
              No lessons yet. Record the numbers on a few posted drafts and the
              writer starts learning from what worked. A lesson appears once a
              comparison has at least 2 posts on each side.
            </p>
          )}
        </section>

        <SourcesEditor />
      </main>
    </div>
  );
}
