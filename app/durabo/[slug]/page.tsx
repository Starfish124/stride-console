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
  const row = readRoster().find((r) => r.slug === slug);
  if (!row) notFound();

  const doc = readEmployee(slug);
  const steps = readFieldCard();
  const live = readLive().interviews[slug] ?? { checked: {} };
  const notes = readNotes(slug);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-8">
          <Link href="/durabo" className="eyebrow text-slate">
            ← Durabo · rooster
          </Link>
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
