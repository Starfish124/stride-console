/**
 * The dashboards, on one rail.
 *
 * This is a server component and it has to stay one. Marking it "use client"
 * would pull every slide into the client bundle with it, and the LinkedIn
 * slide reads the bridge: the page would go back to waiting forty seconds on
 * Linked Helper before it painted anything. tests/deck.test.mjs guards that.
 *
 * There is no carousel here at all. A CSS scroll-snap rail gives swipe,
 * momentum, keyboard arrows and anchor jumps for free, so nothing unmounts,
 * nothing measures, and each slide keeps whatever Suspense boundary it
 * arrived with.
 */

export interface DeckSlide {
  /** Anchor target, so the tab strip can be plain links. */
  id: string;
  label: string;
  panel: React.ReactNode;
}

export function PanelDeck({ slides }: { slides: DeckSlide[] }) {
  if (slides.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Dashboards"
      className="deck -mx-4 mb-7 sm:mx-0"
      style={{ "--deck-n": slides.length } as React.CSSProperties}
    >
      {/* A segmented control rather than a row of bare links. The old strip
          gave no press, no focus ring and no sense of being one control, which
          is most of why the rail read as unfinished. */}
      <nav className="deck-tabs" aria-label="Dashboards">
        {slides.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="deck-tab pressable">
            {s.label}
          </a>
        ))}
      </nav>

      {/* Position, two ways. The dots say how many panels there are even when
          nothing is moving; the pill rides the finger where scroll-driven
          animation exists and sits at the left as a 1/n mark where it does
          not. Neither ever animates on its own. */}
      <div aria-hidden className="deck-progress">
        <div className="deck-dots">
          {slides.map((s) => (
            <span key={s.id} />
          ))}
        </div>
        <div className="deck-bar">
          <span />
        </div>
      </div>

      <ol className="deck-rail" tabIndex={0} role="group" aria-label="Dashboard panels">
        {slides.map((s) => (
          <li key={s.id} id={s.id} tabIndex={-1} aria-label={s.label}>
            {s.panel}
          </li>
        ))}
      </ol>
    </section>
  );
}
