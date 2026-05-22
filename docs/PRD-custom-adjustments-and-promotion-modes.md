# PRD: Custom Cart Adjustments and Promotion Modes (Bundle / Buy-Get Repeat)

## 1. Problem Statement

Medusa's native promotion system has two limitations that prevent merchants from expressing common retail pricing strategies:

1. **No manual price adjustments.** An operator (shop owner, site manager) cannot adjust the price of a cart item or the whole cart outside of the promotion system. There is no way to give a one-off discount or add a surcharge without creating a promotion.

2. **No repeating quantity-based deals.** Medusa's `type: "buyget"` only applies once — "buy 2 get 1 free" with 9 items yields 1 free item, not 3. There is no bundle pricing concept ("3 for 50€"). Merchants cannot express deals that scale with quantity.

## 2. Solution

This update introduces three capabilities:

1. **Manual cart adjustments** — A CRUD API that lets operators add, view, update, and remove price adjustments on any cart. Adjustments can target a specific line item or the whole cart (spread proportionally). Positive amounts discount; negative amounts surcharge.

2. **Bundle pricing mode** — A new `promotion_mode: "bundle"` on `PromotionExtConfig` that computes repeating bundle pricing. "3 for 50€" with 7 items → 2 bundles at 50€ + 1 item at full price.

3. **Buy-get repeat mode** — A new `promotion_mode: "buyget_repeat"` on `PromotionExtConfig` that computes repeating buy-get deals. "Buy 2 get 1 free" with 9 items → 3 groups, 3 items free (cheapest in each group).

All three features write to a plugin-owned persistence table (`cart_ext_adjustment`) and are re-applied to the cart on every update via the existing `cart.updated` subscriber.

---

## 3. User Stories

### Manual Adjustments

1. As a shop owner, I want to add a discount to a specific item in a customer's cart, so that I can honor a price-match or special agreement.
2. As a shop owner, I want to add a discount to the entire cart, so that I can give a customer a flat amount off their order.
3. As a shop owner, I want to add a surcharge to a cart item, so that I can charge for customization or special handling.
4. As a shop owner, I want to view all manual adjustments on a cart, so that I can see what has been applied.
5. As a shop owner, I want to update a manual adjustment amount, so that I can correct a mistake.
6. As a shop owner, I want to remove a manual adjustment from a cart, so that I can revoke a discount I no longer want to offer.
7. As a shop owner, I want manual adjustments to persist even when the customer adds or removes items, so that the discount is not lost when the cart changes.
8. As a shop owner, I want manual adjustments to appear on the final order, so that the customer sees the correct price at checkout.
9. As a shop owner, I want the system to prevent checkout if a manual adjustment failed to apply, so that no order goes through at the wrong price.
10. As a shop owner, I want cart-wide adjustments to recalculate their spread when items change, so that the discount stays proportionally fair.
11. As a shop owner, I want cart-wide adjustments to be capped at the cart subtotal, so that the cart total never goes negative.
12. As a site manager, I want to create manual adjustments from the storefront server using admin API credentials, so that I can integrate with external systems (loyalty, ERP) without exposing the endpoint to customers.
13. As a customer, I should never be able to create, modify, or delete adjustments on my own cart, so that the pricing integrity is maintained.

### Bundle Pricing

14. As a merchant, I want to create a promotion where buying 3 items costs 50€ instead of full price, so that I can incentivize bulk purchases.
15. As a merchant, I want the bundle deal to repeat — 6 items should give 2 bundles at 50€, not just one, so that the discount scales with quantity.
16. As a merchant, I want leftover items (not forming a complete bundle) to be charged at full price, so that partial bundles don't get an unintended discount.
17. As a merchant, I want to scope the bundle deal to specific products, collections, categories, types, or tags, so that only qualifying items form bundles.
18. As a merchant, I want to combine the bundle deal with activation rules (subtotal minimums, quantity thresholds, etc.), so that the deal only fires when the cart meets my conditions.
19. As a merchant, I want the bundle deal to work with both auto-apply and code-entry, so that I can choose whether customers need a code.
20. As a merchant, I want to see the bundle configuration on the promotion detail page, so that I can verify the deal is set up correctly.
21. As a merchant, I want to edit the bundle configuration in a drawer/modal, so that I follow the same edit pattern as other promotion settings.

