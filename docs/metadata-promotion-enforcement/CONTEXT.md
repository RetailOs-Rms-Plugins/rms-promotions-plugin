# RMS Promotions — Domain Context

## Bounded Context

Backend-only plugin (`rms-promotions-extension-plugin`) that extends Medusa's native promotion system. No frontend code. Exposes errors/events for storefronts to consume.

---

## Terms

### Extended Promotion
A Medusa promotion managed by this plugin. Always created with `is_automatic: false` — Medusa's native auto-apply is intentionally disabled. The plugin's own auto-apply engine (Layer 2) handles application and removal based on custom metadata rules.

### Custom Rule
A validation condition stored directly in a promotion's `metadata`. For now: `metadata.minSubtotal` (number). Full rule design (multiple rule types, operators, combinators) is deferred to a separate conversation.

### Rule Storage Decision
Custom rules live in `promotion.metadata` as flat keys (e.g. `minSubtotal: 50`). Chosen over a linked module for initial implementation speed. Typed at the application layer via TypeScript — not DB-enforced.

### Managed Promotion
A promotion that has at least one of this plugin's metadata keys defined. The subscriber only adds, removes, or validates managed promotions. Promotions without any plugin metadata keys are ignored entirely.

### Promotion Enforcement Layer
The three-layer architecture this plugin uses to ensure a cart always has the correct set of promotions applied:

| Layer | Mechanism | When | Behavior |
|---|---|---|---|
| 1 — Code Gate | `updateCartPromotionsWorkflow.hooks.validate` | Before any promo code is applied (sync) | Throws `MedusaError` (HTTP 400) — blocks invalid manual additions |
| 2 — Auto-Apply Engine | `cart.updated` subscriber | After any cart mutation (async) | Fetches ALL promotions from DB, computes delta (what to add / what to remove), applies changes. Short-circuits if no changes needed. |
| 3 — Checkout Gate | `completeCartWorkflow.hooks.validate` | Before order is placed (sync) | Throws `MedusaError` — hard blocks checkout if any managed promotion violates its rules |

### Promotion Delta
The result of comparing all DB promotions against the cart's current state: `{ toAdd: string[], toRemove: string[] }`. Computed by `computePromotionDelta()` in `utils/promotion-metadata.ts`. Only managed promotions are included in the delta — unmanaged ones are never touched.

### Auto-Apply Loop Guard
`updateCartPromotionsWorkflow` does not emit `cart.updated`. Therefore the subscriber calling it to add/remove promotions does not re-trigger itself. No loop. The short-circuit (return early when delta is empty) is still kept as defence-in-depth.

---

## Architectural Constraints

- All plugin-managed promotions must have `is_automatic: false` — using Medusa's native auto-apply for managed promotions will break the delta logic
- No proxy-wrapping of Medusa services — risks documented in `proxy-wrapper-risks.md`
- Layer 2 cannot be synchronous: `addToCartWorkflow` holds a cart lock when its hooks fire; nesting `updateCartPromotionsWorkflow` inside would deadlock
- Layer 3 only validates — never mutates. Mutation belongs exclusively to Layer 2
- Performance note: Layer 2 currently fetches all promotions on every cart update — acceptable for small catalogs, needs filtering at scale
- Known gap: Layer 2 currently auto-applies any managed promotion (one with our metadata keys) — there is no way yet to mark a managed promotion as code-only. Planned fix: `metadata.rms_auto_apply: true` flag; until then, all managed promotions are treated as auto-apply
- Async window (accepted): the first HTTP response after a cart mutation does not reflect promotion changes — Layer 2 runs after the response is sent. Storefronts must refetch the cart after mutations. Moving Layer 2 into the synchronous path would require nesting `updateCartPromotionsWorkflow` inside a hook that already holds the cart lock — this deadlocks. The window is accepted; Layer 3 ensures no order is placed with an invalid state.
