# @retailos-ai/rms-promotions-extension

> Cart-state eligibility rules, bundle pricing, and buy-get-repeat promotions for Medusa v2

Medusa's native promotion system handles discount calculation well, but its eligibility rules are limited to static attributes (region, currency, customer group), and its discount modes are limited to one-shot application. This plugin adds **cart-state rules** — minimum subtotal, item quantities, first-order status, per-customer usage caps — enforced across the full cart lifecycle through a three-layer architecture. It also adds **promotion modes** — bundle pricing ("3 for 50") and repeating buy-get deals ("buy 2 get 1 free, repeating") — that reuse Medusa's native fields with mode-specific semantics. Merchants configure promotions normally in Medusa admin, then attach additional custom rules and modes via plugin widgets on the promotion detail page.

## Features

- **Six rule fields**: `subtotal`, `totalQuantity`, `quantityOfProduct`, `quantityOfCollection`, `usesPerCustomer`, `firstOrder`
- **Configurable combinators**: AND/OR within groups and between groups (DNF by default — any group triggers the promotion, all rules in a group must pass)
- **Three-layer enforcement**: synchronous code gate -> synchronous auto-apply (route overrides + workflow hook) with async fallback -> synchronous checkout gate
- **Auto-apply flag**: promotions are automatically added/removed from carts as cart state changes
- **Promotion modes**: standard (Medusa native), bundle pricing, and buy-get repeat — with item caps via `max_quantity`
- **Manual cart adjustments**: operator-created discounts/surcharges per cart, item-level or cart-wide
- **Admin widget**: visual rule editor and promotion mode configuration injected into the Medusa promotion detail page
- **Full REST API**: CRUD + batch endpoints for configs, rule groups, rules, and cart adjustments
- **Normalized storage**: four dedicated DB tables with proper FK cascades, enabling SQL-level filtering
- **Metadata on all models**: arbitrary JSON metadata on configs, rule groups, rules, and cart adjustments
- **RBAC-scoped v1 routes**: `/v1/cart-adjustments` endpoints authenticated via `@retailos-ai/rms-access` with read/create/remove RBAC checks
- **Post-repricing adjustment correction**: recalculates native Medusa promotion adjustments after tier repricing changes item prices (percentage recalc + fixed-amount capping)
- **Cart logic barrel export**: reusable functions exported via `@retailos-ai/rms-promotions-extension/cart-logic` for use by `rms-cart-orchestrator` and other consumers

## Requirements

