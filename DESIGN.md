# DESIGN.md — Stride Console

Extracted from app/globals.css and components/ui.tsx. The icon library is the stated single source of truth for colour and type.

## Colour

- Indigo `#2e30f8` (accent; actions, selection, state) · deep `#2325c9` · tint `#ececfe`
- Violet `#6d6ffa` · Signal blue `#2ba6ff` · Lime `#76b900` · Amber `#ffa92b`
- Ink `#0a0c14` (text) · Slate `#5a6172` · Mute `#8a90a0`
- Paper `#f6f7fa` (background) · Line `#e5e8f0` (hairlines) · Card `#ffffff`
- Strategy: Restrained. Indigo carries actions and current-state; the other hues appear only as meaningful category colour (lanes, statuses).

## Type

- Interface: system stack (`-apple-system, BlinkMacSystemFont, system-ui, "Plus Jakarta Sans"`) — deliberate, it lives in a WKWebView next to iOS chrome.
- Labels/eyebrows: JetBrains Mono, 500, uppercase (.eyebrow).
- Display headings: same system stack, 700, tight tracking (.display, .title-large).
- Editorial voice (Playfair) only on /pitch and /login.

## Surfaces & components

- Radii: inputs 10px, cards 16px (--radius-card).
- .card-glass: near-invisible top-lit glass gradient + inset hairline; .card-lift hover raise.
- .pressable: scale-down press state (iOS feel), no flash.
- .slant-rule: the brand's sheared bar, currentColor; the one shape the brand owns.
- Panel: fixed 9-unit header bar, icon + display title + mono meta.

## Motion

- --ease-out-quint `cubic-bezier(0.22,1,0.36,1)` everywhere; 140–300ms; transitions not mounts (menu sheet stays mounted).
- Staggered section entrances on the menu sheet (45ms steps).

## Voice of the chrome

- No pinned white header bars; the mark sits on the paper and scrolls away.
- Hairline separators over boxes; grouped-inset-list feel; nothing nested in cards.
