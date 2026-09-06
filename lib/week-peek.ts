/** UTC calendar dates keep the seven-day strip stable across time zones and DST. */
export function nextSevenDays(today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { iso:date.toISOString().slice(0,10), day:date.toLocaleDateString("en-GB", { weekday:"short",timeZone:"UTC" }), number:date.getUTCDate() };
  });
}