- Node.js >= 20
- `@medusajs/medusa` = 2.16.0
- `@medusajs/framework` = 2.16.0
- PostgreSQL (Medusa's standard database)

### Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@retailos-ai/rms-access` | ^1.2.3 | RBAC authentication and permission checks for v1 routes |

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

## Quick Start

```bash
# 1. Create a promotion in Medusa admin — set is_automatic: false

# 2. Attach a config (auto-apply when rules pass)
curl -X POST /admin/promotion-ext-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "promotion_id": "promo_abc", "auto_apply": true }'
# -> { "promotion_ext_config": { "id": "pec_001", ... } }

# 3. Create an include rule group
curl -X POST /admin/promotion-ext-rule-groups \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "promotion_config_id": "pec_001", "type": "include" }'
# -> { "promotion_ext_rule_group": { "id": "perg_001", ... } }

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

The promotion is now auto-applied to any cart whose subtotal is >= 300, and removed when the subtotal drops below.

## Usage

### Rule Fields

| Field | Description | Operators | Scope |
|---|---|---|---|
| `subtotal` | Cart item subtotal (pre-discount, pre-shipping) | eq neq gt gte lt lte | -- |
| `totalQuantity` | Total item count in cart | eq neq gt gte lt lte | -- |
| `quantityOfProduct` | Quantity of a specific product in cart | eq neq gt gte lt lte | `{ product_id }` |
| `quantityOfCollection` | Quantity of items from a collection | eq neq gt gte lt lte | `{ collection_id }` |
| `usesPerCustomer` | Times customer has used this promotion | lt lte | -- |
| `firstOrder` | Customer has zero prior non-cancelled orders | eq | -- |

Guest carts (no `customer_id`) pass `usesPerCustomer` and `firstOrder` rules unconditionally (optimistic/permissive — same as Medusa's native customer group behavior).

### Auto-Apply vs Code-Only

- `auto_apply: true` — Layer 2 (async `cart.updated` subscriber) adds/removes the promotion automatically as cart state changes.
- `auto_apply: false` (default) — promotion is code-only. The customer must enter a code. Custom rules are still enforced synchronously when the code is entered.

**Required:** promotions managed by this plugin must have `is_automatic: false` in Medusa. Setting `is_automatic: true` causes Medusa to unconditionally re-apply the promotion, bypassing all plugin rules.

**Note on code format:** Bundle and buy-get adjustments use the raw promotion code (e.g., `WC_BUNDLE_5`) as the adjustment code — matching Medusa's native convention. Manual adjustments use a synthetic `MANUAL_<id>` code since they have no backing promotion.

### Combinators

Rules within a group are joined by `rules_combinator` (`"and"` | `"or"`, default `"and"`). Groups are joined by `include_groups_combinator` (`"and"` | `"or"`, default `"or"`). The defaults produce Disjunctive Normal Form — the same pattern used by Braze, Segment, and Shopify.

**Example — cart between 100-500:**
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

### Promotion Modes

The `promotion_mode` field on `PromotionExtConfig` controls how a promotion's discount is calculated. Non-standard modes reuse Medusa's native `application_method` fields with mode-specific meanings:

| Field | Standard | Bundle | Buy-Get Repeat |
|---|---|---|---|
| `type` | fixed or percentage | Must be `"fixed"` | Discount type (fixed or percentage) |
| `value` | Discount amount or % | Bundle target price | Discount amount or % on "get" items |
| `max_quantity` | Max items discounted | Max participating items (only complete bundles form) | Max "buy" items (cycles = floor(max_quantity / buy_quantity)) |

#### Extended Promotion Compatibility

When creating a Medusa promotion to use with the plugin's non-standard modes, the following settings are required:

| Setting | Bundle | Buy-Get Repeat | Notes |
|---|---|---|---|
| Promotion type | Standard | Standard | "Buy X Get Y" is incompatible — it only fires once and has a different application_method structure |
| Application method type | `"fixed"` (Amount off products) | `"fixed"` or `"percentage"` | Bundle requires a fixed target price |
| Target type | `"items"` | `"items"` | Must target individual products, not order or shipping |
| Allocation | `"each"` or `"once"` recommended | `"each"` or `"once"` recommended | `"across"` works but disables max_quantity (Medusa forbids max_quantity with "across"), meaning no quantity cap is possible |
| Max quantity | >= bundle_size, or unset | >= buy_quantity, or unset | Required by Medusa when allocation is "each" or "once". Controls how many items participate in bundles/cycles |
| Is automatic | `false` (required) | `false` (required) | The plugin owns auto-apply logic — Medusa's native auto-apply bypasses all plugin rules |

#### Standard (default)

Medusa's native `computeActions` handles the discount. The plugin does not intervene in calculation.

#### Bundle Pricing

Set a fixed price for a group of qualifying items, repeating for every complete group. Example: "3 for 50" — every 3 qualifying items cost 50 instead of their individual prices.

**Target price per item:** Set `bundle_size: 1` to apply a target price per individual item. Example: "49.90 per item" — each qualifying item gets an adjustment equal to the difference between its original price and 49.90. Items cheaper than the target price are skipped (no negative discount).

**Requirements:**
- Medusa promotion must be "Amount off products" (`type: "fixed"`, `target_type: "items"`)
- `application_method.value` = the bundle target price (e.g., 50 for "3 for 50", or 49.90 for per-item target pricing)
- `mode_config.bundle_size` = items per bundle (minimum 1)

**Item cap:** Set `application_method.max_quantity` to limit how many items can participate in bundles. Only complete bundles form — e.g., `max_quantity = 7` with `bundle_size = 3` yields 2 bundles (6 items). Leave unset for unlimited. **Important:** `max_quantity` must be >= `bundle_size`, otherwise no bundles can form.

**End-to-end example — "2 for 120"** (items normally cost 65 each):

```bash
# Step 1: Create the Medusa promotion via admin API
# type: "fixed", target_type: "items", value: 120 (the bundle target price)
# max_quantity: null (unlimited) — or at least >= bundle_size (2)
# is_automatic: false (required — the plugin controls application)
# Add target_rules to scope which products qualify
curl -X POST http://localhost:9000/admin/promotions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "BUNDLE2FOR120",
    "is_automatic": false,
    "type": "standard",
    "status": "active",
    "application_method": {
      "type": "fixed",
      "target_type": "items",
      "value": 120,
      "currency_code": "eur",
      "target_rules": [
        {
          "attribute": "items.product.id",
          "operator": "in",
          "values": ["prod_REPLACE_ME"]
        }
      ]
    }
  }'
