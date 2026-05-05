# Medusa v2 Promotion Engine — Research & Findings

## Goal
Create a "Spend $100 and get free shipping" promotion via the API.

---

## Promotion Types

| Type | Description |
|---|---|
| `standard` | Discount with rules. Applies to items, shipping, or order. |
| `buyget` | "Buy X get Y". Has `buy_rules` (what must be in cart) and `target_rules` (what gets discounted). |

---

## Data Model

```
Promotion
  ├── type: "standard" | "buyget"
  ├── is_automatic: boolean
  ├── rules: [PromotionRule]           ← WHO can use it / cart-level conditions
  └── application_method: ApplicationMethod
        ├── type: "fixed" | "percentage"
        ├── target_type: "items" | "shipping_methods" | "order"
        ├── allocation: "each" | "across" | "once"
        ├── value: number
        ├── buy_rules: [PromotionRule]    ← buyget only: item-level conditions
        ├── target_rules: [PromotionRule] ← which items/shipping methods get discount
        ├── buy_rules_min_quantity        ← buyget only
        └── apply_to_quantity             ← buyget only

PromotionRule
  ├── attribute: string   (dot-path into context object)
  ├── operator: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte"
  └── values: string[]
```

---

## Rule Evaluation — Two Different Contexts

### `Promotion.rules` — evaluated against the full cart object

Scope: `ORDER`. No prefix stripping. `pickValueFromObject(attribute, fullCart)`.

Valid attributes (from `cartFieldsForRefreshSteps`):
```
currency_code, sales_channel_id, region_id, email, locale
region.id, region.currency_code
shipping_address.country_code
customer.id, customer.groups.id
item_total, subtotal, total, item_subtotal, shipping_subtotal   ← see warning below
```

### `ApplicationMethod.buy_rules` / `target_rules` — evaluated per individual item

Scope: `ITEMS`. The prefix `items.` is stripped before path resolution. Each item is a `ComputeActionItemLine`.

Valid attributes (must include `items.` prefix in the rule):
```
items.product.id
items.product.collection_id
items.product.type_id
items.product.categories.id
items.product.tags.id
items.variant.id
```

> **`buy_rules` CANNOT check cart-level totals** (`item_total`, `subtotal`).
> They run per-item, and individual items have no cart total.

### `ApplicationMethod.target_rules` for shipping — evaluated per shipping method

Scope: `SHIPPING_METHODS`. Strip `shipping_methods.` prefix.

Valid attributes:
```
shipping_methods.shipping_option.shipping_option_type_id
```

---

## ⚠️ Warning: BigNumber Fields

Cart total fields (`subtotal`, `item_total`, `total`, etc.) are `BigNumber` objects in the Medusa service layer. When passed through the graph query layer to the promotion engine, they may be serialized as plain numbers or remain as objects.

**If they are BigNumber objects**, `flattenObjectToKeyValuePairs` will NOT produce a `"subtotal"` key — instead it digs into the BigNumber's internal properties (`subtotal.numeric_`, `subtotal.raw_.value`, etc.). This causes the DB pre-filter to exclude the promotion entirely.

**TODO: Verify** what `subtotal` looks like in the raw cart JSON (check the JSON tab in the admin draft order view).

---

## ApplicationMethod Validation Rules (from source)

| Condition | Requirement |
|---|---|
| `target_type` is `items` or `shipping_methods` | `allocation` is required |
| `allocation` is `each` or `once` | `max_quantity` is required |
| `allocation` is `across` | `max_quantity` must NOT be set |
| `type` is `buyget` | `apply_to_quantity`, `buy_rules_min_quantity`, `max_quantity` are all required |
| `type` is `percentage` | `value` must be 1–100 |

---

## Failed Attempts

### Attempt 1 — Missing `allocation`
```json
{ "application_method": { "type": "percentage", "target_type": "shipping_methods", "value": 100 } }
```
**Error:** `allocation should be either 'across OR each OR once' when target_type is 'shipping_methods'`

### Attempt 2 — `allocation: "each"` without `max_quantity`
```json
{ "application_method": { ..., "allocation": "each" } }
```
**Error:** `max_quantity is required when allocation is 'each OR once'`

### Attempt 3 — `allocation: "across"` ✓ (creation succeeded)
```json
{ "application_method": { ..., "allocation": "across" } }
```
Created successfully. But promotion did not apply.

### Attempt 4 — `attribute: "total"`
Applied discount regardless of cart total.
**Root cause:** `total` = `item_total` + shipping. Cart's total was already ≥ 10000, OR the wrong promotion (no-rule one) was being applied due to UI bug.

### Attempt 5 — `attribute: "subtotal"`
Promotion did not apply.
**Likely root cause:** Draft cart had no shipping method — nothing to discount. Or BigNumber serialization issue with the `subtotal` field.

---

## `is_automatic` Behavior

- `is_automatic: true` → Promotion does NOT appear in the admin "Edit Promotions" drawer for draft orders. Applied automatically when cart matches rules (storefront flow).
- `is_automatic: false` → Appears in the drawer. Must be manually applied. Rules still enforce the conditions.

> **Note:** For draft orders in admin, automatic promotions may not be evaluated at all. Prefer `is_automatic: false` + manual code application for draft order testing.

---

## Current Best Guess — Correct API Call

```json
POST /admin/promotions
{
  "code": "FREE-SHIP-100",
  "type": "standard",
  "is_automatic": false,
  "status": "active",
  "application_method": {
    "type": "percentage",
    "target_type": "shipping_methods",
    "value": 100,
    "allocation": "across"
  },
  "rules": [
    {
      "attribute": "item_total",
      "operator": "gte",
      "values": ["10000"]
    }
  ]
}
```

**Prerequisites for this to work:**
1. Cart must have a shipping method added.
2. `item_total` must serialize as a plain number (not BigNumber object) in the cart context.
3. Amounts are in smallest currency unit (cents for USD) — `"10000"` = $100.

---

## Open Questions

- [ ] Does `item_total` / `subtotal` serialize as a plain number or BigNumber object in the cart context passed to `computeActions`?
- [ ] Do automatic promotions get evaluated in the admin draft order flow?
- [ ] Is `item_total` the right attribute (items only, before shipping) vs `subtotal` (items + shipping before tax)?

---

## Key Source Files

| File | Purpose |
|---|---|
| `@medusajs/types/dist/promotion/common/compute-actions.d.ts` | `ComputeActionContext` type definition |
| `@medusajs/promotion/dist/utils/validations/promotion-rule.js` | `areRulesValidForContext` — rule evaluation logic |
| `@medusajs/promotion/dist/utils/compute-actions/build-promotion-rule-query-filter-from-context.js` | DB pre-filter for promotions |
| `@medusajs/promotion/dist/utils/compute-actions/buy-get.js` | BuyGet promotion computation |
| `@medusajs/promotion/dist/utils/validations/application-method.js` | ApplicationMethod validation rules |
| `@medusajs/core-flows/dist/cart/utils/fields.js` | `cartFieldsForRefreshSteps` — what cart fields are fetched |
| `@medusajs/core-flows/dist/cart/workflows/update-cart-promotions.js` | How `computeActionContext: cart` is built |
| `@medusajs/utils/dist/common/flatten-object-to-key-value-pairs.js` | How context is flattened for DB pre-filter |
| `@medusajs/utils/dist/common/pick-value-from-object.js` | How attribute paths are resolved |
