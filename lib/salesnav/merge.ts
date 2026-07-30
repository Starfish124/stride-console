// Merge fields, in Linked Helper's own {first_name} syntax.
//
// The syntax is not a preference. The DM gate already matches /\{[a-z_]+\}/gi
// as personalisation, and the founders have LH2's spelling in their fingers.
// A second syntax would silently trip the personalisation warn on every draft
// and break the muscle memory at the same time.
//
// An unresolved field is not softened into a blank. "Hi {first_name}," landing
// in a stranger's inbox is the classic disaster of this whole category, so it
// is reported and the send is refused.

import type { Client } from "../types.ts";

const FIELDS: Record<string, (client: Client) => string | undefined> = {
  first_name: (c) => c.name?.trim().split(/\s+/)[0],
  last_name: (c) => c.name?.trim().split(/\s+/).slice(1).join(" ") || undefined,
  full_name: (c) => c.name?.trim(),
  company: (c) => c.company?.trim(),
  role: (c) => c.role?.trim(),
  need: (c) => c.need?.trim(),
};

export const MERGE_FIELDS = Object.keys(FIELDS);

export function resolveMerge(text: string, client: Client): { text: string; missing: string[] } {
  const missing: string[] = [];
  const resolved = text.replace(/\{([a-z_]+)\}/gi, (whole, rawName: string) => {
    const name = rawName.toLowerCase();
    const value = FIELDS[name]?.(client);
    if (!value) {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    return value;
  });
  return { text: resolved, missing };
}