# -> { "promotion": { "id": "promo_abc123", ... } }

# Step 2: Create the ext config with bundle mode
curl -X POST http://localhost:9000/admin/promotion-ext-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "promotion_id": "promo_abc123",
    "auto_apply": true,
    "promotion_mode": "bundle",
    "mode_config": { "bundle_size": 2, "remainder": "full_price" }
  }'
```

Result: a cart with 2 qualifying items (65 each, 130 total) gets a 10 discount (130 - 120 = 10), total 120.

#### Buy-Get Repeat

Buy X items at full price, get Y items discounted — repeating for every qualifying group. Example: "buy 2 get 1 free" applied to every group of 3 items, not just once.

**Requirements:**
- Medusa promotion must be a product-level type (`target_type: "items"`)
- `application_method.type` = `"fixed"` or `"percentage"`
- `application_method.value` = discount amount or percentage (e.g., 100 for 100% off = free)
- `mode_config.buy_quantity` = items at full price per group
- `mode_config.get_quantity` = items discounted per group

**Buy item cap:** Set `application_method.max_quantity` to limit how many "buy" items can participate. Cycles = `floor(max_quantity / buy_quantity)` — e.g., `max_quantity = 4` with `buy_quantity = 3` yields 1 cycle. **Note:** this counts buy items, not discounted items — see CONTEXT.md for the semantic rationale. Leave unset for unlimited. **Important:** `max_quantity` must be >= `buy_quantity`, otherwise no cycles can form.

**End-to-end example — "buy 2 get 1 free"** (items cost 30 each):

```bash
# Step 1: Create the Medusa promotion via admin API
# type: "percentage", target_type: "items", value: 100 (100% off = free)
# max_quantity: null (unlimited) — or at least >= buy_quantity (2)
# is_automatic: false (required)
curl -X POST http://localhost:9000/admin/promotions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "B2G1FREE",
    "is_automatic": false,
    "type": "standard",
    "status": "active",
    "application_method": {
      "type": "percentage",
      "target_type": "items",
      "value": 100,
      "target_rules": [
        {
          "attribute": "items.product.id",
          "operator": "in",
          "values": ["prod_REPLACE_ME"]
        }
      ]
    }
  }'
# -> { "promotion": { "id": "promo_xyz789", ... } }

# Step 2: Create the ext config with buy-get repeat mode
curl -X POST http://localhost:9000/admin/promotion-ext-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "promotion_id": "promo_xyz789",
    "auto_apply": true,
    "promotion_mode": "buyget_repeat",
    "mode_config": {
      "buy_quantity": 2,
      "get_quantity": 1,
      "discount_target": "cheapest",
      "remainder": "full_price"
    }
  }'
