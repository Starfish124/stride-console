import { Header } from "@/components/ui";
import { BlueprintShelf } from "@/components/BlueprintShelf";
import { listBlueprints, listClients } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BlueprintsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-10">
          <p className="eyebrow text-slate">Blueprints</p>
          <h1 className="display mt-3 text-4xl text-ink">
            Build once. Sell it again.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Every agent and workflow that ever shipped for a client, shelved as
            a reusable spec: the problem, how it works, and a payload ready to
            start the next build from. Copy it, log who got it, and watch each
            blueprint earn its track record.
          </p>
        </section>
        <BlueprintShelf blueprints={listBlueprints()} clients={listClients()} />
      </main>
    </div>
  );
}
