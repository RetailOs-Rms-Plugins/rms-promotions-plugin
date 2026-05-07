# PRD: RMS Promotion Rules Extension Plugin

## 1. What We Want to Achieve

Medusa's native promotion system handles discount *calculation* well — percentages, fixed amounts, buy-get logic — but its eligibility rules are limited to **who** can use a promotion (sales channel, region, customer group, currency). It has no native way to express **when** a promotion applies based on live cart state: minimum subtotal, item quantities, first-order status, per-customer usage caps, and so on.

This plugin extends Medusa's native promotion engine with a custom **cart-state rule system**. Merchants create promotions normally in the Medusa admin (setting discount type, value, and native eligibility), then attach additional custom rules via a plugin widget on the promotion page. The plugin owns enforcement of those rules across the full cart lifecycle — from code entry through checkout.

The plugin does **not** replace or modify Medusa's discount calculation. It only adds conditions that gate whether a promotion is active on a given cart.

---

## 2. Scope and Boundaries

**In scope:**
- Custom rule definition: a structured set of conditions stored per promotion
- Three-layer enforcement: synchronous gates on code entry and checkout, async auto-apply engine
- `rms_auto_apply` flag: controls whether a promotion is auto-applied or code-only
- Admin widget on the promotion detail page for rule management
- Full REST API for rule CRUD
- Include and exclude condition groups
- All rule types listed in Section 4

**Out of scope:**
- Any changes to Medusa's discount calculation logic
- Discount stacking configuration — left to Medusa's native behavior
- Separate admin pages for rules (rules are only accessible through their promotion)
- Storefront UI
- Error message localization/customization (noted for future — see Section 10)

---

## 3. Promotion Examples and Rule Breakdown

The table below maps real merchant promotion descriptions to the Medusa-native components and the custom rules this plugin must enforce. Prices and quantities are illustrative — the system supports any values.

| Promotion Description | Medusa Native Handles | Custom Rules Required |
|---|---|---|
| On sale for ₪69 — with purchase over ₪299 | Fixed price adjustment | `subtotal gte 299` |
| 10% Discount — January | Percentage discount + `starts_at`/`ends_at` | None |
| Buy from Milk & Honey range → get miniature | BuyGet type + collection condition | None |
| 2 units for ₪120 | BuyGet quantity | `quantityOfProduct gte 2` |
| Reach ₪1,000 → get 5% discount | Percentage discount | `subtotal gte 1000` |
| Second item at 50% discount | BuyGet, 50% on item 2 | `quantity gte 2` |
| 10% off on purchases over ₪300 | Percentage discount | `subtotal gte 300` |
| Buy for ₪350 — pay only ₪299 | Fixed amount off | `subtotal gte 350` |
| 3 + 1 on the cheapest item | BuyGet — cheapest free | `quantity gte 3` |
| 4 units for ₪32 | Fixed price adjustment | `quantityOfProduct gte 4` |

**Observation:** the two custom rule types that cover all ten examples are `subtotal` and `quantity`/`quantityOfProduct`. The full rule set the plugin supports (Section 4) extends well beyond these to cover a broad range of real-world requirements.

---

## 4. Rule Design

### 4.1 Rule Structure: Field + Operator + Value

Each rule is a **triple**:

```ts
type Rule = {
  field: RuleField
  operator: RuleOperator
  value: number | string | string[] | boolean
  scope?: {
    product_id?: string
    collection_id?: string
  }
}
```

The `scope` field is only present for product- or collection-scoped fields (`quantityOfProduct`, `quantityOfCollection`). It holds the ID of the product or collection the rule applies to.

Operators are **data-type-aware** — the UI only presents valid operators for the selected field type (a pattern used by Braze, Segment, and Adobe Analytics to prevent nonsensical rule creation).

### 4.2 Supported Fields and Operators

| Field | Description | Valid Operators | Value Type |
|---|---|---|---|
| `subtotal` | Cart item subtotal (pre-discount) | `eq` `neq` `gt` `gte` `lt` `lte` | number |
| `quantity` | Total item count in cart | `eq` `neq` `gt` `gte` `lt` `lte` | number |
| `quantityOfProduct` | Quantity of a specific product in cart | `eq` `neq` `gt` `gte` `lt` `lte` | number |
| `quantityOfCollection` | Quantity of items from a specific collection | `eq` `neq` `gt` `gte` `lt` `lte` | number |
| `usesPerCustomer` | How many times this customer has already used this promotion | `lt` `lte` | number |
| `customerGroup` | Customer belongs to a Medusa Customer Group | `in` `nin` | string[] (customer group IDs) |
| `firstOrder` | Customer has zero completed orders | `eq` | boolean |