```

Result: a cart with 3 qualifying items (30 each, 90 total) gets the cheapest item free — 30 discount, total 60.

The discount always applies to the cheapest qualifying items. Remaining items (those that don't complete a full group) pay full price.

### Manual Cart Adjustments

Operators can create manual discounts or surcharges on a cart via the admin API. Adjustments can target a specific line item or the entire cart (spread proportionally across items).

```bash
# Create a cart-wide 10 EUR discount (tax-inclusive)
curl -X POST /admin/cart-adjustments/:cart_id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "description": "VIP discount",
    "is_tax_inclusive": true
  }'
```

Amount follows Medusa's convention: positive = discount, negative = surcharge. Cart-wide adjustments (`item_id: null`) are spread proportionally across items based on each item's share of the cart subtotal.

Set `is_tax_inclusive: true` when the amount already includes tax (e.g., in tax-inclusive regions). Defaults to `false`. When omitted or `false`, Medusa adds tax on top of the discount amount, which can produce incorrect totals in tax-inclusive stores.

### Three-Layer Enforcement

| Layer | When | Mechanism | Effect on failure |
|---|---|---|---|
| 1 -- Code Gate | Customer enters promo code | `updateCartPromotionsWorkflow.hooks.validate` (sync) | HTTP 400, cart unchanged |
| 2 -- Sync Apply | During cart mutation | Custom store route overrides + `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` | Auto-apply eval + non-standard adjustments before API response |
| 2b -- Async Fallback | After any cart mutation | `cart.updated` subscriber (async) | Same as Layer 2, for mutation paths not covered by route overrides |
| 3 -- Checkout Gate | Before order is placed | `completeCartWorkflow.hooks.validate` (sync) | HTTP 400, order blocked |

## Creating Rules

Rules are attached to a Medusa promotion through three nested objects: a **Config** (one per promotion), one or more **Rule Groups**, and one or more **Rules** per group. Both paths below produce the same data model — the UI is a visual wrapper around the same API calls.

---

### Via the API

**Prerequisites:** create the promotion in Medusa admin first, and ensure `is_automatic` is set to `false`.

#### Step 1 -- Create a `PromotionExtConfig`

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

| Field | Type | Default | Description |
|---|---|---|---|
| `promotion_id` | string | required | Medusa promotion ID to attach rules to |
| `auto_apply` | boolean | `false` | `true` = auto-add/remove from cart; `false` = code-only |
| `include_groups_combinator` | `"and"` \| `"or"` | `"or"` | How include groups are joined (`"or"` = any group triggers) |

#### Step 2 -- Create one or more `PromotionExtRuleGroup`s

Each group is one logical scenario. Use `/batch` to create multiple at once.

```bash
curl -X POST http://localhost:9000/admin/promotion-ext-rule-groups/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "promotion_config_id": "pec_01", "type": "include", "rules_combinator": "and" },
      { "promotion_config_id": "pec_01", "type": "include", "rules_combinator": "and" }
    ]
  }'
