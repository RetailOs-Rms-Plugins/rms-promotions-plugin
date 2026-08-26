---
"@retailos-ai/rms-promotions-extension": minor
---

Bump peer dependencies to Medusa 2.19.0, `@retailos-ai/rms-medusa-ui` 1.4.0, and `@retailos-ai/rms-access` 1.3.0.

- `@medusajs/*` peer ranges raised to `2.19.0`
- Compatible with `@medusajs/ui@4.2.1`
- `@retailos-ai/rms-medusa-ui` peer + dev raised to `^1.4.0`; yalc ref removed
- `@retailos-ai/rms-access` peer + dev raised to `^1.3.0`; yalc ref removed
- **Widget-zone suffix sweep (Step 8):** stripped deprecated `.before` / `.after` suffixes on zones that became invalid in Medusa 2.17.2 — mention if customers customize widgets.
- No public API changes; promotion extension logic, admin UI, and REST routes unchanged from `1.6.x`
- Consumer apps must run on Medusa 2.19+ after this release
