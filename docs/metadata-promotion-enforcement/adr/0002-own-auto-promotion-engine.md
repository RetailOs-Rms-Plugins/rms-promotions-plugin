# ADR-0002: Plugin-Owned Auto-Promotion Engine Instead of Medusa's `is_automatic`

**Status:** Accepted  
**Date:** 2026-05-07

---

## Context

Medusa's native automatic promotion system (`is_automatic: true`) applies promotions by calling `computeActions` inside cart update workflows. When we tried to remove an automatic promotion via `updateCartPromotionsWorkflow(REMOVE)`, the promotion was immediately re-applied because the workflow always re-includes automatic promotions in its computation step.

This means: **automatic promotions cannot be conditionally suppressed via documented extension points**.

---

## Decision

All promotions managed by this plugin must be created with **`is_automatic: false`**. The plugin's `cart.updated` subscriber acts as the auto-apply engine — it fetches all promotions, evaluates their custom rules against the cart, and applies the correct delta (add valid ones not yet on cart, remove invalid ones currently on cart).

---

## Reasons

**Medusa's `is_automatic: true` was rejected because:**
- `updateCartPromotionsWorkflow` re-applies automatic promotions during every run, including the REMOVE run we trigger — making conditional removal impossible without the proxy wrapper
- The only workaround (deactivating the promotion entirely) would affect all carts, not just the one being validated

**Plugin-owned engine was chosen because:**
- We fully control when and why a promotion is applied — no fighting Medusa internals
- `updateCartPromotionsWorkflow` does not emit `cart.updated`, so the subscriber does not re-trigger itself — no infinite loop
- Stays entirely within documented, stable Medusa extension points (subscribers + workflow hooks)
- The proxy wrapper approach (intercepting `computeActions`) was considered and rejected — risks documented in `proxy-wrapper-risks.md`

---

## Consequences

- All plugin-managed promotions must have `is_automatic: false` at creation. If a managed promotion is accidentally set to `is_automatic: true`, Medusa will apply it unconditionally regardless of our rules.
- The subscriber fetches all promotions from the DB on every cart update. This is acceptable at small scale but will need filtering (by status, sales channel, currency) as the promotion catalog grows.
- Medusa's native `is_automatic: true` promotions (created outside this plugin) are unaffected — the subscriber ignores any promotion without our metadata keys.

## Known Gap: Auto-Apply vs Code-Only Intent

By setting all promotions to `is_automatic: false`, we lose the ability to express "this promotion requires a code — do not auto-apply it." Currently the subscriber treats all promotions with our metadata keys as auto-apply candidates, regardless of whether the merchant intended them to be code-only.

**Planned fix:** add `metadata.rms_auto_apply: true` as an explicit intent flag. The subscriber would only auto-apply promotions that carry this flag. Code-only promotions with our metadata keys (but without the flag) would still be validated by Layer 1 on code entry — but never auto-applied.

**Current state:** deferred. The system currently checks rules against all managed promotions on every cart update. Acceptable while all promotions in the system are intentionally auto-apply. Becomes a problem as soon as a code-only promotion with metadata rules is created.