```

| Field | Type | Default | Description |
|---|---|---|---|
| `promotion_config_id` | string | required | ID of the parent config |
| `type` | `"include"` \| `"exclude"` | required | Include groups gate eligibility; exclude groups suppress it |
| `rules_combinator` | `"and"` \| `"or"` | `"and"` | How rules within this group are joined |

#### Step 3 -- Create `PromotionExtRule`s

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
| `config.field` | string | One of the six supported fields |
| `config.operator` | string | `eq` `neq` `gt` `gte` `lt` `lte` (restricted per field) |
| `config.value` | number \| boolean | The threshold value to compare against |
| `config.scope.product_id` | string | Required when `field` is `quantityOfProduct` |
| `config.scope.collection_id` | string | Required when `field` is `quantityOfCollection` |

---

### Via the Admin UI

The plugin injects two widgets at the bottom of every promotion detail page in Medusa admin:

**"When will this promotion be applied?"** — rule editor for activation rules (auto-apply, combinators, rule groups)

**"How is the discount applied?"** — promotion mode configuration (standard, bundle, buy-get repeat) with read-only display of Medusa's `value`, `type`, and `max_quantity` fields

#### Rules Editor

1. Navigate to **Promotions -> [your promotion]**. Scroll to the widget.
2. Click **+ Add rules** or the **...** menu -> **Edit**
3. Toggle **Auto Apply** on/off
4. Set the group combinator (AND/OR between groups)
5. **Add rule group** -> configure rules inside each group
6. Click **Save**

#### Promotion Mode

1. Click the **...** menu on the "How is the discount applied?" container -> **Edit**
2. Select a mode: Standard, Bundle Pricing, or Buy-Get Repeat
3. Configure mode-specific fields (bundle size, buy/get quantities)
4. Note: `value`, `type`, and `max_quantity` are shown as read-only — edit them in the Medusa promotion settings above
5. Click **Save**

**Setting up a bundle promotion via the UI — "2 for 120":**

1. Create a new promotion in **Promotions** -> **Create Promotion**
2. Set **Code** (e.g., `BUNDLE2FOR120`), **Status** to Active, and **Is Automatic** to off
3. Set **Type** to "Amount off products" and **Amount** to `120` (the bundle target price)
4. Under **Target Rules**, add a product rule to scope which products qualify
5. Set **Maximum Quantity** to at least the bundle size (e.g., `2` or higher), or leave blank for unlimited. If `max_quantity` is less than the bundle size, no bundles can form and a warning will appear in the mode widget.
6. Save the promotion, then scroll down to the **"How is the discount applied?"** widget
7. Click **...** -> **Edit**, select **Bundle Pricing**, set **Bundle Size** to `2`, and save

**Setting up a buy-get promotion via the UI — "buy 2 get 1 free":**

1. Create a new promotion with **Type** "Percentage off product" and **Percentage** `100` (100% off = free)
2. Set **Is Automatic** to off, add **Target Rules** for qualifying products
3. Set **Maximum Quantity** to at least the buy quantity (e.g., `2` or higher), or leave blank for unlimited
4. Save the promotion, then scroll to **"How is the discount applied?"** widget
5. Click **...** -> **Edit**, select **Buy-Get Repeat**, set **Buy** to `2` and **Get** to `1`, and save

## API

All endpoints are admin-only. Each resource supports single-item CRUD and `/batch` for bulk operations.

### Promotion Configs

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-configs?promotion_id=X` | Fetch config with nested groups and rules |
| `POST` | `/admin/promotion-ext-configs` | Create config |
| `PATCH` | `/admin/promotion-ext-configs/:id` | Update config (auto_apply, mode, mode_config) |
| `DELETE` | `/admin/promotion-ext-configs/:id` | Delete config |
| `POST/PATCH/DELETE` | `/admin/promotion-ext-configs/batch` | Bulk operations |

### Rule Groups

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-rule-groups?promotion_config_id=X` | Fetch groups for a config |
| `POST` | `/admin/promotion-ext-rule-groups` | Create group |
| `PATCH` | `/admin/promotion-ext-rule-groups/:id` | Update group (combinator) |
| `DELETE` | `/admin/promotion-ext-rule-groups/:id` | Delete group (cascades rules) |
| `POST/DELETE` | `/admin/promotion-ext-rule-groups/batch` | Bulk operations |

### Rules

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/promotion-ext-rules?rule_group_id[]=X` | Fetch rules for one or more groups |
| `POST` | `/admin/promotion-ext-rules` | Create rule |
| `PATCH` | `/admin/promotion-ext-rules/:id` | Update rule |
| `DELETE` | `/admin/promotion-ext-rules/:id` | Delete rule |
| `POST/PATCH/DELETE` | `/admin/promotion-ext-rules/batch` | Bulk operations |