> **Note on `usesPerCustomer`:** Medusa natively supports a total usage cap (`usage_limit`) but not a per-customer cap. This rule fills that gap by querying order history at evaluation time.

> **Note on `customerGroup`:** values are Medusa **Customer Group IDs** (e.g. `cusgrp_vip`), not group names. IDs are stable — group names can be renamed without breaking rules. The rule evaluator reads `cart.customer.groups[].id`. On guest carts (no customer attached), `customerGroup` rules are skipped and treated as passing — see Section 5 for guest cart behavior.

> **Note on opposites:** Fields like `subtotal` and `quantity` express both minimum and maximum constraints via operators — `subtotal gte 100` sets a minimum; `subtotal lte 500` sets a maximum. No separate `minSubtotal`/`maxSubtotal` keys are needed.

### 4.3 Rule Sets: ORs of ANDs

A promotion holds one or more **Rule Sets**. The logic is:

- Rules **within** a Rule Set are joined by **AND** — all must pass
- Rule Sets are joined by **OR** — if any set passes, the promotion is eligible

This is Disjunctive Normal Form (DNF) — the same model used by Braze, Segment, and Shopify for their condition builders. It was chosen because merchants naturally think in scenarios ("apply if the customer does *this* OR *that*"), and each Rule Set represents one complete scenario.

**Example — cart between ₪100 and ₪500:**
```
Rule Set 1: subtotal gte 100  AND  subtotal lte 500
```

**Example — 4 shirts OR spend over ₪200:**
```
Rule Set 1: quantityOfProduct gte 4 (scope: shirt product)
    OR
Rule Set 2: subtotal gte 200
```

Because this is one promotion with one discount, both conditions triggering simultaneously still results in a single discount application — no doubling.

### 4.4 Exclusion Rule Sets

Inspired by Braze's exclusion group pattern, a promotion may also carry **Exclusion Rule Sets**. These work as AND NOT gates: if any exclusion set passes, the promotion is suppressed even if an include set also passes.

**Example — all carts over ₪300 except VIP customers (who have a separate deal):**
```
Include:  subtotal gte 300
Exclude:  customerGroup in ["vip"]
```

Exclusion sets use the same field/operator/value structure and the same AND-within/OR-between logic as include sets.

### 4.5 `rms_auto_apply` Flag

Each promotion managed by this plugin carries a **promotion-level boolean flag**: `rms_auto_apply`.

| Value | Behavior |
|---|---|
| `true` | Layer 2 (auto-apply engine) manages this promotion — it is added and removed from carts automatically as cart state changes |
| `false` (default) | Promotion is **code-only** — the customer must enter a code; Layer 2 never touches it |

**Safe default:** the flag defaults to `false`. If the flag is missing, `null`, or any value other than the explicit boolean `true`, Layer 2 skips the promotion entirely. A bug that corrupts the flag makes a promotion code-only (harmless) rather than auto-applied (harmful). This is a deliberate fail-closed design.

**Important:** a code-only promotion (`rms_auto_apply: false`) can still have custom rules attached to it. When a customer enters the code, Layer 1 validates all rules synchronously and blocks the application if any rule set fails. The rules are enforced — the promotion simply isn't auto-applied.

**Why `is_automatic: false` on all managed promotions:**
Medusa's native `is_automatic: true` flag makes it impossible to conditionally remove a promotion — `updateCartPromotionsWorkflow` re-applies automatic promotions even when called with action REMOVE. Therefore, all promotions managed by this plugin must be created with `is_automatic: false`. The plugin's own auto-apply engine (Layer 2) takes over this responsibility entirely for promotions where `rms_auto_apply: true`.

> **Operational constraint:** if a managed promotion is accidentally set to `is_automatic: true` in Medusa, it will be applied unconditionally by Medusa regardless of our rules. This must be enforced at promotion creation — ideally validated by the API.

---

## 5. Three-Layer Enforcement Architecture

The plugin enforces custom rules across three points in the cart lifecycle. All three layers share the same rule evaluation logic — rule evaluation is pure (no DB calls, no side effects) and implemented once.

