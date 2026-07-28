import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/store";
import { Ramp, Mark } from "@/components/Ramp";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * The leave-behind, built from whatever is on the client's page.
 *
 * It is a printed page, not a screen: A4 proportions, the brand's type, and a
 * @media print block in globals.css that strips the console's chrome so the
 * browser's own Save as PDF produces the artefact. Generating a PDF in code
 * would mean a second layout engine and a second set of brand rules to keep in
 * step with this one, for a file the browser already knows how to make.
 *
 * What it will not do is invent. Any section the founder has not filled in is
 * left out rather than padded, because a one-pager with a confident paragraph
 * nobody wrote is the fastest way to lose a room.
 */

/** The three things Stride does, as the deck puts them. Fixed copy, not data. */
const WHAT_WE_DO = [
  {
    title: "Find the work worth automating",
    body: "We sit in your process for a week and come back with the handful of tasks where AI actually pays, and the ones where it does not.",
  },
  {
    title: "Build it, in your systems",
    body: "Working software on your own stack, not a pilot in someone else's tool. You keep the code and the data.",
  },
  {
    title: "Hand it over",
    body: "Your team runs it without us. We document, we train, and we leave the keys.",
  },
];

export default async function OnePager({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-paper">
      {/* Screen-only bar. The print block in globals.css takes it out. */}
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-6 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Link href={`/clients/${client.id}`} className="eyebrow text-slate hover:text-indigo">
          ← {client.company}
        </Link>
        <PrintButton />
      </div>

      <main className="sheet mx-auto my-6 max-w-[210mm] bg-white px-[18mm] py-[16mm] text-ink shadow-[0_1px_2px_rgba(16,17,22,0.05),0_24px_60px_-24px_rgba(16,17,22,0.3)] print:my-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <Mark size={30} className="text-indigo" />
            <p className="eyebrow mt-3 text-slate">Stride AI · prepared for</p>
            <h1 className="display mt-1 text-[30px] leading-tight text-ink">
              {client.company}
            </h1>
            <p className="mt-1 text-[14px] text-slate">
              {client.name}
              {client.role && `, ${client.role}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Ramp width={62} className="ml-auto text-indigo" />
            <p className="eyebrow mt-3 text-mute">{today}</p>
          </div>
        </header>

        {client.need && (
          <section className="mt-8">
            <p className="eyebrow text-slate">What you told us</p>
            <div className="slant-rule mt-2 w-9 text-indigo" />
            <p className="display mt-4 text-[21px] leading-snug text-ink">
              {client.need}
            </p>
          </section>
        )}

        {client.proposed && (
          <section className="mt-8">
            <p className="eyebrow text-slate">What we would do</p>
            <div className="slant-rule mt-2 w-9 text-indigo" />
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">
              {client.proposed}
            </p>
          </section>
        )}

        <section className="mt-9">
          <p className="eyebrow text-slate">How we work</p>
          <div className="slant-rule mt-2 w-9 text-indigo" />
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {WHAT_WE_DO.map((step, i) => (
              <div key={step.title}>
                <span className="figure block text-[26px] text-indigo">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-1.5 text-[14px] font-semibold leading-snug text-ink">
                  {step.title}
                </h2>
                <p className="mt-1 text-[13px] leading-snug text-slate">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {(client.value || client.nextStep) && (
          <section className="mt-9 rounded-card border border-line bg-paper px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-6">
              {client.value ? (
                <div>
                  <p className="eyebrow text-slate">Indicative</p>
                  <p className="figure mt-1 text-[28px] text-ink">
                    €{client.value.toLocaleString("en-GB")}
                  </p>
                </div>
              ) : null}
              {client.nextStep && (
                <div>
                  <p className="eyebrow text-slate">Next</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">
                    {client.nextStepNote ?? "We speak again"}
                    {", "}
                    {new Date(client.nextStep).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12px] text-slate">
          <span>Stride AI · stride-ai.nl</span>
          <span>
            {client.email ?? client.linkedin ?? "Jort Hubers and Sarvesh Singh"}
          </span>
        </footer>
      </main>
    </div>
  );
}
