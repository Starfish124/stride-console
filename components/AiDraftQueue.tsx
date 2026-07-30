import { readAiDrafts } from "@/lib/channels/linkedHelper";
import { lintMessage } from "@/lib/outreach/lint";

/**
 * Linked Helper's AI writes a message per person and, with autoApprove off,
 * holds each one. This is that queue with the Stride voice gate applied to
 * every draft before a founder sees it.
 *
 * The point is not that the machine wrote them. It is that nothing written by
 * a machine goes out in your name without passing the same rules your posts
 * pass, and without one of you reading it.
 *
 * Approving happens in Linked Helper. The console reviews and flags; it does
 * not yet reach in and approve, because that runs over LH2's private P2P
 * transport rather than a callable method.
 */
export async function AiDraftQueue() {
  const { drafts, problem } = await readAiDrafts();

  const judged = drafts.map((draft) => ({
    draft,
    // Every AI message is a first touch unless the field says otherwise.
    lint: lintMessage(draft.text, "message", {
      isFirstTouch: /_1$/.test(draft.field),
    }),
  }));

  const failing = judged.filter((j) => j.lint.errors > 0);

  return (
    <section id="drafts" className="mb-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="display text-[22px] text-ink">Written by the machine.</h2>
        {drafts.length > 0 && (
          <p className="tabular text-[13px] text-slate">
            {failing.length} of {drafts.length} would fail the voice gate
          </p>
        )}
      </div>

      {problem && (
        <div className="card-glass rounded-card border border-line bg-white p-5">
          <p className="eyebrow text-slate">Not reading</p>
          <p className="mt-2 text-[15px] text-ink">{problem}</p>
        </div>
      )}

      {!problem && drafts.length === 0 && (
        <div className="card-glass rounded-card border border-line bg-white p-5">
          <p className="text-[15px] text-ink">
            No AI drafts waiting. They appear once a campaign reaches its
            personalised-message step, and only while Linked Helper is set to
            hold them for approval rather than send on its own.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {judged.map(({ draft, lint }) => (
          <li key={draft.id} className="card-glass rounded-card border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">
                {draft.name ?? `Person ${draft.personId}`}
              </span>
              {draft.headline && (
                <span className="text-[13px] text-slate">{draft.headline}</span>
              )}
              <span
                className={`eyebrow ml-auto ${lint.errors > 0 ? "text-red-600" : "text-emerald-600"}`}
              >
                {lint.errors > 0 ? `${lint.errors} to fix` : "clean"}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
              {draft.text}
            </p>

            <p className="tabular mt-2 text-[12px] text-slate">
              {draft.text.trim().length} characters · {draft.field}
              {draft.campaignName ? ` · ${draft.campaignName}` : ""}
            </p>

            {lint.violations.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {lint.violations.map((v, i) => (
                  <li
                    key={i}
                    className={`rounded-input border px-3 py-2 text-[13px] ${
                      v.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    <span className="eyebrow">{v.rule}</span>
                    <span className="mt-1 block">{v.fix}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
