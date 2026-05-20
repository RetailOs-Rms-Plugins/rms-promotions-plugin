# SPEC: Brand & Manufacturer Item Targeting

**Status:** Ready for implementation  
**Date:** 2026-05-20  
**ADR reference:** `docs/metadata-promotion-enforcement/adr/0003-native-promotion-target-rules-for-brand-manufacturer.md`

---

## 1. Overview

This feature adds item-level targeting to promotions managed by this plugin. A merchant can restrict which cart items a promotion discount applies to by selecting one or more brands and/or manufacturers. Only items whose products are linked (via `rms-products-bridge`) to the selected entities receive the discount adjustment; all other items in the cart are unaffected.

**This is distinct from the existing activation rules** (Layers 1–3). Activation rules determine whether a promotion fires at all. Item targeting determines which items inside the cart receive the discount once the promotion has fired.

**Example:**  
A merchant creates a 10% discount promotion. Without item targeting, the 10% applies across all cart items. With item targeting set to `brand_id in [brand_nike_01, brand_adidas_01]`, the 10% only applies to Nike and Adidas products. Items from other brands are not discounted.

---

## 2. Scope

**In scope:**
- Brand and manufacturer as supported item targeting attributes
- Operators: `in`, `eq`, `nin` (not in)
- Admin drawer UI for managing item conditions on a promotion
- Backend hook to enrich cart items with brand/manufacturer IDs
- Backend API to create/read/delete item target rules
- `Combobox` component (single-select with search, for existing scope pickers)
- `MultiCombobox` component (multi-select with search, for brand/manufacturer selection)

**Out of scope:**
- Any other custom targeting attributes (future extension possible via same pattern)
- Storefront UI
- Targeting by supplier (not a link-supported entity in current bridge plugin version)
- Changing how existing activation rules (comparison type) work

---

## 3. How It Works (End-to-End)

```
1. Admin opens the promotion page
2. Admin clicks "Edit item conditions" in the plugin widget
3. Drawer opens — admin selects brands and/or manufacturers and chooses operator
4. On save, our API endpoint creates native PromotionRule records via promotionModuleService
   (bypasses Medusa's admin API attribute validator)

5. Customer adds promo code or cart updates
6. updateCartPromotionsWorkflow fires
7. setPromotionContext hook runs:
   a. Checks if any target rule on this promotion uses brand_id or manufacturer_id
   b. If yes: queries the link system for brand/manufacturer IDs for all product_ids in the cart
   c. Returns { items: enrichedItems } where each item has brand_id: string[] and manufacturer_id: string[]
8. computeActions runs with the enriched context
9. areRulesValidForContext checks each item's brand_id/manufacturer_id array against the target rule values
10. Only matching items receive ADD_ITEM_ADJUSTMENT — Medusa handles allocation, budget, tax
```

---

## 4. Backend

### 4.1 New API Endpoint: Item Target Rules

A single endpoint manages all item target rules for a promotion. Rules are stored as native Medusa `PromotionRule` records — no new plugin tables are needed.

> **Why a custom endpoint instead of Medusa's `/admin/promotions/:id/rules`?**  
> Medusa's admin API validates that rule `attribute` values belong to a known list. `brand_id` and `manufacturer_id` are not on that list and would be rejected with a 400. Our endpoint calls the promotion module service directly, bypassing this validation.

#### `GET /admin/promotion-item-conditions/:promotion_id`

Returns all item target rules for the given promotion (only `brand_id` and `manufacturer_id` attributes).

**Response:**
```ts
{
  item_conditions: Array<{
    id: string            // PromotionRule id
    attribute: "brand_id" | "manufacturer_id"
    operator: "in" | "eq" | "nin"
    values: Array<{ id: string; value: string }>  // PromotionRuleValue records
  }>
}
```

#### `POST /admin/promotion-item-conditions/:promotion_id`

Replaces all item target rules for the promotion (full replace, not merge). The payload describes the desired final state.

**Request body:**
```ts
{
  conditions: Array<{
    attribute: "brand_id" | "manufacturer_id"
    operator: "in" | "eq" | "nin"
    values: string[]   // brand IDs or manufacturer IDs
  }>
}
```

