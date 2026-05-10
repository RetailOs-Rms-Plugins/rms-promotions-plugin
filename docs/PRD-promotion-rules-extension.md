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

### 4.1 Rule Structure: `rule_type` + `config`

Each rule is stored in the DB as two fields: a `rule_type` discriminator and a `config` JSONB object whose shape depends on the type. The evaluator dispatches to the correct handler based on `rule_type`:

```ts
const ruleEvaluators: Record<string, (config: unknown, cart: EnrichedCart) => boolean> = {
  comparison: evaluateComparisonRule,
  // future types registered here — zero DB migrations needed
}

function evaluateRule(rule: RmsRule, cart: EnrichedCart): boolean {
  const evaluator = ruleEvaluators[rule.rule_type]
  if (!evaluator) throw new Error(`Unknown rule type: ${rule.rule_type}`)
  return evaluator(rule.config, cart)
}
```

**Currently one rule type exists: `comparison`.** All seven supported fields fit the same `field + operator + value` shape. Future rule types (e.g. `bundle`) are registered as new evaluator functions with no schema changes required.

### 4.2 Supported Rule Types and Config Fields

#### `rule_type: "comparison"`

Config shape:
```ts
{
  field: RuleField
  operator: RuleOperator
  value: number | string | string[] | boolean
  scope?: {
    product_id?: string      // only for quantityOfProduct
    collection_id?: string   // only for quantityOfCollection
  }
}
```

| `field` | Description | Valid `operator` values | `value` type | `scope` required? |
|---|---|---|---|---|
| `subtotal` | Cart item subtotal (pre-discount, pre-shipping). Maps to `item_subtotal` on the Medusa cart. **Implementer note:** may be a `BigNumber` — extract safely via `typeof val === 'number' ? val : val.toNumber()`. Verify field name against live cart shape. | `eq` `neq` `gt` `gte` `lt` `lte` | number | no |
| `quantity` | Total item count in cart | `eq` `neq` `gt` `gte` `lt` `lte` | number | no |
| `quantityOfProduct` | Quantity of a specific product in cart | `eq` `neq` `gt` `gte` `lt` `lte` | number | `{ product_id }` |
| `quantityOfCollection` | Quantity of items from a specific collection | `eq` `neq` `gt` `gte` `lt` `lte` | number | `{ collection_id }` |
| `usesPerCustomer` | Times this customer has used this promotion (non-cancelled/refunded orders) | `lt` `lte` | number | no |
| `customerGroup` | Customer belongs to a Medusa Customer Group | `in` `nin` | string[] (group IDs) | no |
| `firstOrder` | Customer has zero prior orders | `eq` | boolean | no |

#### Future rule types

| `rule_type` | Planned config fields | Status |
|---|---|---|
| `bundle` | `bundle_size`, `bundle_price`, `scope: { product_id }` | Pending — blocked on verifying Medusa BuyGet stacking behavior (see Section 9) |

> **Note on `usesPerCustomer`:** Medusa natively supports a total usage cap (`usage_limit`) but not a per-customer cap. This rule fills that gap by querying order history at evaluation time. Only orders with status `cancelled` or `refunded` are excluded from the count — all other statuses (`pending`, `processing`, `completed`, etc.) count as a use. This prevents abuse where a customer places multiple orders in rapid succession before any reach `completed` status.

> **Note on `customerGroup`:** values are Medusa **Customer Group IDs** (e.g. `cusgrp_vip`), not group names. IDs are stable — group names can be renamed without breaking rules. The rule evaluator reads `cart.customer.groups[].id`. On guest carts (no customer attached), `customerGroup` rules are skipped and treated as passing — see Section 5 for guest cart behavior.

> **Guest cart behavior (all customer-dependent rules):** When the cart has no attached customer, `customerGroup`, `firstOrder`, and `usesPerCustomer` rules all **pass** (optimistic/permissive). A guest has no history to query and no group membership — blocking them would be unfair and inconsistent with how `customerGroup` is already handled. This mirrors the stance the PRD takes for `customerGroup`.

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

