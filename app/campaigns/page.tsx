import { cookies } from "next/headers";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header } from "@/components/ui";
import { readCampaignsView } from "@/lib/channels/linkedHelper";
import type { LhCampaign } from "@/lib/channels/linkedHelper";

export const dynamic = "force-dynamic";

const STATE_STYLES: Record<LhCampaign["state"], string> = {
  running: "bg-indigo-tint text-indigo border-indigo-tint",
  paused: "bg-white text-slate border-line",
  archived: "bg-white text-slate border-line",
  invalid: "bg-white text-amber-700 border-amber-200",
};

const STATE_WORDS: Record<LhCampaign["state"], string> = {
  running: "Running",
  paused: "Paused",
  archived: "Archived",
  invalid: "Not ready",
};

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
          <p className="mt-3 text-sm text-slate">
            Read straight from Linked Helper&apos;s own database, so this is
            true whether or not the app is open. Nothing on this page starts,
            pauses or changes a campaign.
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
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="display text-[19px] text-ink">
                {entry.account.name?.replace(/\s+/g, " ") ?? "Unknown account"}
              </h2>
              <p className="text-[13px] text-slate">{entry.account.email}</p>
            </div>

            <dl className="mb-5 grid grid-cols-3 gap-3">
              <div className="card-glass rounded-card border border-line bg-white p-4">
                <dt className="eyebrow text-slate">Profiles</dt>
                <dd className="tabular mt-1 text-xl text-ink">{entry.peopleCollected}</dd>
              </div>
              <div className="card-glass rounded-card border border-line bg-white p-4">
                <dt className="eyebrow text-slate">Daily cap</dt>
                <dd className="tabular mt-1 text-xl text-ink">{entry.dailyMax ?? "—"}</dd>
              </div>
              <div className="card-glass rounded-card border border-line bg-white p-4">
                <dt className="eyebrow text-slate">Campaigns</dt>
                <dd className="tabular mt-1 text-xl text-ink">{entry.campaigns.length}</dd>
              </div>
            </dl>

            {entry.error && (
              <p className="mb-4 rounded-card border border-amber-200 bg-white p-4 text-sm text-amber-700">
                {entry.error}
              </p>
            )}

            <ul className="flex flex-col gap-3">
              {entry.campaigns.map((campaign) => (
                <li
                  key={campaign.uuid}
                  className="card-lift card-glass rounded-card border border-line bg-white p-5"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-sm font-semibold text-ink">{campaign.name}</span>
                    <span
                      className={`eyebrow rounded-full border px-2 py-0.5 ${STATE_STYLES[campaign.state]}`}
                    >
                      {STATE_WORDS[campaign.state]}
                    </span>
                    <span className="eyebrow text-slate">{campaign.type}</span>
                  </div>

                  <p className="tabular mt-2 text-[13px] text-slate">
                    {campaign.people.toLocaleString("en-GB")} profile
                    {campaign.people === 1 ? "" : "s"} · {campaign.stepCount} step
                    {campaign.stepCount === 1 ? "" : "s"} · created {when(campaign.createdAt)}
                  </p>

                  {campaign.steps.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1">
                      {campaign.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-[13px] text-ink">
                          <span className="eyebrow text-indigo">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
