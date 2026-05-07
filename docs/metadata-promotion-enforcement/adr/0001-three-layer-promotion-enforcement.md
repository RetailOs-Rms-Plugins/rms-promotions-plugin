# ADR-0001: Three-Layer Promotion Enforcement

**Status:** Accepted  
**Date:** 2026-05-07

---

## Context

When a promotion is applied to a cart — either by a customer entering a code or automatically by Medusa — we need to validate it against custom rules (defined by this plugin) and remove it if those rules are not satisfied.

Two approaches were considered:

**Option A — Proxy wrapper on `promotionModuleService`**  
Re-register the promotion service in the IoC container with a wrapper that intercepts `computeActions`. Validation runs synchronously inside the service call.

**Option B — Three-layer hook/subscriber pattern**  
Use Medusa's built-in extension points: workflow hooks for synchronous gates, a subscriber for async cleanup.

---

## Decision

Use **Option B**: a three-layer pattern.

| Layer | Mechanism | Covers | Behavior |
|---|---|---|---|
| 1 — Code Gate | `updateCartPromotionsWorkflow.hooks.validate` | Code-based promos | Throws `MedusaError` (HTTP 400), cart unchanged |
| 2 — Auto Cleanup | `cart.updated` subscriber → custom workflow | Automatic promos | Silently removes invalid promos; short-circuits if cart is already clean |
| 3 — Checkout Gate | `completeCartWorkflow.hooks.validate` | All promos | Throws `MedusaError`, blocks order placement |

All three layers share a single `validateCustomRulesStep` — rule logic lives in one place.

---

## Reasons

**Option A was rejected because:**
- Re-registering a Medusa core service in the container is unsupported and fragile — Medusa may re-resolve the original at any point
- High blast radius: a bug in the wrapper crashes all promotion evaluation, not just custom rules
- Not a documented extension point — future Medusa upgrades could silently break it

**Option B was chosen because:**
- All three mechanisms (`hooks.validate`, subscribers, `hooks.cartUpdated`) are documented, stable extension points
- Failure in our code throws a `MedusaError` with a clean HTTP response — it does not corrupt the cart or crash unrelated workflows
- Layer 3 (checkout gate) is the hard money protection: even if Layer 2's async window is hit, no order ever completes with an invalid discount

---

## Consequences

- Automatic promotions cannot be blocked synchronously: `addToCartWorkflow` holds a cart lock when hooks fire, so nesting `updateCartPromotionsWorkflow` inside would deadlock. Layer 2 is always async.
- The cart total may be incorrect for a brief window (lock release → subscriber fires). Acceptable because Layer 3 is the authoritative gate.
- Layer 3 must never mutate — only validate. If it also removed promos, the rule for where mutations happen would have two owners.