> **Operational constraint:** if a managed promotion is accidentally set to `is_automatic: true` in Medusa, it will be applied unconditionally by Medusa regardless of our rules. This is enforced at rule attachment time — `POST /admin/promotions/:id/rules` checks the promotion's `is_automatic` flag and rejects with HTTP 400 if it is `true`. Error message: *"This promotion must have is_automatic: false to use custom rules. Update the promotion in Medusa admin before attaching rules."*

---

## 5. Three-Layer Enforcement Architecture

The plugin enforces custom rules across three points in the cart lifecycle. All three layers share the same rule evaluation logic — rule evaluation is pure (no DB calls, no side effects) and implemented once. Before calling the evaluator, the caller pre-fetches any data the rules need and passes it in as an enriched context object. For example, if any rule uses `usesPerCustomer`, the caller queries the order count for that customer+promotion pair and injects the result into the context — the evaluator itself never makes DB calls.

| Layer | Mechanism | Timing | Behavior |
|---|---|---|---|
| 1 — Code Gate | `updateCartPromotionsWorkflow.hooks.validate` | Synchronous — before any promotion is applied | Throws `MedusaError` (HTTP 400), cart unchanged. Only fires on ADD action with promo codes. |
| 2 — Auto-Apply Engine | `cart.updated` subscriber | Asynchronous — after HTTP response is returned | Fetches managed promotions with DB-level filters, filters out those that fail Medusa's native eligibility rules, evaluates our custom rules, computes delta (toAdd / toRemove), applies via `updateCartPromotionsWorkflow`. Short-circuits if no changes needed. Only runs for promotions where `rms_auto_apply: true`. **Delta computation:** (1) fetch all `rms_auto_apply=true` promotions from plugin DB; (2) fetch current cart with `promotions` expanded; (3) for each candidate: rules pass → should be on cart, rules fail → should not; (4) `toAdd` = candidates that pass but are absent from `cart.promotions`; `toRemove` = entries in `cart.promotions` that the plugin manages (has a rule set for) but whose rules now fail. Promotions not known to the plugin are never touched. |
| 3 — Checkout Gate | `completeCartWorkflow.hooks.validate` | Synchronous — before order is placed | Throws `MedusaError` (HTTP 400), order blocked. Never mutates — validation only. |

**Why three layers?**

Layer 2 is inherently async: `addToCartWorkflow` holds a cart lock when its hooks fire, so calling `updateCartPromotionsWorkflow` synchronously inside it would deadlock. This creates an **async window** — a brief period after a cart mutation where the cart may hold a promotion whose rules are no longer satisfied. Layer 3 is the hard money gate that ensures no order is placed during this window.

Layer 1 exists for user experience: a customer entering an invalid code gets an immediate HTTP 400 with a clear message, without needing a second GET request to discover the promotion was removed.

**Loop safety:** `updateCartPromotionsWorkflow` does not emit `cart.updated`, so Layer 2 calling it does not re-trigger itself. No loop.

**Layer 1 / Layer 2 interaction — intentionally redundant, always safe:** when Layer 2 calls `updateCartPromotionsWorkflow` to ADD a promotion, Layer 1's `hooks.validate` fires synchronously inside that same workflow call. This means our custom rules are evaluated twice — once by Layer 2 (deciding to add) and once by Layer 1 (validating the add). Because both layers share exactly the same rule evaluation logic, Layer 1 will always agree with Layer 2's decision. The double evaluation is redundant but harmless and requires no special handling.

**Customer opt-out of auto-apply promotions: not supported (by design)**

When a customer calls the API to remove an auto-apply promotion (`rms_auto_apply: true`) from their cart, Layer 2 fires on the resulting `cart.updated` event and re-adds it immediately — because the custom rules still pass. The customer cannot permanently opt out. This mirrors Medusa's native behavior for `is_automatic: true` promotions.

