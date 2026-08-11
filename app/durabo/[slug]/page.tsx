import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui";
import { DuraboInterview } from "@/components/DuraboInterview";
import { readEmployee, readFieldCard, readLive, readNotes, readRoster } from "@/lib/durabo/io";

export const dynamic = "force-dynamic";

export default async function DuraboPersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const roster = readRoster();
  const row = roster.find((r) => r.slug === slug);
  if (!row) notFound();

  // Neighbours in interview order, so a day of back-to-back conversations
  // never has to go via the roster between two people.
  const order = roster
    .filter((r) => r.date)
    .sort((a, b) => `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`));
  const at = order.findIndex((r) => r.slug === slug);
  const prev = at > 0 ? order[at - 1] : undefined;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : undefined;

  const doc = readEmployee(slug);
  const steps = readFieldCard();
  const live = readLive().interviews[slug] ?? { checked: {} };
  const notes = readNotes(slug);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/durabo" className="eyebrow text-slate">
              ← Durabo · rooster
            </Link>
            <span className="flex items-center gap-2">
              {prev && (
                <Link
                  href={`/durabo/${prev.slug}`}
                  title={`${prev.time ?? ""} ${prev.name}`}
                  className="pressable rounded-full border border-line bg-white px-3 py-1.5 text-xs text-slate hover:text-indigo"
                >
                  ← {prev.name.split(" ")[0]}
                </Link>
              )}
              {next && (
                <Link
                  href={`/durabo/${next.slug}`}
                  title={`${next.time ?? ""} ${next.name}`}
                  className="pressable rounded-full border border-line bg-white px-3 py-1.5 text-xs text-slate hover:text-indigo"
                >
                  {next.name.split(" ")[0]} →
                </Link>
              )}
            </span>
          </div>
          <h1 className="title-large mt-3 text-ink">{row.name}</h1>
          <p className="mt-1 text-slate">
            {row.department}
            {row.time ? ` · ${row.date} ${row.time}` : ""}
            {row.interviewer ? ` · ${row.interviewer}` : ""}
          </p>
        </section>
        <DuraboInterview slug={slug} steps={steps} initialLive={live} initialNotes={notes} prepHtml={doc.html} />
      </main>
    </div>
  );
}