| Layer | Mechanism | Timing | Behavior |
|---|---|---|---|
| 1 — Code Gate | `updateCartPromotionsWorkflow.hooks.validate` | Synchronous — before any promotion is applied | Throws `MedusaError` (HTTP 400), cart unchanged. Only fires on ADD action with promo codes. |
| 2 — Auto-Apply Engine | `cart.updated` subscriber | Asynchronous — after HTTP response is returned | Fetches managed promotions with DB-level filters, filters out those that fail Medusa's native eligibility rules, evaluates our custom rules, computes delta (toAdd / toRemove), applies via `updateCartPromotionsWorkflow`. Short-circuits if no changes needed. Only runs for promotions where `rms_auto_apply: true`. |
| 3 — Checkout Gate | `completeCartWorkflow.hooks.validate` | Synchronous — before order is placed | Throws `MedusaError` (HTTP 400), order blocked. Never mutates — validation only. |

**Why three layers?**

Layer 2 is inherently async: `addToCartWorkflow` holds a cart lock when its hooks fire, so calling `updateCartPromotionsWorkflow` synchronously inside it would deadlock. This creates an **async window** — a brief period after a cart mutation where the cart may hold a promotion whose rules are no longer satisfied. Layer 3 is the hard money gate that ensures no order is placed during this window.

Layer 1 exists for user experience: a customer entering an invalid code gets an immediate HTTP 400 with a clear message, without needing a second GET request to discover the promotion was removed.

**Loop safety:** `updateCartPromotionsWorkflow` does not emit `cart.updated`, so Layer 2 calling it does not re-trigger itself. No loop.

**Layer 1 / Layer 2 interaction — intentionally redundant, always safe:** when Layer 2 calls `updateCartPromotionsWorkflow` to ADD a promotion, Layer 1's `hooks.validate` fires synchronously inside that same workflow call. This means our custom rules are evaluated twice — once by Layer 2 (deciding to add) and once by Layer 1 (validating the add). Because both layers share exactly the same rule evaluation logic, Layer 1 will always agree with Layer 2's decision. The double evaluation is redundant but harmless and requires no special handling.

**Open design decision — can a customer remove an auto-apply promotion?**

When a customer calls the API to remove an auto-apply promotion (`rms_auto_apply: true`) from their cart, Layer 2 fires on the resulting `cart.updated` event and re-adds it immediately — because the custom rules still pass. The customer cannot permanently opt out. This mirrors Medusa's native behavior for `is_automatic: true` promotions, which also cannot be removed by the customer.

This is the **current default behavior**. It has not been explicitly decided whether customers should be able to opt out. The table below documents the options for future resolution:

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — No opt-out** *(current default, matches Medusa native)* | Layer 2 always re-adds the promotion when rules pass, regardless of prior removal | Simple, predictable — merchant always knows which promotions are active on eligible carts | Can frustrate customers who genuinely don't want a promotion (e.g. a gift-with-purchase they can't use) |
| **B — Explicit opt-out via declined list** | Cart tracks a set of "declined promotion IDs" (on cart metadata or a new table). Layer 2 skips promotions in the declined list. Customer calls API to decline. | Respects customer preference; better UX for edge cases | Requires storing declined state per cart, complicates Layer 2, unclear when a "decline" expires (does it reset when cart changes?) |

> **Note to implementer:** before shipping auto-apply promotions to end customers, decide which option to implement. Option A ships by default. Option B requires a declined-list mechanism and a storefront API endpoint for customers to opt out.

**Layer 2 promotion fetch — filters applied on every call:**

Layer 2 must fetch promotions from the DB on every `cart.updated` event. To keep this query lean, three filters are applied using data already available from the cart and the current timestamp:

| Filter | Source | Rationale |
|---|---|---|
| `status = "active"` | Medusa native field | Excludes drafts, disabled, and expired promotions |
| `starts_at <= now AND (ends_at IS NULL OR ends_at >= now)` | Medusa native fields | Excludes promotions outside their active date window |
| `rms_auto_apply = true` | Plugin flag | Excludes all code-only managed promotions — likely the single biggest reduction |

**Currency filter (near-term):** Medusa promotions do not have a top-level `currency_code` field — currency is associated with the Campaign, not the promotion directly. Filtering by `cart.currency_code` therefore requires a join through the campaign relationship. This is a high-value optimization (a EUR cart has no business evaluating ILS-only promotions) but needs verification against the Medusa schema before implementation.

