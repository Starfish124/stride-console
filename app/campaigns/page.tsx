import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header } from "@/components/ui";
import { readCampaignsView } from "@/lib/channels/linkedHelper";
import { CampaignDeck } from "@/components/CampaignDeck";
import { CampaignCreator } from "@/components/CampaignCreator";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;
  const view = await readCampaignsView();

  const problem = view.offline ?? view.unavailable;

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="py-12">
          <p className="eyebrow text-slate">Campaigns</p>
          <h1 className="display mt-3 text-3xl text-ink">
            What Linked Helper is doing.
          </h1>
          <p className="mt-3 text-[15px] text-slate">
            Read from Linked Helper&apos;s own database, so the numbers hold
            whether or not the app is open. The controls reach the real thing.
          </p>
        </section>

        {problem && (
          <section className="mb-10 card-glass rounded-card border border-line bg-white p-6">
            <p className="eyebrow text-slate">Not reading</p>
            <p className="mt-2 text-sm text-ink">{problem}</p>
          </section>
        )}

        {!problem && view.campaignCount === 0 && (
          <section className="mb-10 card-glass rounded-card border border-line bg-white p-6">
            <p className="text-sm text-ink">
              No campaigns yet. Make one in Linked Helper and it appears here.
            </p>
          </section>
        )}

        {view.accounts.map((entry) => (
          <section key={String(entry.account.externalId)} className="mb-10">
            <CampaignDeck entry={entry} />

            <div className="mt-4">
              <CampaignCreator />
            </div>

            {entry.error && (
              <p className="mb-4 rounded-card border border-amber-200 bg-white p-4 text-sm text-amber-700">
                {entry.error}
              </p>
            )}

            {/* The deck carries the steps now, with what each one does and
                whether Linked Helper will actually run it. */}
          </section>
        ))}
      </main>
    </div>
  );
}