This is intentional. Merchants running rules-based promotions (e.g. "spend ₪300 get 5% off") expect the discount to apply automatically to all eligible carts — customer opt-out would undermine that. No declined-list mechanism is needed.

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

Custom rules must be persisted somewhere. Two approaches were evaluated. **Decision: Option B (linked module) was chosen** — rationale is at the end of this section.

The options are preserved below so future readers understand the trade-offs behind the decision.

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
- Must handle promotion lifecycle events (delete rules when a promotion is deleted) — handled via a `promotion.deleted` subscriber that deletes the linked rule sets (chosen over link-level cascade, which is less explicit and varies by Medusa version)
- Increases the complexity of the plugin's dependency surface

### Decision: Fully normalized linked module (3 tables)

Three plugin-owned tables are introduced. This is the full Option B — chosen because the plugin is expected to support hundreds of clients with thousands of promotions, and individual rules must be queryable and reportable via SQL over the long run.

```
rms_promotion_config
  id                TEXT PK
  promotion_id      TEXT UNIQUE  ← link to Medusa's promotion table
  rms_auto_apply    BOOLEAN DEFAULT false

rms_rule_group
  id                TEXT PK
  promotion_id      TEXT         ← FK to rms_promotion_config.promotion_id
  type              ENUM('include', 'exclude')

rms_rule
  id                TEXT PK
  rule_group_id     TEXT         ← FK to rms_rule_group.id
  rule_type         TEXT         ← discriminator: 'comparison' | future types
  config            JSONB        ← shape determined by rule_type (see Section 4.2)
```

**Relationships:**
- `rms_promotion_config` → `rms_rule_group`: one-to-many (one promotion, many groups)
- `rms_rule_group` → `rms_rule`: one-to-many (one group, many rules)
- No many-to-many relationships anywhere

**Logic encoded in the schema:**
- Rules within a group are joined by **AND** — all must pass
- Groups are joined by **OR** — any passing group makes the promotion eligible
- `type = 'exclude'` groups act as AND NOT gates — if any exclude group passes, the promotion is suppressed

**Why `rms_promotion_config` exists:** `rms_auto_apply` is a promotion-level flag, not a group-level flag. It needs a home separate from rule groups. This table also serves as the plugin's anchor for the Medusa link — Medusa owns `promotion`, the plugin owns `rms_promotion_config`.

**`rule_type` column:** plain text discriminator. The evaluator dispatch map uses this to select the correct handler function. Unknown values throw at evaluation time. Current valid value: `'comparison'`.

**`config` column:** JSONB. Shape is fully determined by `rule_type` — see Section 4.2 for each type's config fields. All rule-type-specific data lives here, including scope (`product_id`, `collection_id`) for scoped comparison rules. A GIN index or targeted path index on `config` can be added if SQL queries on rule fields are needed in future.

**Promotion lifecycle:** when a promotion is deleted, a `promotion.deleted` subscriber deletes the `rms_promotion_config` row and cascades to its rule groups and rules (chosen over link-level cascade for explicitness and Medusa version independence).

---

## 7. Admin UI

### 7.1 Widget on the Promotion Page

The plugin injects a widget into the promotion detail page using Medusa's widget injection zone `promotion.details.after`. Rules appear below Medusa's native promotion fields — merchants configure the promotion first, then attach rules. No other admin pages are added. Rules are only accessible through their promotion — there is no standalone rules list page.

The widget on the promotion page displays:
- A **read-only summary** of the promotion's current rules (rule sets listed, each rule displayed as a readable sentence)
- The current `rms_auto_apply` status
- An **Edit** button in the widget header that opens the rule editor

### 7.2 Rule Editor

