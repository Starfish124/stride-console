"use client";
import { useState } from "react";
import Link from "next/link";
import { Glyph } from "@/components/icons";
import { nextSevenDays } from "@/lib/week-peek";
import { cn } from "@/lib/cn";

type Entry = { id: string; date: string; title: string; detail?: string; href: string };
export function WeekPeek({ today, entries }: { today: string; entries: Entry[] }) {
  const [selected, setSelected] = useState(today);
  const [direction, setDirection] = useState("forward");
  const [expanded, setExpanded] = useState(false);
  const days = nextSevenDays(today);
  const shown = entries.filter(e => e.date === selected);
  const label = selected === today ? "Today" : new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short",timeZone:"UTC"});
  return <section id="home-week" className="week-peek workspace-panel" aria-labelledby="week-peek-title">
    <div className="week-peek-heading"><h2 id="week-peek-title">A little look ahead</h2><Link href="/calendar" aria-label="Open full calendar"><Glyph name="IconChevron" size={18} /></Link></div>
    <div className="week-days" role="group" aria-label="Choose a day in the next week">{days.map(day => {
      const count = entries.filter(e => e.date === day.iso).length;
      return <button key={day.iso} type="button" className={cn("week-day",selected === day.iso && "is-selected")} aria-pressed={selected === day.iso} aria-label={`${day.day} ${day.number}, ${count} scheduled ${count === 1 ? "item" : "items"}${day.iso === today ? ", today" : ""}`} onClick={() => {setDirection(day.iso < selected ? "back" : "forward");setSelected(day.iso);setExpanded(false);}}><span>{day.day}</span><strong>{day.number}</strong><i className={cn(count > 0 && "has-events")} aria-hidden="true" /></button>;
    })}</div>
    <div className="week-agenda" key={selected} data-direction={direction}>
      <p className="week-agenda-label">{label}<span>{shown.length ? `${shown.length} scheduled` : "Nothing scheduled"}</span></p>
      <span className="sr-only" role="status">{label}: {shown.length} scheduled items</span>
      {shown.length ? <ul>{shown.slice(0,expanded ? shown.length : 2).map(entry => <li key={entry.id}><Link href={entry.href}><span className="week-event-line" aria-hidden="true" /><span><strong>{entry.title}</strong><small>{entry.detail}</small></span><Glyph name="IconChevron" size={15} /></Link></li>)}</ul> : <Link className="week-clear" href="/calendar"><Glyph name="IconTime" size={20} /><span>A little breathing room.<small>Open your calendar to plan the next step.</small></span><Glyph name="IconChevron" size={15} /></Link>}
      {shown.length > 2 && <button className="queue-expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `View all ${shown.length} items`}</button>}
    </div>
  </section>;
}