**Implementation steps:**
1. Validate: `attribute` must be `"brand_id"` or `"manufacturer_id"` only — reject anything else with 400
2. Validate: `operator` must be one of `"in"`, `"eq"`, `"nin"`
3. Validate: `values` must be non-empty array of strings
4. Fetch the promotion's `application_method.id` via Medusa's promotion module service
5. Delete all existing `PromotionRule` records on that application method where `attribute` is `brand_id` or `manufacturer_id` (do not touch native Medusa target rules like product_id, category_id)
6. Call `promotionModuleService.addRules(applicationMethodId, conditions.map(c => ({ attribute: c.attribute, operator: c.operator, values: c.values.map(v => ({ value: v })) })))` for each condition
7. Return the created rules

#### `DELETE /admin/promotion-item-conditions/:promotion_id`

Removes all brand/manufacturer item target rules from the promotion.

**Implementation:** same as POST step 5 only — delete existing, create nothing.

---

### 4.2 setPromotionContext Hook

**File location:** `src/subscribers/set-promotion-item-context.ts` (or `src/workflows/hooks/promotion-item-context.ts` — follow whichever convention matches existing hook files in the repo)

**Registration:**
```ts
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"

updateCartPromotionsWorkflow.hooks.setPromotionContext(
  async ({ cart }, { container }) => {
    // implementation below
  }
)
```

**Implementation logic:**

```
1. Extract all product_ids from cart.items (deduplicated)

2. Determine which promotions being applied have brand_id or manufacturer_id target rules.
   NOTE: at the point setPromotionContext runs, the list of promotion codes being applied
   is not directly in scope — the hook only receives { cart }. Therefore:
   - Check if ANY promotion on the cart (cart.promotions[].code) has our custom target rules
   - OR: always enrich — the cost is one extra link query, and the correctness guarantee is stronger
   
   Recommended: always enrich when the cart has items, regardless of which promotions are active.
   The link query is a single bulk fetch — not N queries.

3. Query the link system for brand associations:
   container.resolve(QUERY).graph({
     entity: "product_brand",    // ProductBrandLink.entryPoint
     fields: ["product_id", "brand_id"],
     filters: { product_id: productIds },
   })

4. Query the link system for manufacturer associations:
   container.resolve(QUERY).graph({
     entity: "product_manufacturer",   // ProductManufacturerLink.entryPoint
     fields: ["product_id", "manufacturer_id"],
     filters: { product_id: productIds },
   })

5. Build lookup maps:
   brandsByProduct: Map<product_id, brand_id[]>
   manufacturersByProduct: Map<product_id, manufacturer_id[]>

6. Return enriched items:
   return new StepResponse({
     items: cart.items.map(item => ({
       ...item,
       brand_id: brandsByProduct.get(item.product_id) ?? [],
       manufacturer_id: manufacturersByProduct.get(item.product_id) ?? [],
     }))
   })
```

**Graceful degradation:** if `rms-products-bridge` is not installed, the link entity queries will fail. Wrap in try/catch — on any error, log a warning and return `new StepResponse({})` (no-op, items unchanged). The promotion rules with `brand_id`/`manufacturer_id` will evaluate against items with no such property and will not match — no discount applied for those conditions. This is the correct safe default: fail closed on targeting rather than fail open.

---

### 4.3 Impact on Existing Three Layers

The `setPromotionContext` hook also fires during Layer 1 (code gate) because Layer 1 uses `updateCartPromotionsWorkflow`. This is correct — when a customer applies a promo code, the enrichment runs and the target rule filtering applies during that same workflow invocation.

Layer 2 (auto-apply engine) calls `updateCartPromotionsWorkflow` internally — the hook fires automatically.

Layer 3 (checkout gate) does **not** re-run `computeActions` — it validates our custom activation rules only, not Medusa's target rules. Adjustment amounts locked at the last cart update are what the order is created with. No change needed in Layer 3.

---

## 5. Frontend

### 5.1 New Components

#### `Combobox` — Single-select with search

