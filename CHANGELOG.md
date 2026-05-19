# @retailos-ai/rms-promotions-extension

## 1.0.1

### Patch Changes

- d1ad099: add release skript

## 1.0.0

### Major Changes

- c82e6a7: ---

  "@retailos-ai/rms-promotions-extension": major

  ***

  Initial release of the RMS Promotions Extension plugin.

  Extends Medusa's native promotion engine with a cart-state rule system, allowing merchants to gate promotions on live cart conditions beyond Medusa's built-in eligibility attributes.

  ### Features

  - **Custom rule engine** — six rule fields: `subtotal`, `totalQuantity`, `quantityOfProduct`, `quantityOfCollection`, `usesPerCustomer`, `firstOrder`
  - **Configurable combinators** — AND/OR within rule groups and between groups, defaulting to Disjunctive Normal Form (any group triggers, all rules in a group must pass)
  - **Three-layer enforcement** — synchronous code gate (Layer 1), async auto-apply engine on `cart.updated` (Layer 2), synchronous checkout gate (Layer 3)
  - **Auto-apply flag** — promotions with `auto_apply: true` are added and removed from carts automatically as cart state changes
  - **Admin UI** — rule editor widget injected into the Medusa promotion detail page, with AND/OR combinator toggles, collapsible rule group cards, and unsaved-changes guard
  - **REST API** — full CRUD and batch endpoints for `promotion-ext-configs`, `promotion-ext-rule-groups`, and `promotion-ext-rules`
  - **Normalized storage** — three dedicated DB tables (`promotion_ext_config`, `promotion_ext_rule_group`, `promotion_ext_rule`) with FK cascades and SQL-level `auto_apply` filtering