**Region and sales channel (longer-term):** These are stored inside promotion conditions, not as top-level fields, so DB-level filtering by `cart.region_id` or `cart.sales_channel_id` requires joining through the conditions table. Deferred until catalog size makes it necessary. Region and sales channel are handled at the application level instead — see "Native rule filtering" below.

> **Important:** the `rms_auto_apply` filter is only efficient at the DB level if the flag is stored as a proper column (Option B — linked module). With Option A (metadata), the flag is buried in a JSON blob and cannot be filtered in SQL — Layer 2 must fetch all promotions and discard code-only ones in application code, defeating the purpose of the filter. See Section 6.

**Layer 2 — Native Rule Filtering (application-level, post-fetch):**

After the DB fetch, before evaluating our custom rules, Layer 2 passes every candidate promotion through a pure `passesNativeRules(promotion, cart)` function. This replicates Medusa's own eligibility check for the four standard rule attributes, using data already on the cart — no extra DB calls needed.

To support this, the promotion fetch includes Medusa's native rule fields:

```ts
fields: [
  "id", "code", "status", "starts_at", "ends_at",
  "rules.attribute",
  "rules.operator",
  "rules.values.value",
  // + our custom rule fields
]
```

The filter checks each of the four standard Medusa eligibility attributes:

| Medusa Rule Attribute | Cart Field Checked |
|---|---|
| `region_id` | `cart.region_id` |
| `sales_channel_id` | `cart.sales_channel_id` |
| `currency_code` | `cart.currency_code` |
| `customer_group_id` | `cart.customer.groups[].id` |

Any promotion that fails one of its native rules is dropped from the candidate list. Layer 2 never calls `updateCartPromotionsWorkflow` for it — so it is never added to the cart with ₪0 discount.

**Why this matters:** without this filter, a promotion restricted to Region A would be auto-applied to carts in Region B, appear as "applied" on the cart, but give ₪0 discount. At scale (many promotions with region/sales channel restrictions), this degrades UX and cart reliability significantly.

**Caveat:** the filter only covers the four standard Medusa rule attributes listed above. If a promotion carries an exotic or future Medusa rule attribute not in this list, our filter won't catch it — the promotion would still be attempted and silently give ₪0 discount. This is a narrow edge case; all current Medusa native eligibility conditions are covered.

---

## 6. Database Storage Options

Custom rules must be persisted somewhere. Two approaches are documented below. **No decision has been made** — this section presents both options for evaluation.

### Option A — Store Rules in `promotion.metadata`

Rules are serialized as JSON and stored directly in Medusa's existing `promotion.metadata` field.

**Pros:**
- Zero new DB tables, no migrations, no Medusa module to write
- Works immediately — no infrastructure investment
- Easy to iterate on rule schema in early stages
- No risk of sync issues between a linked model and the promotion lifecycle

**Cons:**
- No DB-level validation — any JSON is accepted; all validation is at the application layer
- Cannot query or filter by rule content in SQL (e.g., "show all promotions with a subtotal rule") without parsing JSON in application code
- **`rms_auto_apply` cannot be filtered at the DB level** — the flag is buried in JSON, so Layer 2 must fetch all promotions on every `cart.updated` event and discard code-only ones in application code. This negates the most impactful of the three Layer 2 fetch filters and means the fetch grows linearly with total promotion count regardless of how many are auto-apply
- No referential integrity — if a product ID stored in a rule scope is deleted, no cascade happens; the rule silently becomes stale
- Schema evolution is painful — migrating rule structure requires updating JSON documents in the DB, not adding columns
- Medusa may strip or overwrite metadata on promotion updates if not handled carefully
- Complex nested structure (rule sets with multiple rules) can become unwieldy as a flat JSON blob

### Option B — Linked Module (`PromotionRuleSet` + `PromotionRule` tables)

A new Medusa module introduces dedicated tables for rule sets and rules, linked to the native `promotion` table via Medusa's link system.