**File:** `src/admin/components/ui/combobox.tsx`

Adapted from `FieldCombobox` in `rms-search-and-filter`. Accepts static options as props.

```ts
type ComboboxOption = { value: string; label: string }

type ComboboxProps = {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
  className?: string
}
```

**Usage:** replaces the current raw text inputs for `scope.product_id` and `scope.collection_id` in the existing rule editor once entity-picker improvement is implemented (see PRD Section 9 — "Scope field entity pickers"). Also usable wherever a single-select searchable dropdown is needed.

**Behavior:**
- Popover trigger showing selected label (or placeholder)
- `cmdk` Command inside the Popover with search input
- Selects one value, closes popover on select
- Uses `@medusajs/ui` Popover and `cmdk` library (already in project dependencies)

#### `MultiCombobox` — Multi-select with search

**File:** `src/admin/components/ui/multi-combobox.tsx`

New component. Same visual shell as `Combobox` but supports selecting multiple values.

```ts
type ComboboxOption = { value: string; label: string }

type MultiComboboxProps = {
  value: string[]
  onChange: (value: string[]) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
  className?: string
}
```

**Behavior:**
- Trigger button shows selected items as `Badge` chips (from `@medusajs/ui`). If none selected, shows placeholder.
- Popover does NOT close on select — stays open so the user can select multiple items
- Each option in the list shows a checkmark icon when selected
- Clicking a selected option deselects it (toggle behavior)
- A "Clear all" option at the bottom of the list
- Search filters options by label (cmdk handles this natively)

**Trigger button layout example:**
```
┌─────────────────────────────────────────────────┐
│ [Nike ×] [Adidas ×] [Puma ×]        ▼           │
└─────────────────────────────────────────────────┘
```

---

### 5.2 New Hooks

#### `useBrands`

**File:** `src/admin/hooks/brands/use-brands.ts`

```ts
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

export const BRANDS_QUERY_KEY = "brands"

export const useBrands = (query?: { limit?: number; offset?: number }) => {
  return useQuery({
    queryKey: [BRANDS_QUERY_KEY, query],
    queryFn: () =>
      sdk.client.fetch<{ brands: Array<{ id: string; name: string }> }>(
        "/admin/v1/brands",
        { query }
      ),
  })
}
```

Returns `{ data, isLoading, error }`. The drawer uses `data?.brands ?? []` mapped to `{ value: id, label: name }` for `MultiCombobox` options.

#### `useManufacturers`

**File:** `src/admin/hooks/manufacturers/use-manufacturers.ts`

Same pattern as `useBrands` but calls `/admin/v1/manufacturers`.

```ts
export const MANUFACTURERS_QUERY_KEY = "manufacturers"

export const useManufacturers = (query?: { limit?: number; offset?: number }) => {
  return useQuery({
    queryKey: [MANUFACTURERS_QUERY_KEY, query],
    queryFn: () =>
      sdk.client.fetch<{ manufacturers: Array<{ id: string; name: string }> }>(
        "/admin/v1/manufacturers",
        { query }
      ),
  })
}
```

#### `usePromotionItemConditions`

**File:** `src/admin/hooks/promotion-item-conditions/use-promotion-item-conditions.ts`

```ts
export const ITEM_CONDITIONS_QUERY_KEY = "promotion-item-conditions"

// Fetch
export const usePromotionItemConditions = (promotionId: string) => {
  return useQuery({
    queryKey: [ITEM_CONDITIONS_QUERY_KEY, promotionId],
    queryFn: () =>
      sdk.client.fetch<{ item_conditions: ItemCondition[] }>(
        `/admin/promotion-item-conditions/${promotionId}`
      ),
    enabled: !!promotionId,
  })
}

// Save (full replace)
export const useSavePromotionItemConditions = (promotionId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conditions: ItemConditionInput[]) =>
      sdk.client.fetch(`/admin/promotion-item-conditions/${promotionId}`, {
        method: "POST",
        body: { conditions },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEM_CONDITIONS_QUERY_KEY, promotionId] })
    },
  })
}

// Delete all
export const useDeletePromotionItemConditions = (promotionId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/promotion-item-conditions/${promotionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEM_CONDITIONS_QUERY_KEY, promotionId] })
    },
  })
}
```

