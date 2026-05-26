# @retailos-ai/rms-promotions-extension

## 1.1.1

### Patch Changes

- 37cd462: Reuse Medusa's native application_method fields (value, type, max_quantity) for bundle and buy-get repeat promotion modes instead of custom mode_config fields. max_quantity now caps
- 254d25b: Reuse Medusa's native application_method fields (value, type, max_quantity) for bundle and buy-get repeat promotion modes instead of custom mode_config fields. max_quantity now caps

## 1.1.0

### Minor Changes

- 37a3b4c: Reuse Medusa's native application_method fields for bundle and buy-get repeat promotions.

  Bundle and buy-get modes no longer store discount parameters (bundle_price, discount_type, discount_value) in mode_config. Instead, they read value, type, and max_quantity directly
  from the promotion's application_method. This eliminates duplicate fields, removes the need for dummy values, and gives max_quantity a real purpose as a repeat cap (max bundles or max
  buy-get cycles).

  Promotion type compatibility is now validated on both frontend and backend — bundle requires "Amount off products" (fixed), buy-get requires any product-level type. The admin UI shows
  these Medusa fields as read-only with info tooltips in the promotion mode container, and the edit drawer only exposes mode-specific structural fields (bundle_size, buy/get
  quantities). The mode container now always shows the dropdown menu and auto-creates the promotion_ext_config on first edit, removing the dependency on the rules drawer.

  Domain context (CONTEXT.md) and project documentation (README.md, llms.txt) updated to reflect all changes.

## 1.0.3

### Patch Changes

- e3d69fc: fix version @retailos-ai/rms-medusa-ui

## 1.0.2

### Patch Changes

- 0b02b3f: update medusa version and combinators bugs fix

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