**Pros:**
- Proper relational integrity — foreign keys, cascade deletes, indexed lookups
- Queryable in SQL: filter, aggregate, report on rules without parsing JSON
- Schema-enforced at the DB level — invalid rule shapes are rejected at the storage layer
- Schema evolution is straightforward — add columns, write migrations
- Clean ownership: Medusa owns the promotion entity, the plugin owns the rule entity
- Scope references (product_id, collection_id) can be validated and potentially cascade-updated
- **`rms_auto_apply` is a proper boolean column** — Layer 2 can filter to only auto-apply promotions directly in the DB query, making the promotion fetch O(auto-apply promotions) rather than O(all promotions). This is the most operationally significant advantage as the catalog grows

**Cons:**
- Larger upfront build: requires Medusa module definition, link definition, migrations
- More code to maintain and test
- Must handle promotion lifecycle events (delete rules when a promotion is deleted)
- Increases the complexity of the plugin's dependency surface

### Recommendation

Option B is the stronger long-term choice. The rule structure — field + operator + value + optional scope, nested inside rule sets with include/exclude types — is complex enough that treating it as opaque JSON creates compounding operational cost over time. The build investment is one-time; the queryability and integrity benefits persist for the life of the plugin.

---

## 7. Admin UI

### 7.1 Widget on the Promotion Page

The plugin injects a widget into the promotion detail page using Medusa's widget injection zone (`promotion.details.before` or `promotion.details.after`). No other admin pages are added. Rules are only accessible through their promotion — there is no standalone rules list page.

The widget on the promotion page displays:
- A **read-only summary** of the promotion's current rules (rule sets listed, each rule displayed as a readable sentence)
- The current `rms_auto_apply` status
- An **Edit** button in the widget header that opens the rule editor

### 7.2 Rule Editor

The rule editor can be implemented as either a **Drawer** (side panel) or a **FocusModal**, both of which are first-class Medusa UI components from `@medusajs/ui`. The choice is left to the implementing developer.

- **Drawer** is Medusa's standard pattern for editing existing entity data and is consistent with how native promotion fields are edited
- **FocusModal** gives more horizontal space, which may be preferable given the `field / operator / value / scope` row layout across multiple rule sets

Both follow the Medusa convention: `Header`, `Body`, and `Footer` (with Cancel and Save actions) using `react-hook-form` + `Zod` validation.

**Rule editor layout:**

```
┌─────────────────────────────────────────────────────┐
│ Custom Promotion Rules                               │
├─────────────────────────────────────────────────────┤
│ Auto-apply  [toggle ON/OFF]                          │
│ ON: applied automatically when rules pass.           │
│ OFF: requires promo code — rules still enforced.     │
├─────────────────────────────────────────────────────┤
│ APPLY WHEN (include conditions)                      │
│                                                      │
│ ┌─ Condition Group 1 ──────────────────────────┐    │
│ │ [subtotal ▼] [≥ ▼]  [300        ]       [×] │    │
│ │ [subtotal ▼] [≤ ▼]  [500        ]       [×] │    │
│ │ + Add rule                                   │    │
│ └──────────────────────────────────────────────┘    │
│                    — OR —                            │
│ ┌─ Condition Group 2 ──────────────────────────┐    │
│ │ [quantityOfProduct ▼] [≥ ▼] [4] [shirt ▼] [×]│   │
│ │ + Add rule                                   │    │
│ └──────────────────────────────────────────────┘    │
│ + Add condition group                                │
├─────────────────────────────────────────────────────┤
│ EXCLUDE WHEN (AND NOT conditions) [collapsed ▼]      │
├─────────────────────────────────────────────────────┤
│                  [Cancel]   [Save Rules]             │
└─────────────────────────────────────────────────────┘
```

Each rule row contains:
1. **Field dropdown** — data-type-aware; only shows valid fields
2. **Operator dropdown** — filtered to valid operators for the selected field type
3. **Value input** — number input, text input, or multi-select tag picker depending on field
4. **Scope picker** (conditional) — appears only for `quantityOfProduct` and `quantityOfCollection`; opens a product/collection search modal
5. **Delete row** button

The exclude section is collapsed by default and expands on demand.

### Design Inspiration

The field + operator + value triple with AND-within-group / OR-between-groups logic is the same condition builder pattern used by **Braze** (filter groups with exclusion groups), **Segment** (trait conditions), and **Shopify** (discount eligibility conditions). This pattern was chosen specifically because it is proven at scale, familiar to operations teams, and maps cleanly to a visual UI that non-technical merchants can use without training.