**Types:**
```ts
type ItemCondition = {
  id: string
  attribute: "brand_id" | "manufacturer_id"
  operator: "in" | "eq" | "nin"
  values: Array<{ id: string; value: string }>
}

type ItemConditionInput = {
  attribute: "brand_id" | "manufacturer_id"
  operator: "in" | "eq" | "nin"
  values: string[]
}
```

---

### 5.3 "Edit Item Conditions" Drawer

**File:** `src/admin/components/item-conditions/item-conditions-drawer.tsx`

Opened from the promotion widget. Manages brand and manufacturer target rules.

#### Trigger (in the widget)

The existing widget (`promotion-rules-widget.tsx`) gains a second button in its header: **"Item Conditions"** (or "Edit item conditions"). Clicking it sets `itemConditionsOpen: true` state, which renders this drawer.

A read-only summary of current item conditions is shown in the widget body below the activation rules summary. Example display:
```
Item conditions
  Brand  is in  Nike, Adidas
  Manufacturer  is not in  CheapBrand Co.
```
If no conditions: show "No item conditions — discount applies to all items."

#### Drawer Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Edit item conditions                              [×]        │
├─────────────────────────────────────────────────────────────┤
│ The discount will be applied only to items that match       │
│ ALL of the following conditions.                            │
│                                                             │
│ ┌─ Condition row ─────────────────────────────────────────┐ │
│ │ [Brand ▼]  [is in ▼]  [Nike × Adidas ×         ▼]  [×] │ │
│ └─────────────────────────────────────────────────────────┘ │
│            AND                                              │
│ ┌─ Condition row ─────────────────────────────────────────┐ │
│ │ [Manufacturer ▼]  [is in ▼]  [Select...         ▼]  [×] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ + Add condition                                             │
├─────────────────────────────────────────────────────────────┤
│                                [Cancel]  [Save conditions]  │
└─────────────────────────────────────────────────────────────┘
```

**Notes:**
- Conditions are always AND-combined (multiple conditions: all must match on the same item). No combinator toggle — this is fixed and noted in the subtitle copy.
- Each condition row has three parts:
  1. **Attribute dropdown** (`Combobox`) — options: "Brand", "Manufacturer". Maps to `brand_id` / `manufacturer_id`.
  2. **Operator dropdown** (`Combobox`) — options: "is in", "equals", "is not in". Maps to `in` / `eq` / `nin`.
  3. **Values multi-select** (`MultiCombobox`) — options fetched from `useBrands` or `useManufacturers` depending on selected attribute. Lazy-loaded when attribute is selected.
  4. **Delete row** button (×)
- "+ Add condition" appends a new empty row (attribute unset, operator defaults to `in`, values empty)
- Only one condition per attribute type is enforced by the UI (can't have two Brand conditions — if user adds a second Brand row, merge the selected values into the first)
- If the form is dirty and the user tries to close, show a Prompt: "Discard changes?"
- On save: call `useSavePromotionItemConditions` with the current form state. Empty values array on a row = validation error, don't submit.

#### Form state shape

```ts
type FormState = {
  conditions: Array<{
    attribute: "brand_id" | "manufacturer_id" | ""
    operator: "in" | "eq" | "nin"
    values: string[]  // IDs
  }>
}
```

Use `react-hook-form` with `useFieldArray` for the conditions array, consistent with existing rule editor patterns.

#### Loading states

- While `useBrands` / `useManufacturers` are loading: show a spinner inside the `MultiCombobox` popover
- While saving: disable Save button, show loading spinner on it
- On save error: show an inline error toast via `useToast` (Medusa UI pattern)

---

## 6. Operators

| Operator | Value shown to admin | `PromotionRule` operator stored | Semantic |
|---|---|---|---|
| `in` | "is in" | `in` | At least one of the item's brand/manufacturer IDs appears in the selected values |
| `eq` | "equals" | `eq` | The item's brand/manufacturer IDs exactly match all selected values (exact set equality — rare use case) |
| `nin` | "is not in" | `nin` | None of the item's brand/manufacturer IDs appear in the selected values |

**Recommended default:** `in` — covers the most common merchant use case ("discount products from these brands").

---

## 7. Data Integrity

- **If a brand is deleted** from `rms-products-bridge` after being referenced in a target rule: the `PromotionRuleValue.value` (the brand ID) becomes a dangling reference. The product will no longer be linked to that brand ID in the link table. The rule will simply not match any items — the promotion still fires, but no items qualify under that condition. This is safe (fail-closed). No cascade handling is required in this plugin — the bridge plugin manages its own entity lifecycle.

- **If a promotion is deleted:** Medusa cascades deletion of all associated `PromotionRule` and `PromotionRuleValue` records. Our custom `brand_id`/`manufacturer_id` target rules are deleted automatically. No subscriber needed.

- **If `rms-products-bridge` is not installed:** the `setPromotionContext` hook degrades gracefully — items are returned without enrichment, rules never match, no discount applied to any item under brand/manufacturer conditions. A warning is logged. The rest of the promotion (activation rules, any native Medusa target rules) continues to work normally.

---

## 8. File Structure

New files to create:

```
src/
├── admin/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── combobox.tsx                          ← single-select with search
│   │   │   └── multi-combobox.tsx                    ← multi-select with search
│   │   └── item-conditions/
│   │       └── item-conditions-drawer.tsx             ← the full drawer
│   └── hooks/
│       ├── brands/
│       │   └── use-brands.ts
│       ├── manufacturers/
│       │   └── use-manufacturers.ts
│       └── promotion-item-conditions/
│           └── use-promotion-item-conditions.ts
├── api/
│   └── admin/
│       └── promotion-item-conditions/
│           └── [promotion_id]/
│               └── route.ts                          ← GET, POST, DELETE handlers
└── subscribers/
    └── set-promotion-item-context.ts                 ← setPromotionContext hook
