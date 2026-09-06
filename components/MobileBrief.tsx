"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Mark, Ramp } from "@/components/Ramp";
import { BrandAtmosphere } from "@/components/BrandAtmosphere";
import { Working } from "@/components/Loader";
import { Glyph } from "@/components/icons";
import type { WorkspaceAction } from "@/lib/workspace-overview";

export function MobileBrief({ date, actions, activeClients, approvals, unpaid, doing }: {
  date: string; actions: WorkspaceAction[]; activeClients: number; approvals: number; unpaid: number; doing: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lane, setLane] = useState("idea");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const doneButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (saved) doneButton.current?.focus(); }, [saved]);
  const [notice, setNotice] = useState("");
  const urgent = actions.filter(a => a.urgent).length;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lane }) });
      if (!response.ok) throw new Error("Your note couldn’t be saved. Please try again.");
      setText(""); setSaved(true); setNotice("Saved to your shared notes board."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setSaving(false); }
  }
  return <section className="mobile-brief" aria-label="Your daily overview">
    <div className="brief-heading"><p>{date}<span className="brief-edition">STRIDE DAILY</span></p><h1>Your day.<br /><span>One clear view.</span></h1></div>
    <div className="daily-stage">
    <BrandAtmosphere />
    <Link href={actions[0]?.href ?? "/calendar"} className="brief-priority">
      <span className="brief-priority-top"><span><Ramp width={35} /> THE DAILY BRIEF</span></span>

      <span className="brief-state-label">{actions.length ? "A LITTLE FOCUS GOES A LONG WAY" : "MAKE ROOM FOR MORE"}</span>
      <strong>{actions.length ? <><span className="brief-action-number">{actions.length}</span><span className="brief-action-caption">{actions.length === 1 ? "thing needs you" : "things need you"}</span></> : <>Room to<br />think ahead.</>}</strong>
      <p>{urgent ? `${urgent} overdue · start with the most important.` : actions.length ? "Reviews and next steps, ready when you are." : "Check your schedule or start something new."}</p>
      <span className="brief-next"><span>{actions[0] ? actions[0].title : "Explore your day"}</span><Glyph name="IconChevron" size={16} /></span>
    </Link>
    </div>
    <div className="brief-counts">
      <Link href="/clients"><strong>{activeClients}</strong><span>Active clients</span></Link>
      <Link href="/library"><strong>{approvals}</strong><span>To review</span></Link>
      <Link href="/invoices"><strong>{unpaid}</strong><span>Unpaid invoices</span></Link>
    </div>
    <div className="brief-shortcuts" aria-label="Quick actions">
      <Dialog.Root open={open} onOpenChange={next => { if (!saving) { setOpen(next); setError(""); if (next) setSaved(false); } }}>
        <Dialog.Trigger asChild><button type="button"><Glyph name="IconBranch" size={22} /><span>Capture</span></button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="command-overlay sheet-overlay" /><Dialog.Content className="capture-sheet">
          <div className="sheet-handle" aria-hidden="true" /><div className="capture-heading"><Dialog.Title>{saved ? "A little more headspace." : "Get it out of your head."}</Dialog.Title><Dialog.Close className="capture-close" disabled={saving} aria-label="Close capture">×</Dialog.Close></div>
          <Dialog.Description>{saved ? "Your note is on the shared board, ready for both of you." : "Save an idea or next step to your shared board."}</Dialog.Description>
          {saved ? <div className="capture-success" role="status"><span className="capture-success-mark"><Mark size={54} /><span><Glyph name="IconApproved" size={22} /></span></span><h3>Captured. Keep moving.</h3><p>Good ideas deserve somewhere to land.</p><Dialog.Close ref={doneButton} className="primary-button">Back to my day<Glyph name="IconChevron" size={17} /></Dialog.Close><Link href="/notes" className="capture-success-link" onClick={() => setOpen(false)}>Open shared notes</Link></div> : <>
          <form onSubmit={save}>
            <label htmlFor="capture-note">Your note</label>
            <textarea id="capture-note" required value={text} onChange={e => setText(e.target.value)} placeholder="An idea, a client follow-up, something to do…" rows={4} disabled={saving} />
            <label htmlFor="capture-lane">Save as</label><select id="capture-lane" value={lane} onChange={e => setLane(e.target.value)} disabled={saving}><option value="idea">An idea</option><option value="todo">A to-do</option><option value="doing">In progress</option></select>
            {error && <p role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={saving || !text.trim()}>{saving ? <Working onDark>Saving your note</Working> : "Save to shared board"}</button>
          </form></>}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Link href="/ask"><Glyph name="IconAskStride" size={22} /><span>Ask Stride</span></Link>
      <Link href="#home-week"><Glyph name="IconTime" size={22} /><span>Schedule</span></Link>
      <Link href="#create-content"><Glyph name="IconBolt" size={22} /><span>Create</span></Link>
    </div>
    <p className="capture-notice" role="status">{notice && <><Glyph name="IconApproved" size={18} /><span>{notice}</span><Link href="/notes">View</Link></>}</p>
    {doing > 0 && <Link className="brief-working" href="/notes"><Glyph name="IconBranch" size={18} /><span>{doing} {doing === 1 ? "item" : "items"} in progress on your shared board</span><Glyph name="IconChevron" size={16} /></Link>}
  </section>;
}
