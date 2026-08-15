// Stride's own particulars, written down once.
//
// The invoice, the vitals card and anything else that prints the company's
// details all read from here — the alternative is the IBAN living in four
// JSX files and one of them going stale. Values come from the invoice
// template the founders approved (pdf demo, 2026-07). Registration numbers
// are placeholders until the KvK paperwork lands; the invoice prints them
// with a warning until they change.

export const COMPANY = {
  name: "StrideAI",
  legalNote: "STRIDEAI · AMSTERDAM",
  contact: "Jort Hubers",
  city: "Amsterdam, Netherlands",
  email: "jort@stride-ai.nl",
  phone: "+31 6 34 11 43 11",
  site: "stride-ai.nl",

  payment: {
    iban: "NL78 INGB 0798 9711 26",
    bic: "INGBNL2A",
    holder: "J. Hubers",
  },

  registration: {
    kvk: "00000000",
    btw: "NL000000000B00",
    /** True while the numbers above are placeholders. The invoice says so. */
    placeholder: true,
  },

  invoice: {
    defaultDueDays: 30,
    vatRate: 21,
    terms: [
      "Payment within {days} days.",
      "Quote the invoice number as reference.",
      "Questions: jort@stride-ai.nl",
    ],
  },
} as const;

/** € 2.000,00 — Dutch grouping, always two decimals, as the template shows. */
export function euro(amount: number): string {
  return `€ ${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}