### Buy-Get Repeat

22. As a merchant, I want to create a "buy 2 get 1 free" promotion that repeats for every qualifying group, so that buying 9 items gives 3 free items, not just 1.
23. As a merchant, I want to create a "buy 2 get 1 at 50% off" promotion that repeats, so that I can offer a partial discount instead of fully free.
24. As a merchant, I want the cheapest item in each group to receive the discount, so that my margin is protected.
25. As a merchant, I want leftover items (not forming a complete group) to be charged at full price, so that partial groups don't get an unintended discount.
26. As a merchant, I want to scope the buy-get deal to specific products, collections, categories, types, or tags, so that only qualifying items form groups.
27. As a merchant, I want to combine the buy-get deal with activation rules, so that the deal only fires when the cart meets my conditions.
28. As a merchant, I want the buy-get deal to work with both auto-apply and code-entry.
29. As a merchant, I want to see the buy-get configuration on the promotion detail page.
30. As a merchant, I want to edit the buy-get configuration in a drawer/modal.

### Cross-Cutting

31. As a merchant, I want bundle and buy-get adjustments to stack when multiple promotions apply to the same items, so that the behavior is consistent with how Medusa handles standard promotions.
32. As a developer, I want the adjustment computation to be a pure function with no side effects, so that it is testable in isolation.
33. As a developer, I want adjustment results grouped by promotion before combining, so that I can add conflict resolution (e.g., best-deal-wins) in the future without restructuring.
34. As a developer, I want the target rule evaluator to be extensible, so that adding new attributes (e.g., `brand_id`, `manufacturer_id`) does not require restructuring the evaluator.

---

## 4. Implementation Decisions

### 4.1 New Model: `CartExtAdjustment`

A new model in the existing `promotion-ext` module. Table name: `cart_ext_adjustment`. Schema mirrors Medusa's `cart_line_item_adjustment` table (same fields in same order) with two additions:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | text (PK) | auto | Standard Medusa ID |
| `description` | text | no | Human-readable reason |
| `promotion_id` | text | no | Null for manual, set for bundle/buyget_repeat |
| `code` | text | no | Promotion code for bundle/buyget, auto-generated `MANUAL_<id>` for manual |
| `amount` | number | yes | Positive = discount, negative = surcharge (follows Medusa convention) |
| `raw_amount` | jsonb | yes | BigNumber raw value (Medusa pattern) |
| `provider_id` | text | no | Null (reserved, matches Medusa field) |
| `metadata` | jsonb | no | Freeform key-value (matches Medusa field) |
| `created_at` | datetime | auto | Migration-generated |
| `updated_at` | datetime | auto | Migration-generated |
| `deleted_at` | datetime | auto | Migration-generated |
| `item_id` | text | no | Null = cart-wide (spread at re-apply time), string = specific item |
| `is_tax_inclusive` | boolean | no | Matches Medusa field |
| `cart_id` | text | yes | Which cart this adjustment belongs to |
| `source` | text | yes | `"manual"` \| `"bundle"` \| `"buyget_repeat"` |

**Field consistency note:** All fields inherited from Medusa's adjustment table retain their original purpose. `provider_id` is always null (Medusa's own promotions also leave it null). `code` is repurposed for manual adjustments (auto-generated `MANUAL_<id>`) because Medusa's `addLineItemAdjustments` requires it. `item_id` is nullable (unlike Medusa's table where it's always set) to express cart-wide intent — the spread is computed dynamically at re-apply time.

### 4.2 Extended Model: `PromotionExtConfig`

Two new fields added:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `promotion_mode` | text | `"standard"` | `"standard"` \| `"bundle"` \| `"buyget_repeat"` |
| `mode_config` | jsonb | null | Shape determined by `promotion_mode` |

**Bundle `mode_config`:**
```ts
{
  bundle_size: number,          // items per bundle (e.g., 3)
  bundle_price: number,         // price for the bundle in smallest currency unit (e.g., 5000 = 50€)
  remainder: "full_price"       // leftover items pay regular price
}
```

