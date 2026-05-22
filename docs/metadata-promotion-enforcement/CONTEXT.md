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

### Promotion Mode
A field on `PromotionExtConfig` (`promotion_mode`) that controls **how** a promotion's discount is calculated once the promotion is active on a cart. Three values:

- **`"standard"`** (default): Medusa's native `computeActions` handles the discount. The plugin does not intervene in calculation.
- **`"bundle"`**: The plugin's adjustment calculator computes repeating bundle pricing (e.g., "3 for 50€"). Medusa's native computation is bypassed via `application_method.value: 1`.
- **`"buyget_repeat"`**: The plugin's adjustment calculator computes repeating buy-get deals (e.g., "buy 2 get 1 free" for every qualifying group). Medusa's native `type: "buyget"` is not used because it only applies once.

Promotion mode is distinct from activation rules — activation rules gate **whether** the promotion fires; promotion mode controls **what happens** when it does.

### Mode Config
A JSONB field on `PromotionExtConfig` (`mode_config`) whose shape is determined by `promotion_mode`. Stores the parameters for bundle or buy-get repeat calculation.

**Bundle shape:** `{ bundle_size, bundle_price, remainder }` — where `remainder` is `"full_price"` (leftover items pay regular price).

**Buy-get repeat shape:** `{ buy_quantity, get_quantity, discount_type, discount_value, discount_target, remainder }` — where `discount_target` is `"cheapest"` (the cheapest item in each group gets the discount) and `remainder` is `"full_price"`.

### Cart Extension Adjustment (CartExtAdjustment)
A plugin-owned DB record (`cart_ext_adjustment` table) that represents an adjustment **intent** for a cart. This is the source of truth for all adjustments the plugin manages — both operator-created manual adjustments and engine-computed bundle/buy-get adjustments. The schema mirrors Medusa's native `cart_line_item_adjustment` table (same fields in same order) with two additions: `cart_id` (needed because cart-wide adjustments have no `item_id`) and `source` (discriminator).

Cart extension adjustments are **not** the same as Medusa's `caliadj_*` records. They are persisted in the plugin's own table. The `cart.updated` subscriber reads them and writes corresponding Medusa adjustment records via `addLineItemAdjustments`. When Medusa wipes adjustments during promotion recalculation, the subscriber re-creates them from this table.

### Source (CartExtAdjustment)
A discriminator field on `CartExtAdjustment` that identifies what created the record:
- **`"manual"`**: Operator-created via the admin API. Persists until the operator deletes it or the cart completes.
- **`"bundle"`**: Computed by the adjustment calculator for a bundle promotion. Recomputed on every cart update. Deleted when the promotion is removed from the cart.
- **`"buyget_repeat"`**: Computed by the adjustment calculator for a buy-get repeat promotion. Same lifecycle as bundle.

### Manual Adjustment
An operator-created `CartExtAdjustment` with `source: "manual"`. Created via admin API (`POST /admin/cart-adjustments/:cart_id`). Can target a specific line item (`item_id` set) or the whole cart (`item_id: null` — spread proportionally across items at re-apply time). Amount follows Medusa's convention: positive = discount, negative = surcharge.

### Cart-Wide Adjustment Spread
When a manual adjustment has `item_id: null`, the subscriber spreads the amount proportionally across all cart items based on each item's share of the cart subtotal. The spread is recalculated on every cart update (items may have changed). If the cart subtotal drops below the adjustment amount, the adjustment is capped at the subtotal to avoid negative totals.

### Adjustment Calculator
A pure computation service (`adjustment-calculator.ts`) that takes eligible cart items and a `mode_config`, and returns per-item adjustment amounts. Has no side effects, no DB calls — all data is passed in. Analogous to `rule-evaluator.ts` (pure boolean evaluation) but for amount computation. Returns adjustments grouped by promotion to support future conflict resolution.

### Target Rule Evaluator
A service that reads a promotion's native Medusa `target_rules` (on the `application_method`) and filters cart items to determine which are eligible for the promotion's discount. Supports all five native Medusa target rule attributes: `product`, `product_collection`, `product_category`, `product_type`, `product_tag`. This is needed because bundle/buy-get promotions use `value: 1` on the Medusa side, so the plugin must evaluate target rules itself rather than relying on Medusa's `computeActions` output.

### Value: 1 Workaround
Bundle and buy-get repeat promotions are created in Medusa as `type: "standard"` with `application_method.value: 1`. This ensures Medusa writes the promotion to the cart and produces `ADD_ITEM_ADJUSTMENT` actions (a `value: 0` promotion is not written to the cart at all). The 1-cent adjustments are overwritten by the plugin's real computed adjustments in the same `cart.updated` subscriber cycle. This is a known design trade-off — see ADR-0004.

### Adjustment Conflict Resolution
When multiple bundle/buy-get promotions target the same cart items, their adjustments **stack** (all apply). This is consistent with Medusa's native behavior for standard promotions. The architecture supports future conflict resolution strategies (e.g., best-deal-wins) because the adjustment calculator returns adjustments grouped by promotion before they are combined into a single `addLineItemAdjustments` call.

---

## Architectural Constraints

- All plugin-managed promotions must have `is_automatic: false` — using Medusa's native auto-apply for managed promotions will break the delta logic
- No proxy-wrapping of Medusa services — risks documented in `proxy-wrapper-risks.md`
- Layer 2 cannot be synchronous: `addToCartWorkflow` holds a cart lock when its hooks fire; nesting `updateCartPromotionsWorkflow` inside would deadlock
- Layer 3 only validates — never mutates. Mutation belongs exclusively to Layer 2
- Performance note: Layer 2 currently fetches all promotions on every cart update — acceptable for small catalogs, needs filtering at scale
- `auto_apply` boolean column on `promotion_ext_config` controls whether Layer 2 manages a promotion. Code-only promotions (`auto_apply: false`) are never touched by Layer 2 — only Layer 1 (code entry) and Layer 3 (checkout) validate their rules.
- Async window (accepted): the first HTTP response after a cart mutation does not reflect promotion changes — Layer 2 runs after the response is sent. Storefronts must refetch the cart after mutations. Moving Layer 2 into the synchronous path would require nesting `updateCartPromotionsWorkflow` inside a hook that already holds the cart lock — this deadlocks. The window is accepted; Layer 3 ensures no order is placed with an invalid state.
- Bundle and buy-get repeat promotions must use Medusa `type: "standard"` with `value: 1` — never `type: "buyget"`. Medusa's native buyget only fires once; the plugin's adjustment calculator handles repetition. See ADR-0004.
- `updateCartPromotionsWorkflow` has no hook between `computeActions` and `setLineItemAdjustments` — there is no way to inject custom adjustments into the atomic set. Custom adjustments must be re-applied after the wipe via `addLineItemAdjustments` in the `cart.updated` subscriber.
- Cart extension adjustment rows are hard-deleted when: (a) their promotion is removed from the cart (engine-computed rows), (b) the operator explicitly deletes them (manual rows), or (c) the cart completes and becomes an order. The order's `OrderLineItemAdjustment` records are the permanent record.
- Manual adjustment CRUD endpoints immediately apply changes to Medusa's cart adjustments (via `addLineItemAdjustments` or removal by matching `code`) — they do not wait for the next `cart.updated` cycle.
- All cart adjustment admin endpoints require Medusa admin authentication. The storefront server can call admin endpoints using a secret API token for operator-initiated adjustments. No store-scoped adjustment endpoints exist — customers must never self-discount.
