# RMS Promotions — Domain Context

## Bounded Context

Backend-only plugin (`rms-promotions-extension-plugin`) that extends Medusa's native promotion system. No frontend code. Exposes errors/events for storefronts to consume.

**Admin UI exception:** The "Add Custom Item to Order" feature includes an admin widget. This is a temporary workaround for the order-edit promotion gap (custom promotions don't recalculate on order edits). It lives in this plugin because the gap is caused by the promotion system's cart-only design.

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

| Layer               | Mechanism                                                                                         | When                                             | Behavior                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Code Gate       | `updateCartPromotionsWorkflow.hooks.validate`                                                     | Before any promo code is applied (sync)          | Throws `MedusaError` (HTTP 400) — blocks invalid manual additions                                                                                                                                                                                                              |
| 2 — Sync Apply      | Custom store route overrides + `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` | During cart mutation (sync, before API response) | Route overrides run `evaluateAutoApplyPromotions` + `computeNonStandardAdjustments` after the workflow releases its lock. The hook computes non-standard adjustments for already-applied promos inside the workflow. API response includes correct promotions and adjustments. |
| 2b — Async Fallback | `cart.updated` subscriber                                                                         | After any cart mutation (async)                  | Same as Layer 2 — auto-apply evaluation, code-applied re-evaluation, non-standard adjustment computation. Covers mutation paths not handled by route overrides (e.g., shipping method changes, admin operations).                                                              |
| 3 — Checkout Gate   | `completeCartWorkflow.hooks.validate`                                                             | Before order is placed (sync)                    | Throws `MedusaError` — hard blocks checkout if any managed promotion violates its rules                                                                                                                                                                                        |

### Promotion Delta

The result of comparing all auto-apply promotions against the cart's current state: `{ added: string[], removed: string[] }`. Computed by the shared `evaluateAutoApplyPromotions` function, called from both route overrides (sync) and the subscriber (async fallback). Only managed promotions (those with a `promotion_ext_config` row where `auto_apply = true`) are included in the delta — unmanaged ones are never touched.

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
- **`"bundle"`**: The plugin's adjustment calculator computes repeating bundle pricing (e.g., "3 for 50€"). Requires the Medusa promotion to be created as "Amount off products" (`type: "fixed"`). Medusa's `application_method.value` holds the bundle target price. Medusa's native `type: "buyget"` is never used.
- **`"buyget_repeat"`**: The plugin's adjustment calculator computes repeating buy-get deals (e.g., "buy 2 get 1 free" for every qualifying group). Requires the Medusa promotion to be a product-level type ("Amount off products" or "Percentage off product"). Medusa's `application_method.type` and `application_method.value` hold the discount type and value. Medusa's native `type: "buyget"` is not used because it only applies once.

Promotion mode is distinct from activation rules — activation rules gate **whether** the promotion fires; promotion mode controls **what happens** when it does.

### Extended Promotion Compatibility

Bundle and buy-get repeat modes reuse Medusa's native `application_method` fields (`type`, `value`, `max_quantity`) instead of storing discount parameters in custom fields. This means the Medusa promotion must be created with specific settings:

- **Promotion type**: Must be "Standard". "Buy X Get Y" (`type: "buyget"`) is incompatible — it has a different `application_method` structure and only fires once (the plugin handles repetition).
- **Bundle** requires `type: "fixed"`, `target_type: "items"` — a bundle price is a fixed target price, not a percentage.
- **Buy-get repeat** requires `target_type: "items"` — both `type: "fixed"` and `type: "percentage"` are valid.
- **Allocation**: `"each"` or `"once"` recommended. `"across"` works but Medusa forbids `max_quantity` when allocation is `"across"`, which means no quantity cap is possible — the plugin treats null `max_quantity` as unlimited bundles/cycles.
- **max_quantity**: Required by Medusa when allocation is `"each"` or `"once"`. Must be >= `bundle_size` (bundle) or >= `buy_quantity` (buy-get repeat), or left unset for unlimited. The plugin validates this on create/update.
- **is_automatic**: Must be `false`. The plugin owns auto-apply logic via Layer 2.

"Amount off order", "Percentage off order", "Buy X Get Y", and "Free shipping" are all incompatible — they either lack item-level `target_rules` or have a different `application_method` structure. Validated on both the admin UI (toast error on save) and the backend API (HTTP 400 on create/update).

### Reused Application Method Fields

For non-standard promotion modes, Medusa's native `application_method` fields take on mode-specific meanings:

| Field          | Standard meaning             | Bundle meaning                                       | Buy-get repeat meaning                                        |
| -------------- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `type`         | fixed or percentage discount | Must be `"fixed"`                                    | Discount type (fixed or percentage)                           |
| `value`        | Discount amount or %         | Bundle target price                                  | Discount amount or % on "get" items                           |
| `max_quantity` | Max items discounted         | Max participating items (only complete bundles form) | Max "buy" items (cycles = floor(max_quantity / buy_quantity)) |

The plugin's adjustment calculator reads these fields from the promotion's `application_method`, not from `mode_config`. Medusa's own `computeActions` still runs and produces adjustments from these fields, but the subscriber strips all Medusa-generated adjustments for non-standard promotions (matched by `promotion_id`) and replaces them with the plugin's computed adjustments.

**Budget contamination caveat:** Medusa's `computeActions` uses a shared budget map (`appliedPromotionsMap`) across all promotions. Non-standard promotions' native values consume budget that reduces what's available for standard promotions computed later in the same pass (sorted by value descending). This can cause standard auto-apply promotions to produce zero adjustments and be removed from the cart. ADR-0004 mitigates this by prescribing `value: 1`; ADR-0009 provides defense-in-depth by restoring evicted standard promotions after non-standard adjustments are computed.

**Semantic note on `max_quantity` for buy-get repeat:** In Medusa's native interpretation, `max_quantity` counts the items that _receive_ the discount (the "get" items). In this plugin's buy-get repeat mode, `max_quantity` counts the "buy" items instead — the full-price side of the deal. This is a deliberate business decision. A merchant setting `max_quantity = 6` on a "buy 3 get 2" promotion gets `floor(6/3) = 2` cycles, meaning 4 items discounted — not 6. Future developers should be aware of this difference when comparing the plugin's behavior to Medusa's native buyget documentation.

### Mode Config

A JSONB field on `PromotionExtConfig` (`mode_config`) whose shape is determined by `promotion_mode`. Stores the structural parameters for bundle or buy-get repeat calculation that are not represented by Medusa's native fields.

**Bundle shape:** `{ bundle_size, remainder }` — where `remainder` is `"full_price"` (leftover items pay regular price). The bundle price comes from `application_method.value`.

**Buy-get repeat shape:** `{ buy_quantity, get_quantity, discount_target, remainder }` — where `discount_target` is `"cheapest"` (the cheapest item in each group gets the discount) and `remainder` is `"full_price"`. The discount type and value come from `application_method.type` and `application_method.value`.

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

A pure computation service (`adjustment-calculator.ts`) that takes eligible cart items, a `mode_config` (structural parameters), and the promotion's `application_method` (discount parameters), and returns per-item adjustment amounts. Has no side effects, no DB calls — all data is passed in. Analogous to `rule-evaluator.ts` (pure boolean evaluation) but for amount computation. Returns adjustments grouped by promotion to support future conflict resolution. Respects `max_quantity` from the application method as a repeat cap (max bundles or max buy-get cycles).

### Target Rule Evaluator

A service that reads a promotion's native Medusa `target_rules` (on the `application_method`) and filters cart items to determine which are eligible for the promotion's discount. Supports all five native Medusa target rule attributes: `product`, `product_collection`, `product_category`, `product_type`, `product_tag`. This is needed because the plugin replaces Medusa's computed adjustments for non-standard modes — the plugin must evaluate target rules itself to know which items are eligible before running the adjustment calculator.

### Adjustment Stripping

For non-standard promotion modes, Medusa's `computeActions` still runs and produces adjustments based on the `application_method` fields. The subscriber strips all Medusa-generated adjustments for these promotions (matched by `promotion_id`, not by amount) and replaces them with the plugin's computed adjustments in the same `cart.updated` cycle. This stripping is unconditional for any promotion with `promotion_mode !== "standard"` in its ext config.

### Adjustment Conflict Resolution

When multiple bundle/buy-get promotions target the same cart items, their adjustments **stack** (all apply). This is consistent with Medusa's native behavior for standard promotions. The architecture supports future conflict resolution strategies (e.g., best-deal-wins) because the adjustment calculator returns adjustments grouped by promotion before they are combined into a single `addLineItemAdjustments` call.

**Known gap — no cross-boundary budget cap.** Medusa's native `computeActions` caps total adjustments per item at the item's subtotal, but only among promotions computed in the same pass. The plugin computes non-standard adjustments independently and restored standard adjustments with a fresh budget (see ADR-0009). These three adjustment sources (preserved native, custom non-standard, restored standard) are merged without a final per-item cap. In theory, the combined total discount on an item could exceed the item's price. In practice this is unlikely with typical promotion setups, but it is a gap. The fix is to clamp total adjustments per item at the item's subtotal inside `applyExtAdjustmentsToCart` before calling `setLineItemAdjustments`.

---

## Architectural Constraints

- All plugin-managed promotions must have `is_automatic: false` — using Medusa's native auto-apply for managed promotions will break the delta logic
- No proxy-wrapping of Medusa services — risks documented in `proxy-wrapper-risks.md`
- `evaluateAutoApplyPromotions` cannot be called from workflow hooks — hooks invoke workflows via `.run()` (standalone), which attempts to acquire the cart lock and deadlocks because the parent workflow still holds it. Lock-skipping only works with `.runAsStep()` (sub-workflow composition), which is not available inside hook handlers. Auto-apply evaluation runs in custom store route overrides AFTER the workflow releases its lock. See ADR-0007.
- Layer 3 only validates — never mutates. Mutation belongs exclusively to Layer 2
- Performance note: Layer 2 currently fetches all promotions on every cart update — acceptable for small catalogs, needs filtering at scale
- `auto_apply` boolean column on `promotion_ext_config` controls whether Layer 2 manages a promotion. Code-only promotions (`auto_apply: false`) are never touched by Layer 2 — only Layer 1 (code entry) and Layer 3 (checkout) validate their rules.
- No async window for covered routes: store route overrides for add/update/delete line-items and promo code entry run auto-apply evaluation and non-standard adjustment computation synchronously before the API response. The `beforeRefreshingPaymentCollection` hook handles non-standard adjustments for already-applied promos inside the workflow. Only mutation paths NOT covered by route overrides (e.g., shipping method changes) have an async window — the subscriber handles these as a fallback. Layer 3 remains the safety net for all paths.
- Bundle promotions must use Medusa "Amount off products" (`type: "fixed"`, `target_type: "items"`). Buy-get repeat promotions must use a product-level type (`target_type: "items"`). Neither mode may use Medusa's native `type: "buyget"` — it only fires once; the plugin's adjustment calculator handles repetition. Validated on create/update in both frontend and backend API.
- `updateCartPromotionsWorkflow` has no hook between `computeActions` and `setLineItemAdjustments` — there is no way to inject custom adjustments into the atomic set. Custom adjustments are re-applied via `setLineItemAdjustments` in the `beforeRefreshingPaymentCollection` hook (for already-applied promos) and in the route overrides / subscriber (for all promos).
- `setLineItemAdjustments` is not concurrency-safe — concurrent calls can interleave reads/writes and produce duplicate adjustments. `applyExtAdjustmentsToCart` is serialized per cart via an in-memory lock, and ext adjustment rows are deduplicated before merging. See ADR-0006.
- Cart extension adjustment rows are hard-deleted when: (a) their promotion is removed from the cart (engine-computed rows), (b) the operator explicitly deletes them (manual rows), or (c) the cart completes and becomes an order. The order's `OrderLineItemAdjustment` records are the permanent record.
- Manual adjustment CRUD endpoints immediately apply changes to Medusa's cart adjustments (via `addLineItemAdjustments` or removal by matching `code`) — they do not wait for the next `cart.updated` cycle.
- All cart adjustment admin endpoints require Medusa admin authentication. The storefront server can call admin endpoints using a secret API token for operator-initiated adjustments. No store-scoped adjustment endpoints exist — customers must never self-discount.
