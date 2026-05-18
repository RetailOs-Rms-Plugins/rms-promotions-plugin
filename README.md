# @retailos-ai/rms-promotions-extension

> Cart-state eligibility rules for Medusa v2 promotions

Medusa's native promotion system handles discount calculation well, but its eligibility rules are limited to static attributes (region, currency, customer group). This plugin adds **cart-state rules** — minimum subtotal, item quantities, first-order status, per-customer usage caps — enforced across the full cart lifecycle through a three-layer architecture. Merchants configure promotions normally in Medusa admin, then attach additional custom rules via a plugin widget on the promotion detail page.

## Features

- **Six rule fields**: `subtotal`, `totalQuantity`, `quantityOfProduct`, `quantityOfCollection`, `usesPerCustomer`, `firstOrder`
- **Configurable combinators**: AND/OR within groups and between groups (DNF by default — any group triggers the promotion, all rules in a group must pass)
- **Three-layer enforcement**: synchronous code gate → async auto-apply engine → synchronous checkout gate
- **Auto-apply flag**: promotions are automatically added/removed from carts as cart state changes
- **Admin widget**: visual rule editor (Drawer) injected into the Medusa promotion detail page
- **Full REST API**: CRUD + batch endpoints for configs, rule groups, and rules
- **Normalized storage**: three dedicated DB tables with proper FK cascades, enabling SQL-level filtering

## Requirements

- Node.js >= 20
- `@medusajs/medusa` = 2.14.2
- `@medusajs/framework` = 2.14.2
- PostgreSQL (Medusa's standard database)

## Installation

```bash
yarn add @retailos-ai/rms-promotions-extension
```

Register the module in `medusa-config.ts`:

```ts
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  plugins: [
    { resolve: "@retailos-ai/rms-promotions-extension" },
  ],
})
```

Run migrations:

```bash
npx medusa db:migrate
```

## Creating Rules

Rules are attached to a Medusa promotion through three nested objects: a **Config** (one per promotion), one or more **Rule Groups**, and one or more **Rules** per group. Both paths below produce the same data model — the UI is a visual wrapper around the same API calls.

---

### Via the API

**Prerequisites:** create the promotion in Medusa admin first, and ensure `is_automatic` is set to `false`.

#### Step 1 — Create a `PromotionExtConfig`

One config per promotion. Controls the `auto_apply` flag and the combinator joining groups together.

```bash
curl -X POST http://localhost:9000/admin/promotion-ext-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "promotion_id": "promo_abc123",
    "auto_apply": true,
    "include_groups_combinator": "or"
  }'
```

```json
{
  "promotion_ext_config": {
    "id": "pec_01",
    "promotion_id": "promo_abc123",
    "auto_apply": true,
    "include_groups_combinator": "or",
    "exclude_groups_combinator": "or"
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `promotion_id` | string | required | Medusa promotion ID to attach rules to |
| `auto_apply` | boolean | `false` | `true` = auto-add/remove from cart; `false` = code-only |
| `include_groups_combinator` | `"and"` \| `"or"` | `"or"` | How include groups are joined (`"or"` = any group triggers) |

#### Step 2 — Create one or more `PromotionExtRuleGroup`s

Each group is one logical scenario. Use `/batch` to create multiple at once.

```bash
curl -X POST http://localhost:9000/admin/promotion-ext-rule-groups/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "promotion_config_id": "pec_01",
        "type": "include",
        "rules_combinator": "and"
      },
      {
        "promotion_config_id": "pec_01",
        "type": "include",
        "rules_combinator": "and"
      }
    ]
  }'