**Buy-get repeat `mode_config`:**
```ts
{
  buy_quantity: number,         // items you pay for per group (e.g., 2)
  get_quantity: number,         // items discounted per group (e.g., 1)
  discount_type: "percentage" | "fixed",  // type of discount on the "get" items
  discount_value: number,       // 100 = free (if percentage), or fixed amount
  discount_target: "cheapest",  // which item in the group gets the discount
  remainder: "full_price"       // leftover items pay regular price
}
```

### 4.3 Medusa Promotion Configuration for Custom Modes

Bundle and buy-get repeat promotions are created in Medusa as `type: "standard"` with `application_method.value: 1`. **Not** `type: "buyget"`. See ADR-0004 for full rationale.

```ts
{
  code: "3FOR50",
  type: "standard",
  status: "active",
  application_method: {
    type: "fixed",
    target_type: "items",
    value: 1,
    allocation: "each",
    target_rules: [...]
  }
}
```

**Known UX gap:** Merchants must set `value: 1` manually until the admin UI hides the field and sets it programmatically for non-standard promotion modes. This should be documented in merchant-facing guides.

### 4.4 Admin API: Cart Adjustment CRUD

All endpoints are admin-authenticated only. No store-scoped endpoints exist.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/admin/cart-adjustments/:cart_id` | List all `CartExtAdjustment` rows for a cart. Supports `?source=manual` filter. Returns all sources by default. |
| `POST` | `/admin/cart-adjustments/:cart_id` | Create a manual adjustment. Auto-sets `source: "manual"`, `code: "MANUAL_<id>"`, `promotion_id: null`. |
| `PATCH` | `/admin/cart-adjustments/:id` | Update a manual adjustment. Restricted to `source: "manual"` — returns 400 for engine-computed rows. |
| `DELETE` | `/admin/cart-adjustments/:id` | Delete a manual adjustment. Restricted to `source: "manual"` — returns 400 for engine-computed rows. |

**POST body:**
```ts
{
  item_id?: string,         // null = cart-wide
  amount: number,           // positive = discount, negative = surcharge
  description?: string,
  is_tax_inclusive?: boolean
}
```

**Immediate application:** All CRUD operations immediately apply the change to Medusa's cart adjustments — `POST` calls `addLineItemAdjustments`, `DELETE` removes the Medusa `caliadj_*` record by matching `code`, `PATCH` removes and re-adds. The subscriber handles re-application on subsequent cart updates.

### 4.5 New Service: Adjustment Calculator (`adjustment-calculator.ts`)

A pure computation service with no DB calls or side effects. Two methods:

- `computeBundle(eligibleItems, modeConfig)` → returns per-item adjustment amounts grouped by promotion
- `computeBuyGetRepeat(eligibleItems, modeConfig)` → returns per-item adjustment amounts grouped by promotion

**Bundle computation logic:**
1. Sort eligible items (consistent ordering for deterministic spread)
2. Count total qualifying quantity
3. Calculate complete bundles: `Math.floor(totalQty / bundle_size)`
4. Calculate bundle total: `bundles * bundle_price`
5. Calculate remainder: items not in a complete bundle at full unit price
6. Calculate original total: `totalQty * unit_price` (per item)
7. Adjustment per item = proportional share of `(originalTotal - bundleTotal - remainderTotal)`

**Buy-get repeat computation logic:**
1. Sort eligible items by unit price ascending (cheapest first — for `discount_target: "cheapest"`)
2. Form groups of `buy_quantity + get_quantity` items
3. In each group, the cheapest `get_quantity` items receive the discount
4. Calculate discount per item based on `discount_type` and `discount_value`
5. Remainder items (not forming a complete group) pay full price

Returns adjustments grouped by promotion ID to support future conflict resolution.

### 4.6 New Service: Target Rule Evaluator

Reads a promotion's `application_method.target_rules` and filters cart items to determine eligibility. Supports all 5 native Medusa target rule attributes at launch:

| Attribute | Cart item field checked |
|---|---|
| `product` | `item.product_id` |
| `product_collection` | `item.product.collection_id` |
| `product_category` | `item.product.categories[].id` |
| `product_type` | `item.product.type_id` |
| `product_tag` | `item.product.tags[].id` |

Designed for extensibility — when `brand_id` and `manufacturer_id` are added (ADR-0003), they register as new attribute handlers in the evaluator map. The evaluator throws on unrecognized attributes to prevent silent misconfiguration.

### 4.7 Extended Subscriber: `cart-updated.ts`

The existing `cart.updated` subscriber is extended with the following sequential flow:

```
1. Layer 2: promotion delta (existing — add/remove auto-apply promotions)
2. For each applied promotion with promotion_mode != "standard":
   a. Read promotion's target_rules from Medusa
   b. Read cart items (with product relations for target rule evaluation)
   c. Filter eligible items via target rule evaluator
   d. Read mode_config from PromotionExtConfig
   e. Call adjustment-calculator with eligible items + mode_config
