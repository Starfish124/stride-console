// The business timeline: yesterday's snapshot against today's stores, as
// plain sentences. Deterministic on purpose — a stage move is a fact, and no
// model should get to rephrase a fact.

interface ClientLike {
  id: string;
  name?: string;
  company?: string;
  stage?: string;
}

interface NoteLike {
  id: string;
  text?: string;
  lane?: string;
  by?: string;
}

function asArray<T>(value: unknown): T[] {
  return (
    Array.isArray(value) ? value.filter((v) => Boolean(v) && typeof v === "object") : []
  ) as T[];
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.filter((x) => typeof x.id === "string").map((x) => [x.id, x]));
}

function clientLabel(c: ClientLike): string {
  return [c.name, c.company].filter(Boolean).join(" at ") || c.id;
}

function noteLabel(n: NoteLike): string {
  const text = (n.text ?? "").trim().replace(/\s+/g, " ");
  return text.length > 80 ? `${text.slice(0, 80)}…` : text || n.id;
}

function diffClients(prev: ClientLike[], next: ClientLike[]): string[] {
  const before = byId(prev);
  const after = byId(next);
  const events: string[] = [];
  for (const c of next) {
    const old = before.get(c.id);
    if (!old) {
      events.push(`New in the pipeline: ${clientLabel(c)} (${c.stage ?? "no stage"}).`);
    } else if (old.stage !== c.stage) {
      events.push(`${clientLabel(c)} moved ${old.stage} → ${c.stage}.`);
    }
  }
  for (const c of prev) {
    if (!after.has(c.id)) events.push(`Removed from the pipeline: ${clientLabel(c)}.`);
  }
  return events;
}

function diffNotes(prev: NoteLike[], next: NoteLike[]): string[] {
  const before = byId(prev);
  const after = byId(next);
  const events: string[] = [];
  for (const n of next) {
    const old = before.get(n.id);
    if (!old) {
      events.push(
        `Note added${n.by ? ` by ${n.by}` : ""} in ${n.lane ?? "?"}: "${noteLabel(n)}"`,
      );
    } else if (old.lane !== n.lane) {
      events.push(`Note moved ${old.lane} → ${n.lane}: "${noteLabel(n)}"`);
    }
  }
  for (const n of prev) {
    if (!after.has(n.id)) events.push(`Note removed: "${noteLabel(n)}"`);
  }
  return events;
}

/**
 * Events between two snapshots of a named store. An unknown store name diffs
 * to nothing rather than to noise.
 */
export function diffSnapshots(name: string, prev: unknown, next: unknown): string[] {
  if (name === "clients") {
    return diffClients(asArray<ClientLike>(prev), asArray<ClientLike>(next));
  }
  if (name === "notes") {
    return diffNotes(asArray<NoteLike>(prev), asArray<NoteLike>(next));
  }
  return [];
}
