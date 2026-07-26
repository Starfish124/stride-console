import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header } from "@/components/ui";
import { readCampaignsView } from "@/lib/channels/linkedHelper";
import { CampaignDeck } from "@/components/CampaignDeck";

export const dynamic = "force-dynamic";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
            Read straight from Linked Helper&apos;s own database, so the numbers
            are true whether or not the app is open. The runner controls do
            reach the real thing: starting it begins every campaign that is not
            paused, at whatever daily cap the account is set to.
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

            {entry.error && (
              <p className="mb-4 rounded-card border border-amber-200 bg-white p-4 text-sm text-amber-700">
                {entry.error}
              </p>
            )}

            {/* The deck above carries state and counts. These are the steps,
                which it deliberately leaves out to stay readable. */}
            {entry.campaigns.some((c) => c.steps.length > 0) && (
              <ul className="flex flex-col gap-3">
                {entry.campaigns
                  .filter((campaign) => campaign.steps.length > 0)
                  .map((campaign) => (
                    <li
                      key={campaign.uuid}
                      className="card-glass rounded-card border border-line bg-white p-5"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="display text-[17px] text-ink">{campaign.name}</span>
                        <span className="eyebrow text-slate">
                          created {when(campaign.createdAt)}
                        </span>
                      </div>
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {campaign.steps.map((step, i) => (
                          <li key={i} className="flex gap-2.5 text-[13px] text-ink">
                            <span className="eyebrow text-indigo">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
