# PRODUCT.md — Stride Console

Compiled from the repo's own README, AGENTS.md and component commentary (the founders' words), not invented.

## What it is

The private operations console for Stride AI, a two-founder Dutch AI agency. One machine that runs their marketing (LinkedIn content pipeline with a deterministic voice gate), their website (SEO sweeps, articles), their outbound (Linked Helper campaigns, email sequencer), their sales admin (clients, calendar, events, event scout), their client delivery (workspaces, build sessions, Durabo discovery) and their shared memory (notes, brain, Ask Stride).

## Register

product — the console is a tool two people live in daily; design serves the task. Exception: /pitch and /login speak with an editorial voice (Playfair) because they face outsiders.

## Users

Exactly two: Jort and Sarvesh, founders. Both technical enough to press buttons, neither wants to babysit software. The console is also occasionally shown to clients as proof of craft, so it must look like something a design-led agency built for itself. It installs as a PWA / native iOS shell: phone-first ergonomics matter (thumb-reach action bars, tab bar, safe areas).

## Tone

Confident, plain, a little wry. Interface copy is written like a person talking: "Press a button, get a post." "Somebody answered. This is where that lands." No corporate filler. Dutch market, English interface.

## Strategic principles (from the code's own comments)

- Nothing auto-posts; a founder approves everything (voice gate, copy-open flow).
- One source of truth per shape: the menu tree (lib/menu.ts) is the only place the console's structure is written down.
- The surface language is iOS: grouped inset lists, hairline separators, translucent chrome, press states that scale rather than flash.
- A header is not a sitemap; five slots max, the Menu holds the rest.

## Anti-references

Generic SaaS admin templates; dashboard-of-cards clichés; anything that reads as "a website someone opened" inside the iOS shell.
