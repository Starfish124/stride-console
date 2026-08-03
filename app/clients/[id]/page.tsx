import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/store";
import { STAGE_LABELS } from "@/lib/types";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";
import { ClientDetail } from "@/components/ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <Link href="/clients" className="eyebrow text-slate hover:text-indigo">
            ← The book
          </Link>
          <h1 className="title-large mt-3 text-ink">{client.company}</h1>
          <p className="mt-2 text-slate">
            {client.name}
            {client.role && ` · ${client.role}`} · {STAGE_LABELS[client.stage]}
          </p>
          <Link
            href={`/clients/${client.id}/workspace`}
            className="eyebrow mt-3 inline-block text-indigo hover:text-indigo-deep"
          >
            Workspace →
          </Link>
        </section>

        <ClientDetail client={client} deckUrl={process.env.STRIDE_DECK_URL} />
      </main>
    </div>
  );
}