```

Modified files:

```
src/admin/widgets/promotion-rules-widget.tsx          ← add "Item Conditions" button + summary section
```

---

## 9. Implementation Order

Implement in this order to allow incremental testing:

1. **Backend hook** (`set-promotion-item-context.ts`) — can be tested in isolation by checking if cart items get enriched correctly; no frontend needed
2. **Backend API** (`promotion-item-conditions/[promotion_id]/route.ts`) — test via curl/Postman
3. **`useBrands` and `useManufacturers` hooks** — simple wrappers, no dependencies
4. **`MultiCombobox` component** — standalone, no data dependencies
5. **`Combobox` component** — standalone
6. **`usePromotionItemConditions` hook** — depends on API being live
7. **`item-conditions-drawer.tsx`** — depends on all of the above
8. **Widget integration** — wire the drawer open/close and add the read-only summary

---

## 10. Open Questions (resolve before implementation)

1. **`setPromotionContext` hook — promotion code scope:** at hook invocation time, does the hook receive which promotion code is being applied (to know whether to enrich)? If not, always enrich unconditionally (the recommended approach above). Verify by reading the hook signature from Medusa source at implementation time.

2. **`areRulesValidForContext` array semantics:** for an item with `brand_id: ["brand_01", "brand_02"]` and a rule `brand_id in ["brand_01"]` — does Medusa's evaluator correctly detect the match? The source reading suggests yes (it flattens item attributes), but verify with a live integration test before shipping.

3. **Operator `eq` behavior on arrays:** the `eq` operator in `areRulesValidForContext` checks that ALL checked values exist in the rule values set. For a multi-brand product, this could produce surprising results. Consider hiding `eq` from the UI and exposing only `in` and `nin` to merchants, adding `eq` later if a clear use case emerges.

4. **Pagination in brand/manufacturer dropdowns:** `useBrands` and `useManufacturers` fetch a page of results. If the organization has hundreds of brands, the multi-select needs search-driven pagination (search term sent to the API) rather than client-side filtering. Confirm typical brand catalog size before choosing between client-side and server-side filtering.
