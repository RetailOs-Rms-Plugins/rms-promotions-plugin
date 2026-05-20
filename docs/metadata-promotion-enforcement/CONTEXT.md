# RMS Promotions — Domain Context

## Bounded Context

Backend-only plugin (`rms-promotions-extension-plugin`) that extends Medusa's native promotion system. No frontend code. Exposes errors/events for storefronts to consume.

---

## Terms

### Extended Promotion
A Medusa promotion managed by this plugin. Always created with `is_automatic: false` — Medusa's native auto-apply is intentionally disabled. The plugin's own auto-apply engine (Layer 2) handles application and removal based on custom metadata rules.

### Custom Rule
A validation condition attached to a promotion via the plugin's linked module. Stored as a `rule_type` discriminator and a `config` JSONB object. Current rule type: `comparison` (`field` + `operator` + `value`).

### Combinator
The logical connective (`"and"` | `"or"`) controlling how multiple items are joined during rule evaluation. Two combinator fields exist:

- **`rules_combinator`** on `PromotionExtRuleGroup` — controls how rules within a group are joined (`"and"`: all must pass; `"or"`: any must pass). Default: `"and"`.
- **`include_groups_combinator`** on `PromotionExtConfig` — controls how include rule groups are joined. Default: `"or"`.
- **`exclude_groups_combinator`** on `PromotionExtConfig` — same concept for exclude groups. **Draft status** — may be removed with the exclude groups feature.

### Rule Storage Decision
Custom rules live in three plugin-owned DB tables (`promotion_ext_config`, `promotion_ext_rule_group`, `promotion_ext_rule`) linked to Medusa's promotion table. Option A (metadata) was rejected because `auto_apply` cannot be filtered at the DB level when buried in JSON, and rule fields cannot be queried in SQL without parsing. See PRD Section 6 for full trade-off analysis.

### Managed Promotion
A promotion that has a `promotion_ext_config` row in the plugin's DB. The subscriber only adds, removes, or validates managed promotions. Promotions without a config row are ignored entirely.

### Promotion Enforcement Layer
The three-layer architecture this plugin uses to ensure a cart always has the correct set of promotions applied:

| Layer | Mechanism | When | Behavior |
|---|---|---|---|
| 1 — Code Gate | `updateCartPromotionsWorkflow.hooks.validate` | Before any promo code is applied (sync) | Throws `MedusaError` (HTTP 400) — blocks invalid manual additions |
| 2 — Auto-Apply Engine | `cart.updated` subscriber | After any cart mutation (async) | Fetches only `auto_apply=true` configs from plugin DB, then fetches their promotions from Medusa, evaluates custom + native rules, computes delta (what to add / what to remove), applies changes. Short-circuits if no changes needed. |
| 3 — Checkout Gate | `completeCartWorkflow.hooks.validate` | Before order is placed (sync) | Throws `MedusaError` — hard blocks checkout if any managed promotion violates its rules |

### Promotion Delta
The result of comparing all auto-apply promotions against the cart's current state: `{ toAdd: string[], toRemove: string[] }`. Computed inline in `src/subscribers/cart-updated.ts`. Only managed promotions (those with a `promotion_ext_config` row where `auto_apply = true`) are included in the delta — unmanaged ones are never touched.

### Auto-Apply Loop Guard
`updateCartPromotionsWorkflow` does not emit `cart.updated`. Therefore the subscriber calling it to add/remove promotions does not re-trigger itself. No loop. The short-circuit (return early when delta is empty) is still kept as defence-in-depth.

### Item Condition
A rule that filters **which cart items** receive a discount adjustment, as opposed to activation rules that gate whether a promotion fires at all. Stored as a native Medusa `PromotionRule` on the promotion's `application_method` with `target_type: "items"`. Supported attributes: `brand_id`, `manufacturer_id`. Multiple conditions on the same promotion are always AND-combined — every condition must match on an item for that item to receive the discount.

### Brand Item Condition / Manufacturer Item Condition
An Item Condition where `attribute` is `brand_id` or `manufacturer_id` respectively. Values are IDs from the `rms-products-bridge` plugin (brand or manufacturer entity IDs). Evaluated against an enriched cart item that carries `brand_id: string[]` and `manufacturer_id: string[]` arrays populated by the `setPromotionContext` hook at promotion compute time.

### setPromotionContext Hook
A Medusa workflow hook on `updateCartPromotionsWorkflow` that runs after the cart is fetched and before `computeActions` is called. Used by this plugin to enrich cart items with `brand_id` and `manufacturer_id` arrays sourced from the `rms-products-bridge` link tables. This enrichment enables Medusa's native `areRulesValidForContext` to evaluate brand/manufacturer target rules without any custom evaluation logic.

### Item Targeting vs Activation Rules
Two distinct concepts that co-exist on the same promotion:
- **Activation rules** (existing): gate whether the promotion fires at all — managed by the plugin's three-layer enforcement system using `PromotionExtConfig` / `PromotionExtRuleGroup` / `PromotionExtRule` tables
- **Item targeting** (new): gate which cart items receive the discount once the promotion has fired — managed via native Medusa `PromotionRule` records with custom attributes, evaluated by Medusa's own `computeActions` engine

---

## Architectural Constraints

- All plugin-managed promotions must have `is_automatic: false` — using Medusa's native auto-apply for managed promotions will break the delta logic
- No proxy-wrapping of Medusa services — risks documented in `proxy-wrapper-risks.md`
- Layer 2 cannot be synchronous: `addToCartWorkflow` holds a cart lock when its hooks fire; nesting `updateCartPromotionsWorkflow` inside would deadlock
- Layer 3 only validates — never mutates. Mutation belongs exclusively to Layer 2
- Performance note: Layer 2 currently fetches all promotions on every cart update — acceptable for small catalogs, needs filtering at scale
- `auto_apply` boolean column on `promotion_ext_config` controls whether Layer 2 manages a promotion. Code-only promotions (`auto_apply: false`) are never touched by Layer 2 — only Layer 1 (code entry) and Layer 3 (checkout) validate their rules.
- Async window (accepted): the first HTTP response after a cart mutation does not reflect promotion changes — Layer 2 runs after the response is sent. Storefronts must refetch the cart after mutations. Moving Layer 2 into the synchronous path would require nesting `updateCartPromotionsWorkflow` inside a hook that already holds the cart lock — this deadlocks. The window is accepted; Layer 3 ensures no order is placed with an invalid state.