3. Read CartExtAdjustment rows with source: "manual" for this cart
4. Compute cart-wide spread for manual adjustments with item_id: null
   - Proportional spread based on each item's share of cart subtotal
   - Capped at cart subtotal to prevent negative totals
5. Combine all custom adjustments (bundle + buyget + manual)
6. Single addLineItemAdjustments call with everything
```

### 4.8 Extended Layer 3: Checkout Gate

The checkout gate (`validate-checkout.ts`) is extended to verify:
- All `CartExtAdjustment` rows for this cart have corresponding Medusa `caliadj_*` records (matched by `code`)
- If any are missing, throw `MedusaError` HTTP 400: "Cart adjustments are out of sync. Please refresh your cart and try again."

### 4.9 Adjustment Lifecycle

**Manual adjustments (`source: "manual"`):**
| Event | Action |
|---|---|
| Operator creates via API | Row created. Medusa `caliadj_*` written immediately. |
| Cart mutates | Medusa wipes `caliadj_*`. Subscriber re-creates from row. |
| Operator updates via API | Row updated. Medusa `caliadj_*` updated immediately. |
| Operator deletes via API | Row hard-deleted. Medusa `caliadj_*` removed immediately (by `code` match). |
| Cart completes (becomes order) | Row hard-deleted. Order has adjustments as `OrderLineItemAdjustment`. |

**Engine-computed adjustments (`source: "bundle"` / `"buyget_repeat"`):**
| Event | Action |
|---|---|
| Promotion applied to cart | Engine computes, writes rows with `promotion_id`. Medusa `caliadj_*` written. |
| Cart mutates | Old rows for this promotion deleted, new rows computed and written. Medusa `caliadj_*` re-created. |
| Promotion removed from cart | Rows hard-deleted. Medusa `caliadj_*` removed on next cycle. |
| Cart completes (becomes order) | Rows hard-deleted. Order has adjustments as `OrderLineItemAdjustment`. |

### 4.10 Admin UI

**Single widget file** on the promotion detail page (`promotion.details.after` zone). Two component sections:

1. **Activation Rules section** (existing) — read-only display of rule groups. Edit button opens rules editor drawer.
2. **Promotion Mode section** (new) — read-only display of `promotion_mode` and `mode_config` values. Edit button opens a `RouteFocusModal`/drawer with:
   - Promotion Mode dropdown: Standard / Bundle / Buy-Get Repeat
   - Conditional fields based on mode selection:
     - Bundle: bundle_size, bundle_price, remainder
     - Buy-Get Repeat: buy_quantity, get_quantity, discount_type, discount_value, discount_target, remainder
   - Standard: no additional fields (Medusa handles it natively)

Follows the Medusa convention: **page shows read-only data, drawer/modal contains the form**.

### 4.11 Conflict Resolution (Future)

When multiple bundle/buy-get promotions target the same items, adjustments stack (all apply). This is consistent with Medusa's native behavior for standard promotions.

The architecture supports future conflict resolution because:
- `adjustment-calculator.ts` returns adjustments **grouped by promotion** (not a flat array)
- The subscriber combines groups into a single array before the `addLineItemAdjustments` call
- A conflict resolver can be inserted between computation and combination — comparing total discount per group and selecting the best deal

No model changes are needed for this — a `conflict_resolution` field can be added to `PromotionExtConfig` later.

---

## 5. Testing Decisions

### What makes a good test
Tests should verify **external behavior** — given inputs, assert expected outputs. Do not test implementation details (internal method calls, specific DB queries, etc.). Tests should remain valid even if the internal implementation changes.

### Modules to test

**`adjustment-calculator.ts`** — Pure functions, highest testing value.
- Bundle computation: correct amounts for exact multiples, remainders, single items, empty input
- Buy-get repeat computation: correct identification of cheapest items, grouping, remainder handling, percentage vs fixed discounts
- Edge cases: quantity 0, quantity 1 (less than bundle size), all same price, single item in group
- Cart-wide spread: proportional distribution, cap at subtotal, items with zero subtotal

**`target-rule-evaluator.ts`** — Pure filtering, high testing value.
- Each of the 5 attributes: product, collection, category, type, tag
- Multiple rules combined (AND logic)
- Items with missing product relations (graceful handling)
- Unknown attribute throws error

**`rule-evaluator.ts`** (existing, extended) — Already has comprehensive tests. Add any new rule type tests if the evaluator is extended.

**Subscriber integration** — Test that the full flow works end-to-end:
- Manual adjustment persists across cart mutations
- Bundle adjustments recompute when quantities change
- Adjustments are cleaned up on cart completion
- Layer 3 blocks checkout when adjustments are out of sync

### Prior art
Existing tests in `src/lib/__tests__/rule-evaluator.unit.spec.ts` — follow the same pattern of pure function testing with descriptive test names and edge case coverage.

---

## 6. Out of Scope

- **Storefront UI** — The plugin is backend-only. How adjustments are displayed to customers is the storefront's responsibility.
- **Storefront notification flag** — No special flag on the cart response to indicate custom adjustments. Consumers can check `promotion_id: null` or `code` prefix.
- **Conflict resolution beyond stacking** — Best-deal-wins and priority-based resolution are deferred. Architecture supports it; no implementation now.
- **Remainder strategies beyond `"full_price"`** — Prorated remainder pricing is deferred until merchants request it.
- **Discount target beyond `"cheapest"`** — Most-expensive and configurable options are deferred.
- **Brand/manufacturer target rule support** — Deferred until ADR-0003 (item targeting) is implemented.
- **Admin UI for manual cart adjustments** — The CRUD API is admin-authenticated; a UI for operators to manage manual adjustments on specific carts is deferred. Operators use the API directly or through an integrated tool.
- **Abandoned cart cleanup** — `CartExtAdjustment` rows for abandoned carts accumulate. No scheduled cleanup job in this version.

---

## 7. Further Notes

### Interaction with existing features

- **Activation rules (existing)** continue to work as-is. `promotion_mode` is orthogonal to activation rules — rules gate whether the promotion fires, mode controls what happens when it does.
- **Item targeting (ADR-0003, not yet implemented)** will work with custom promotion modes once the target rule evaluator is extended to support `brand_id` and `manufacturer_id`.
- **Auto-apply (Layer 2)** works with all promotion modes. A `promotion_mode: "bundle"` promotion with `auto_apply: true` is automatically applied and its bundle adjustments are computed on every cart update.

### Implementation ordering

Feature 1 (manual adjustments) is the foundation — it introduces the `CartExtAdjustment` model, the subscriber extension, and the re-apply mechanism. Features 2 and 3 (bundle/buy-get) build on top of it by adding `promotion_mode` / `mode_config` to `PromotionExtConfig` and the adjustment calculator service.

Recommended build order:
1. `CartExtAdjustment` model + CRUD API + subscriber re-apply logic
2. Manual adjustment spread computation (cart-wide)
3. Layer 3 checkout validation extension
4. `promotion_mode` + `mode_config` fields on `PromotionExtConfig`
5. Target rule evaluator
6. Adjustment calculator (bundle)
7. Adjustment calculator (buy-get repeat)
8. Subscriber integration for bundle/buy-get
9. Admin UI: promotion mode section

### Known design trade-offs

1. **`value: 1` workaround** — Bundle/buy-get promotions show 1-cent adjustments in the async window. Accepted. See ADR-0004.
2. **No hook between computeActions and setLineItemAdjustments** — Forces the re-apply-after-wipe strategy. Accepted. See ADR-0005.
3. **Target rule evaluation duplicated** — The plugin evaluates target rules independently from Medusa. Necessary because `value: 1` makes Medusa's output unreliable for determining eligible items. The evaluator must be kept in sync with any new Medusa target rule attributes.
4. **Stacking instead of best-deal-wins** — Multiple custom-mode promotions on the same items stack. May produce unexpectedly large discounts. Merchants must be careful not to create overlapping bundle/buy-get promotions on the same products until conflict resolution is added.
