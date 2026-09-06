# Stride workspace redesign

Approved by the user on 6 September 2026: “i approve lets cook”.

## Product and visual direction
An action-first workspace for Stride founders. Home shows priorities, active client work, the schedule and measured business activity. A persistent sidebar provides Home, Clients, Delivery, Growth, Finance and Knowledge. A compact command palette keeps every existing destination reachable. Preserve existing routes and business rules, file stores, integration behavior and publishing approval boundaries.

Use Stride electric blue, pale neutral surfaces, clear typography, restrained borders and contextual motion. Shared UI should feel consistent across client lists, delivery, invoices, content and settings. The assistant is a compact contextual entry point. No invented metrics or production-looking fixtures.

## Accessibility and responsive behavior
Managed dialog focus and keyboard search using maintained primitives; hidden dialogs removed from the accessibility tree. Accessible names, selected states, visible focus, skip navigation, readable contrast and at least 44px touch controls. Sidebar at laptop widths; bottom navigation and a searchable menu on smaller devices. Support system dark mode, reduced motion, 200% zoom and horizontal overflow containment.

## Architecture and validation
Next 16 server components continue reading existing stores. New presentation components receive serializable data. Client components handle local filtering and view switching. Business operations continue using existing APIs, with visible pending and failed states.

Run TypeScript, ESLint, existing node tests and production build. Review real local browser rendering and keyboard interactions, mobile, dark mode and zoom. Document limitations from absent production data and integrations.