Additional patterns taken from these tools:
- **Exclusion groups** (Braze): AND NOT condition sets that suppress a promotion even when include conditions pass
- **Data-type-aware operators** (Segment/Adobe): operator dropdown filters to valid options based on field type, preventing invalid rule creation
- **Scenario-based grouping** (all three): each group represents one complete promotion scenario — merchants think in scenarios, not boolean expressions

---

## 8. API

The plugin exposes a REST API for full rule CRUD on a promotion. All endpoints are admin-only.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotions/:id/rules` | Fetch all rule sets for a promotion |
| `POST` | `/admin/promotions/:id/rules` | Create or replace all rule sets for a promotion |
| `PATCH` | `/admin/promotions/:id/rules` | Update specific rule sets or the `rms_auto_apply` flag |
| `DELETE` | `/admin/promotions/:id/rules` | Remove all custom rules from a promotion |

The API accepts and returns the full rule set structure including include/exclude groups, individual rules with field/operator/value/scope, and the `rms_auto_apply` flag.

Validation is enforced at the API layer: invalid field/operator combinations, missing scope for scoped fields, and unrecognized field names are rejected with descriptive errors.

**Example request/response shape:**

> The structure below is a reference design, not a strict contract. The implementing developer may adjust field names, nesting, or conventions if a different shape better fits the chosen DB storage model or Medusa API conventions — as long as the semantics (rule sets, include/exclude type, field/operator/value/scope per rule, rms_auto_apply flag) are preserved.

`POST /admin/promotions/:id/rules` — request body:
```json
{
  "rms_auto_apply": true,
  "rule_sets": [
    {
      "type": "include",
      "rules": [
        { "field": "subtotal", "operator": "gte", "value": 300 },
        { "field": "subtotal", "operator": "lte", "value": 500 }
      ]
    },
    {
      "type": "include",
      "rules": [
        { "field": "quantityOfProduct", "operator": "gte", "value": 4, "scope": { "product_id": "prod_123" } }
      ]
    },
    {
      "type": "exclude",
      "rules": [
        { "field": "customerGroup", "operator": "in", "value": ["vip"] }
      ]
    }
  ]
}
```

The example above reads as: *apply when (subtotal is between ₪300–₪500) OR (4+ units of product prod_123 are in the cart), EXCEPT when the customer has the "vip" tag.*

Response adds server-generated `id` fields on each rule set and rule:
```json
{
  "promotion_id": "promo_abc",
  "rms_auto_apply": true,
  "rule_sets": [
    {
      "id": "rset_001",
      "type": "include",
      "rules": [
        { "id": "rule_001", "field": "subtotal", "operator": "gte", "value": 300 },
        { "id": "rule_002", "field": "subtotal", "operator": "lte", "value": 500 }
      ]
    },
    {
      "id": "rset_002",
      "type": "include",
      "rules": [
        { "id": "rule_003", "field": "quantityOfProduct", "operator": "gte", "value": 4, "scope": { "product_id": "prod_123" } }
      ]
    },
    {
      "id": "rset_003",
      "type": "exclude",
      "rules": [
        { "id": "rule_004", "field": "customerGroup", "operator": "in", "value": ["vip"] }
      ]
    }
  ]
}
```

---

## 9. Known Gaps and Deferred Work

### Error message localization
Layer 1 and Layer 3 currently return hardcoded English error messages to the storefront. These are customer-facing. Localization and customization of these messages is **out of scope** for this version. If a future developer needs to make them configurable or translatable, the messages are centralized in the rule evaluation utility — that is the only file that needs to change.

### Performance at scale
Layer 2 applies three DB-level filters on every fetch (`status`, date range, `rms_auto_apply`) and a post-fetch application-level native rule filter (region, sales channel, currency, customer group). DB-level filtering by region and sales channel — which would push this narrowing into SQL — is deferred because those values are stored inside Medusa's conditions table, requiring a join. The currency DB-level filter is a near-term optimization pending verification that Medusa exposes currency at the top-level promotion field via its campaign relationship.

If a promotion carries an exotic Medusa rule attribute beyond the four standard ones (region, sales channel, currency, customer group), the post-fetch native rule filter won't catch it. That promotion may be auto-applied with ₪0 discount. Mitigation: document the four supported attributes clearly for merchants; expand the filter if new Medusa rule types are introduced.

### Discount stacking
Whether a promotion can combine with other promotions (product + order + shipping categories, as Shopify models it) is left entirely to Medusa's native behavior. The plugin does not add stacking constraints in this version.
