# Phone-first workspace update

The mobile home now leads with a daily brief derived from actual due actions, draft reviews, active clients, and unpaid invoices. Quick capture saves ideas/to-dos/in-progress notes through the existing shared notes API. A grouped tools sheet makes destinations discoverable without knowing their names. The queue expands to show every action; recently updated client projects surface running work and open issue counts.

Inspiration: StrideAI's visual identity (https://stride-ai.nl), Linear Mobile's focused inbox and quick capture (https://linear.app/mobile), and Notion Calendar's schedule focus (https://www.notion.com/product/calendar).

Validation: TypeScript and production build pass. Test suite: 511 pass, one skipped. Lint: no errors, two existing warnings. Browser QA at 390x844 and 320x720: note save and refreshed count, grouped tools navigation to Notes, seven-action queue expansion, no horizontal home overflow. Temporary QA notes and clients removed. Real iOS keyboard, VoiceOver, and production integration tests remain outstanding. A dev hydration warning was observed when opening a dialog during initial page hydration; normal loaded-page navigation and capture worked.

Deployment: shared console remains hosted on the Mac mini. GitHub changes require pull, build, and service restart there; this workstation has no established remote access.
