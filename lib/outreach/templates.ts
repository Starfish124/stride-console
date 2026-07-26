// Linked Helper's campaign templates, read off its own wizard.
//
// Captured from Linked Helper 2.122.19 by opening "Create campaign" and
// recording the picker. The names must match the wizard's exactly, because
// that string is how the console finds the card to click. If LH2 renames one,
// creating that template fails loudly with "template not found" rather than
// picking whatever sat next to it.

export type TemplateCategory = "reach" | "collect" | "nurture";

export interface CampaignTemplate {
  /** Exactly as the wizard prints it. Used to find the card. */
  name: string;
  category: TemplateCategory;
  /** What it does, in our words rather than LH2's. */
  blurb: string;
  /** Does running this template message or invite real people? */
  reachesPeople: boolean;
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  reach: "Reach out and engage",
  collect: "Collect and organise data",
  nurture: "Grow and nurture relationships",
};

export const TEMPLATES: CampaignTemplate[] = [
  {
    name: "Empty campaign",
    category: "collect",
    blurb: "Nothing configured. Build the steps yourself in Linked Helper.",
    reachesPeople: false,
  },
  {
    name: "Invite and follow-up",
    category: "reach",
    blurb: "Connection request, then a message once they accept. The usual shape.",
    reachesPeople: true,
  },
  {
    name: "Messaging sequence",
    category: "reach",
    blurb: "A chain of messages to people you are already connected to.",
    reachesPeople: true,
  },
  {
    name: "InMail sequence",
    category: "reach",
    blurb: "Paid InMails to people outside your network. Costs credits.",
    reachesPeople: true,
  },
  {
    name: "Warm-up, invite, and follow-up",
    category: "reach",
    blurb: "Visit and engage first, then invite. Slower, and it lands better.",
    reachesPeople: true,
  },
  {
    name: "Invite and reach out via LinkedIn and email",
    category: "reach",
    blurb: "Invitation plus email, for people whose address was found.",
    reachesPeople: true,
  },
  {
    name: "Message chain to warmed-up 1st connections",
    category: "reach",
    blurb: "For connections who already engaged with something of yours.",
    reachesPeople: true,
  },
  {
    name: "Message sequence via event",
    category: "reach",
    blurb: "Message people who attended a LinkedIn event.",
    reachesPeople: true,
  },
  {
    name: "Message sequence via group",
    category: "reach",
    blurb: "Message members of a LinkedIn group.",
    reachesPeople: true,
  },
  {
    name: "Invite person to event",
    category: "nurture",
    blurb: "Invite people to a LinkedIn event you are running.",
    reachesPeople: true,
  },
  {
    name: "Invite 1st connections to group",
    category: "nurture",
    blurb: "Bring existing connections into a group.",
    reachesPeople: true,
  },
  {
    name: "Invite 1st connections to follow organizations",
    category: "nurture",
    blurb: "Ask connections to follow the company page.",
    reachesPeople: true,
  },
  {
    name: "Endorse 1st connections",
    category: "nurture",
    blurb: "Endorse skills. Quiet, and it often earns a reply on its own.",
    reachesPeople: true,
  },
  {
    name: "Like and comment on posts and articles",
    category: "nurture",
    blurb: "Engage with what your audience publishes.",
    reachesPeople: true,
  },
  {
    name: "Boost post",
    category: "nurture",
    blurb: "Ask connections to engage with one of your posts.",
    reachesPeople: true,
  },
  {
    name: "Follow profiles",
    category: "nurture",
    blurb: "Follow people without connecting. No notification to manage.",
    reachesPeople: true,
  },
  {
    name: "Export profile information",
    category: "collect",
    blurb: "Pull collected profiles out as data. Sends nothing.",
    reachesPeople: false,
  },
  {
    name: "Data Enrichment",
    category: "collect",
    blurb: "Fill in missing profile detail. Credits are charged only on success.",
    reachesPeople: false,
  },
  {
    name: "Visit & extract profiles",
    category: "collect",
    blurb: "Visit each profile for fuller data. Slower, and the visit is visible.",
    reachesPeople: true,
  },
  {
    name: "Find profile emails",
    category: "collect",
    blurb: "Look up email addresses for collected profiles.",
    reachesPeople: false,
  },
  {
    name: "Organizations extractor",
    category: "collect",
    blurb: "Pull the companies behind a set of profiles.",
    reachesPeople: false,
  },
  {
    name: "Employees extractor",
    category: "collect",
    blurb: "List the people who work at a set of companies.",
    reachesPeople: false,
  },
  {
    name: "Scrape messaging history",
    category: "collect",
    blurb: "Read your own past conversations into the database.",
    reachesPeople: false,
  },
  {
    name: "Send person to Snov.io",
    category: "collect",
    blurb: "Push profiles to Snov.io. Needs that integration set up.",
    reachesPeople: false,
  },
  {
    name: "Remove 1st-degree connections",
    category: "nurture",
    blurb: "Disconnect from people. Irreversible without a fresh invitation.",
    reachesPeople: true,
  },
];

export function templatesByCategory(category: TemplateCategory): CampaignTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function findTemplate(name: string): CampaignTemplate | undefined {
  return TEMPLATES.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
}