```

```json
{
  "promotion_ext_rule_groups": [
    { "id": "perg_01", "promotion_config_id": "pec_01", "type": "include", "rules_combinator": "and" },
    { "id": "perg_02", "promotion_config_id": "pec_01", "type": "include", "rules_combinator": "and" }
  ]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `promotion_config_id` | string | required | ID of the parent config |
| `type` | `"include"` \| `"exclude"` | required | Include groups gate eligibility; exclude groups suppress it |
| `rules_combinator` | `"and"` \| `"or"` | `"and"` | How rules within this group are joined |

#### Step 3 — Create `PromotionExtRule`s

One rule per condition. Use `/batch` to create all rules in one call.

```bash
curl -X POST http://localhost:9000/admin/promotion-ext-rules/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "rule_group_id": "perg_01",
        "rule_type": "comparison",
        "config": { "field": "subtotal", "operator": "gte", "value": 100 }
      },
      {
        "rule_group_id": "perg_01",
        "rule_type": "comparison",
        "config": { "field": "subtotal", "operator": "lte", "value": 500 }
      },
      {
        "rule_group_id": "perg_02",
        "rule_type": "comparison",
        "config": {
          "field": "quantityOfProduct",
          "operator": "gte",
          "value": 4,
          "scope": { "product_id": "prod_shirt_xyz" }
        }
      }
    ]
  }'
```

| Field | Type | Description |
|---|---|---|
| `rule_group_id` | string | ID of the parent rule group |
| `rule_type` | `"comparison"` | Currently the only supported type |
| `config.field` | string | One of the six supported fields (see table below) |
| `config.operator` | string | `eq` `neq` `gt` `gte` `lt` `lte` (restricted per field) |
| `config.value` | number \| boolean | The threshold value to compare against |
| `config.scope.product_id` | string | Required when `field` is `quantityOfProduct` |
| `config.scope.collection_id` | string | Required when `field` is `quantityOfCollection` |

The result above reads as: **apply when subtotal is between ₪100–₪500 OR when 4+ units of a specific product are in the cart.**

#### Full config field reference

| `field` | `value` type | Allowed `operator` | `scope` required |
|---|---|---|---|
| `subtotal` | number | eq neq gt gte lt lte | no |
| `totalQuantity` | number | eq neq gt gte lt lte | no |
| `quantityOfProduct` | number | eq neq gt gte lt lte | `{ product_id }` |
| `quantityOfCollection` | number | eq neq gt gte lt lte | `{ collection_id }` |
| `usesPerCustomer` | number | lt lte only | no |
| `firstOrder` | boolean | eq only | no |

---

### Via the Admin UI

The plugin injects a **"When will this promotion be applied?"** widget at the bottom of every promotion detail page in Medusa admin.

#### Step 1 — Open the rule editor

Navigate to **Promotions → [your promotion]**. Scroll to the widget at the bottom of the page.

- If no rules exist yet: click **+ Add rules**
- If rules already exist: click the **⋯** menu in the widget header → **Edit**

The **Edit Application Rules** drawer opens from the right.

#### Step 2 — Set Auto Apply

At the top of the drawer, toggle **Auto Apply**:

- **ON** — the promotion is added/removed from carts automatically when rules pass
- **OFF** — code-only; the customer must enter a promo code (rules are still enforced on entry)

#### Step 3 — Set the group combinator

Below the Auto Apply toggle, find the **"Apply when"** row with an **AND / OR** toggle on the right. This controls how multiple Rule Groups are joined:

- **OR** (default) — any group matching triggers the promotion
- **AND** — all groups must match simultaneously

#### Step 4 — Add a Rule Group

Click **Add rule group**. A **Rule Group 1** card appears. Each card has:

- A header showing the group title and a rule count badge
- An **AND / OR** toggle in the card header — controls how rules _within this group_ are joined
- A **trash icon** to delete the whole group
- A collapsible body (click the header to expand/collapse)

#### Step 5 — Add rules to the group

Inside the group card, click **Add rule**. Each rule row contains:

1. **Attribute** dropdown — select the field to evaluate:
   - Cart Subtotal, Total Quantity, Product Quantity, Collection Quantity, Uses Per Customer, First Order

2. **Operator** dropdown — automatically filtered to valid operators for the selected field:
   - Numeric fields: Equals, Not Equal, Greater Than, At Least, Less Than, At Most
   - Uses Per Customer: Less Than, At Most only
   - First Order: Equals only

3. **Value** input:
   - Numeric fields: number input
   - First Order: True / False dropdown

4. **Scope input** (appears only for Product Quantity and Collection Quantity):
   - A text field labeled **Product ID** or **Collection ID** — paste the Medusa entity ID here

Click **Add rule** again to add more rules to the same group. The AND/OR badge between rules reflects the group's combinator setting.

#### Step 6 — Add more groups (optional)

Click **Add rule group** again to add a second scenario. A **OR** / **AND** badge appears between groups, reflecting the top-level combinator set in Step 3.

#### Step 7 — Save

Click **Save** in the drawer footer. The widget updates to show a read-only summary of all rules.

If you try to close the drawer with unsaved changes (X button, ESC, or Cancel), a confirmation prompt **"Discard changes?"** appears before closing.

---

## Quick Start

```bash
# 1. Create a promotion in Medusa admin — set is_automatic: false

# 2. Attach a config (auto-apply when rules pass)
curl -X POST /admin/promotion-ext-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "promotion_id": "promo_abc", "auto_apply": true }'
# → { "promotion_ext_config": { "id": "pec_001", ... } }

# 3. Create an include rule group
curl -X POST /admin/promotion-ext-rule-groups \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "promotion_config_id": "pec_001", "type": "include" }'
# → { "promotion_ext_rule_group": { "id": "perg_001", ... } }

# 4. Add a rule: apply when cart subtotal >= 300
curl -X POST /admin/promotion-ext-rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_group_id": "perg_001",
    "rule_type": "comparison",
    "config": { "field": "subtotal", "operator": "gte", "value": 300 }
  }'
```

The promotion is now auto-applied to any cart whose subtotal is ≥ 300, and removed when the subtotal drops below.

## Usage

### Rule Fields

| Field | Description | Operators | Scope |
|---|---|---|---|
| `subtotal` | Cart item subtotal (pre-discount, pre-shipping) | eq neq gt gte lt lte | — |
| `totalQuantity` | Total item count in cart | eq neq gt gte lt lte | — |
| `quantityOfProduct` | Quantity of a specific product in cart | eq neq gt gte lt lte | `{ product_id }` |
| `quantityOfCollection` | Quantity of items from a collection | eq neq gt gte lt lte | `{ collection_id }` |
| `usesPerCustomer` | Times customer has used this promotion | lt lte | — |
| `firstOrder` | Customer has zero prior non-cancelled orders | eq | — |

Guest carts (no `customer_id`) pass `usesPerCustomer` and `firstOrder` rules unconditionally (optimistic/permissive — same as Medusa's native customer group behavior).

### Auto-Apply vs Code-Only

- `auto_apply: true` — Layer 2 (async `cart.updated` subscriber) adds/removes the promotion automatically as cart state changes.
- `auto_apply: false` (default) — promotion is code-only. The customer must enter a code. Custom rules are still enforced synchronously when the code is entered.

**Required:** promotions managed by this plugin must have `is_automatic: false` in Medusa. Setting `is_automatic: true` causes Medusa to unconditionally re-apply the promotion, bypassing all plugin rules.

### Combinators

Rules within a group are joined by `rules_combinator` (`"and"` | `"or"`, default `"and"`). Groups are joined by `include_groups_combinator` (`"and"` | `"or"`, default `"or"`). The defaults produce Disjunctive Normal Form — the same pattern used by Braze, Segment, and Shopify.

**Example — cart between ₪100–₪500:**
```json
{
  "rule_groups": [{
    "type": "include",
    "rules_combinator": "and",
    "rules": [
      { "rule_type": "comparison", "config": { "field": "subtotal", "operator": "gte", "value": 100 } },
      { "rule_type": "comparison", "config": { "field": "subtotal", "operator": "lte", "value": 500 } }
    ]
  }]
}
```

### Exclusion Groups (API-only, Draft)

Create a rule group with `type: "exclude"` to suppress a promotion even when include groups pass. The admin UI does not expose exclude groups — they are accessible only through the API and are read-only in the widget summary.

### Three-Layer Enforcement

| Layer | When | Mechanism | Effect on failure |
|---|---|---|---|
| 1 — Code Gate | Customer enters promo code | `updateCartPromotionsWorkflow.hooks.validate` (sync) | HTTP 400, cart unchanged |
| 2 — Auto-Apply | After any cart mutation | `cart.updated` subscriber (async) | Adds/removes promotion silently |
| 3 — Checkout Gate | Before order is placed | `completeCartWorkflow.hooks.validate` (sync) | HTTP 400, order blocked |

## API

All endpoints are admin-only. Each resource supports single-item CRUD and `/batch` for bulk operations.

### Promotion Configs

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-configs?promotion_id=X` | Fetch config with nested groups and rules |
| `POST` | `/admin/promotion-ext-configs` | Create `{ promotion_id, auto_apply? }` |
| `PATCH` | `/admin/promotion-ext-configs/:id` | Update `auto_apply` flag |
| `DELETE` | `/admin/promotion-ext-configs/:id` | Delete config |
| `POST/PATCH/DELETE` | `/admin/promotion-ext-configs/batch` | Bulk operations |

### Rule Groups

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-rule-groups?promotion_config_id=X` | Fetch groups for a config |
| `POST` | `/admin/promotion-ext-rule-groups` | Create `{ promotion_config_id, type }` |
| `PATCH` | `/admin/promotion-ext-rule-groups/:id` | Update group (combinator) |
| `DELETE` | `/admin/promotion-ext-rule-groups/:id` | Delete group (cascades rules) |
| `POST/DELETE` | `/admin/promotion-ext-rule-groups/batch` | Bulk operations |

### Rules

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-rules?rule_group_id[]=X` | Fetch rules for one or more groups |
| `POST` | `/admin/promotion-ext-rules` | Create `{ rule_group_id, rule_type, config }` |
| `PATCH` | `/admin/promotion-ext-rules/:id` | Update rule |
| `DELETE` | `/admin/promotion-ext-rules/:id` | Delete rule |
| `POST/PATCH/DELETE` | `/admin/promotion-ext-rules/batch` | Bulk operations |

## Project Structure

```
src/
  admin/
    components/rules-editor/    Drawer-based rule editor (combinator toggles, group cards, rule rows)
    hooks/                      React Query hooks for all three REST resources
    widgets/                    promotion-rules-widget.tsx — injected at promotion.details.after
  api/admin/
    promotion-ext-configs/      REST routes, validators, query config
    promotion-ext-rule-groups/  REST routes, validators, query config
    promotion-ext-rules/        REST routes, validators, query config
  lib/
    rule-evaluator.ts           Pure rule evaluation — no DB calls, no side effects
    cart-enricher.ts            Builds EnrichedCart context (queries order history for usesPerCustomer)
  modules/promotion-ext/
    models/                     MikroORM entities for 3 DB tables
    service.ts                  MedusaService (auto-generated CRUD for all 3 models)
    migrations/                 DB migrations
  subscribers/
    cart-updated.ts             Layer 2: async auto-apply engine
    validate-cart-promotions.ts Layer 1: synchronous code-entry gate
    validate-checkout.ts        Layer 3: synchronous checkout gate
    promotion-deleted.ts        Cleanup: cascade-deletes rule config on promotion.deleted
  types/                        TypeScript types for HTTP payloads and responses
  workflows/promotion-ext/      Medusa workflows for CRUD (used by API routes)
```

## Contributing

```bash
yarn install          # install dependencies
yarn test             # run unit tests (jest)
yarn build            # build plugin (medusa plugin:build)
yarn dev              # develop against a local Medusa instance
```

## License

MIT
