import Link from "next/link";
import { cookies } from "next/headers";
import { listDrafts, listMyths } from "@/lib/store";
import { FOUNDER_COOKIE } from "@/lib/auth";
import { Header, Radar, StatusBadge } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { MythQuickAdd } from "@/components/MythQuickAdd";

export const dynamic = "force-dynamic";

const RECIPES = [
  {
    index: "01",
    id: "tldr",
    title: "The Stride TLDR.",
    description: "5-7 curated items from this week's AI sources, one line each.",
  },
  {
    index: "02",
    id: "news",
    title: "Breaking This Week.",
    description: "The week's biggest AI story and what it means for operators.",
  },
  {
    index: "03",
    id: "myth",
    title: "Myth vs Reality.",
    description: "Long-form original thinking plus a branded carousel, from the myth bank.",
  },
] as const;

const RECIPE_LABELS: Record<string, string> = {
  tldr: "The Stride TLDR",
  news: "Breaking This Week",
  myth: "Myth vs Reality",
};

export default async function Dashboard() {
  const jar = await cookies();
  const founder = jar.get(FOUNDER_COOKIE)?.value;
  const drafts = listDrafts().slice(0, 8);
  const unusedMyths = listMyths().filter((m) => !m.used).length;

  return (
    <div className="min-h-screen bg-paper">
      <Header founder={founder} />
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="relative overflow-hidden py-12">
          <Radar className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 text-slate opacity-30" />
          <p className="eyebrow text-slate">Stride console — marketing machine</p>
          <h1 className="display mt-3 text-4xl text-ink">
            Press a button. Get a post.
          </h1>
          <p className="mt-2 max-w-lg text-slate">
            Two posts a week, written in the Stride voice, designed on-brand,
            approved by one of you before anything goes anywhere.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {RECIPES.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </section>

        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <p className="eyebrow text-slate">Myth bank</p>
            <h2 className="mt-2 text-xl font-bold text-ink">
              Heard a myth in a client call.
            </h2>
            <p className="mb-4 mt-1 text-sm text-slate">
              Ten seconds now, a long-form post later. {unusedMyths} unused in the
              bank.
            </p>
            <MythQuickAdd />
          </div>
          <div>
            <p className="eyebrow text-slate">Recent drafts</p>
            <h2 className="mt-2 mb-4 text-xl font-bold text-ink">The last runs.</h2>
            {drafts.length === 0 ? (
              <p className="rounded-card border border-line bg-white p-6 text-sm text-slate">
                Nothing yet. Run a recipe above and the draft lands here.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-card border border-line bg-white">
                {drafts.map((d, i) => (
                  <li key={d.id} className={i > 0 ? "border-t border-line" : ""}>
                    <Link
                      href={`/drafts/${d.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-paper"
                    >
                      <span className="eyebrow text-indigo">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {RECIPE_LABELS[d.recipe]}
                        </span>
                        <span className="block text-xs text-slate">
                          {new Date(d.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
