import { webhookSecret } from "@/lib/outreach/replies";
import { IconKey } from "@/components/icons";

/**
 * The URL Linked Helper posts replies to.
 *
 * Rendered on the server and shown in full, because a founder has to paste it
 * into LH2's webhook field by hand. The secret in it is the only guard on a
 * publicly reachable endpoint, so it belongs behind the login and nowhere else.
 */
export function WebhookCard({ origin }: { origin: string }) {
  const url = `${origin}/api/hooks/linked-helper?token=${webhookSecret()}`;

  return (
    <section className="card-glass mb-10 rounded-card border border-line bg-white p-6">
      <p className="eyebrow flex items-center gap-2 text-slate"><IconKey size={15} className="text-indigo" />Replies webhook</p>
      <p className="mt-2 text-sm text-slate">
        In Linked Helper, add a &quot;send to webhook&quot; action to a campaign
        and paste this as the URL. Replies then land in Outreach.
      </p>
      <p className="mt-3 overflow-x-auto rounded-input border border-line bg-paper px-3 py-2 font-mono text-[12px] text-ink">
        {url}
      </p>
      <p className="mt-2 text-[13px] text-slate">
        Treat it like a password. Anyone holding this link can post replies into
        your inbox. Delete data/hooks.json and restart to issue a new one. That
        only moves this URL. The key that signs unsubscribe links lives in its
        own file and is not touched, so links already sitting in somebody inbox
        keep working.
      </p>
    </section>
  );
}