### Cart Adjustments

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/cart-adjustments/:cart_id` | List adjustments for a cart |
| `POST` | `/admin/cart-adjustments/:cart_id` | Create adjustment |
| `PATCH` | `/admin/cart-adjustments/:cart_id/:id` | Update adjustment |
| `DELETE` | `/admin/cart-adjustments/:cart_id/:id` | Delete adjustment |
| `PATCH/DELETE` | `/admin/cart-adjustments/:cart_id/batch` | Bulk operations |

### Cart Adjustments (v1 — RBAC)

Scoped routes authenticated via `@retailos-ai/rms-access` with RBAC permission checks. Same functionality as the admin routes but accessible to non-admin users with appropriate RBAC roles.

| Method | Path | RBAC | Description |
|---|---|---|---|
| `GET` | `/v1/cart-adjustments/:cart_id` | read | List adjustments for a cart |
| `POST` | `/v1/cart-adjustments/:cart_id` | create | Create adjustment |
| `DELETE` | `/v1/cart-adjustments/:cart_id/:id` | remove | Delete adjustment |

## Project Structure

```
src/
  admin/
    components/
      rules-editor/               Drawer-based rule editor (combinator toggles, group cards, rule rows)
      promotion-mode/              Promotion mode display + edit form (bundle/buyget config)
    hooks/                         React Query hooks for all REST resources
    widgets/                       promotion-rules-widget.tsx — injected at promotion.details.after
  api/
    admin/
      promotion-ext-configs/       REST routes, validators, query config, mode validation
      promotion-ext-rule-groups/   REST routes, validators, query config
      promotion-ext-rules/         REST routes, validators, query config
      cart-adjustments/            Manual adjustment CRUD per cart
    v1/cart-adjustments/             RBAC-scoped proxy routes for cart adjustments (read, create, delete)
    store/carts/
      [id]/line-items/             Override: add/update/delete item with sync auto-apply + adjustments
      [id]/promotions/             Override: promo code entry with sync non-standard adjustments
      helpers.ts                   Shared refetchCart utility
  lib/
    rule-evaluator.ts              Pure rule evaluation — no DB calls, no side effects
    cart-enricher.ts               Builds EnrichedCart context (queries order history for usesPerCustomer)
    adjustment-calculator.ts       Bundle and buy-get repeat computation (reads from application_method)
    target-rule-evaluator.ts       Filters eligible cart items by target rules
    adjustment-spread.ts           Proportional distribution of cart-wide adjustments
    cart-logic-exports.ts             Barrel export of cart logic functions for external consumers
    cart-route-handlers.ts            Extracted route override logic (add/update/delete item, add/remove promotions)
    cart-updated-handler.ts           Extracted subscriber logic for cart.updated events
    enrich-cart-promotions.ts                Shared: attaches auto_apply onto cart promotions for store responses
    compute-non-standard-adjustments.ts  Shared: computes bundle/buyget adjustments, merges with native
    recalc-standard-adjustments.ts       Shared: corrects native promo adjustments after tier repricing (see ADR-0010)
    evaluate-auto-apply-promotions.ts    Shared: evaluates auto-apply rules, adds/removes promos
  modules/promotion-ext/
    models/                        MikroORM entities for 4 DB tables
    service.ts                     MedusaService (auto-generated CRUD for all 4 models)
    migrations/                    DB migrations
  subscribers/
    cart-updated.ts                Layer 2b: async fallback — auto-apply + code-applied re-eval
    sync-non-standard-adjustments.ts  Layer 2: workflow hook — sync non-standard adjustments (passes insideHook to avoid deadlock)
    validate-cart-promotions.ts    Layer 1: synchronous code-entry gate
    validate-checkout.ts           Layer 3: synchronous checkout gate
    promotion-deleted.ts           Cleanup: soft-deletes config on promotion.deleted (hook + subscriber)
    promotion-restored.ts          Restores soft-deleted config/groups/rules on promotion.restored
    cart-completed.ts              Cleans up ext adjustments when a cart completes (order placed)
  types/                           TypeScript types for HTTP payloads and responses
    rbac.ts                         RBAC module declarations for @retailos-ai/rms-access integration
  workflows/promotion-ext/         Medusa workflows for CRUD (used by API routes)
docs/
  metadata-promotion-enforcement/
    CONTEXT.md                     Domain glossary
    adr/                           Architecture Decision Records (10 ADRs — see below)
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