The rule editor uses **`RouteFocusModal`** from `@retailos-ai/rms-medusa-ui` (not exported by `@medusajs/ui`). FocusModal was chosen over Drawer because the rule editor layout — multiple groups each with `field / operator / value / scope` columns — needs horizontal space that a Drawer cannot provide.

The editor follows the Medusa convention: `Header`, `Body`, and `Footer` (with Cancel and Save actions) using `react-hook-form` + `Zod` validation.

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

The API accepts and returns the full rule group structure including include/exclude groups, individual rules with `rule_type` + `config`, and the `rms_auto_apply` flag.

**`PATCH` semantics:** field-level update. If `rule_groups` is present in the body, the entire rule group collection is replaced. If `rms_auto_apply` is present, only that flag is updated. Fields absent from the body are left unchanged.

Validation is enforced at the API layer: unrecognized `rule_type` values, invalid `field`/`operator` combinations inside a `comparison` config, missing `scope` for scoped fields, and missing required config keys are rejected with descriptive errors.

**Example request/response shape:**

`POST /admin/promotions/:id/rules` — request body:
```json
{
  "rms_auto_apply": true,
  "rule_groups": [
    {
      "type": "include",
      "rules": [
        { "rule_type": "comparison", "config": { "field": "subtotal", "operator": "gte", "value": 300 } },
        { "rule_type": "comparison", "config": { "field": "subtotal", "operator": "lte", "value": 500 } }
      ]
    },
    {
      "type": "include",
      "rules": [
        { "rule_type": "comparison", "config": { "field": "quantityOfProduct", "operator": "gte", "value": 4, "scope": { "product_id": "prod_123" } } }
      ]
    },
    {
      "type": "exclude",
      "rules": [
        { "rule_type": "comparison", "config": { "field": "customerGroup", "operator": "in", "value": ["vip"] } }
      ]
    }
  ]
}
```

The example above reads as: *apply when (subtotal is between ₪300–₪500) OR (4+ units of product prod_123 are in the cart), EXCEPT when the customer has the "vip" tag.*

Response adds server-generated `id` fields on each group and rule:
```json
{
  "promotion_id": "promo_abc",
  "rms_auto_apply": true,
  "rule_groups": [
    {
      "id": "rgrp_001",
      "type": "include",
      "rules": [
        { "id": "rule_001", "rule_type": "comparison", "config": { "field": "subtotal", "operator": "gte", "value": 300 } },
        { "id": "rule_002", "rule_type": "comparison", "config": { "field": "subtotal", "operator": "lte", "value": 500 } }
      ]
    },
    {
      "id": "rgrp_002",
      "type": "include",
      "rules": [
        { "id": "rule_003", "rule_type": "comparison", "config": { "field": "quantityOfProduct", "operator": "gte", "value": 4, "scope": { "product_id": "prod_123" } } }
      ]
    },
    {
      "id": "rgrp_003",
      "type": "exclude",
      "rules": [
        { "id": "rule_004", "rule_type": "comparison", "config": { "field": "customerGroup", "operator": "in", "value": ["vip"] } }
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

### Promotion duplication
The plugin is API-first. A duplicated promotion is a new `promotion_id` with no `rms_promotion_config` row — identical to any freshly created promotion. No rules are copied. The merchant attaches rules via the widget or API as normal. No special handling required.

### Bundle/multiplied discounts ("3 for ₪20" scaling with quantity)
The current plugin only gates eligibility — it does not influence Medusa's discount calculation. "3 for ₪20" can be set up as a promotion with rule `quantityOfProduct gte 3`, but the ₪4 discount applies once regardless of how many groups of 3 are in the cart (6 units → ₪44, not ₪40). **Open question:** verify whether Medusa's native `buyget` type re-applies the deal for each complete group of qualifying items. If it does, the problem is already solved natively. If not, a `bundle` rule type (see Section 4.2) or a separate plugin is required. Blocked until someone tests BuyGet stacking behavior on a live Medusa instance.
