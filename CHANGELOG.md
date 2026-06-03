# @retailos-ai/rms-promotions-extension

## 1.1.4

### Patch Changes

- 8907002: **Sync cart responses:** Store route overrides for add/update/delete line-items and promo code entry now run auto-apply evaluation and non-standard adjustment computation after the workflow
  completes, ensuring the API response includes correct promotions and adjustments immediately — no stale data.

  **Workflow hook:** `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` computes non-standard adjustments (bundle, buy-get-repeat) for already-applied promotions inside the
  workflow lifecycle.

  **Bug fixes:**

  - `appliedPromotionCodes` now excludes removed promos, preventing orphaned ext adjustments
  - Code-applied promotions with ext-rules are re-evaluated on cart changes (not just auto-apply ones)
  - Per-cart in-memory lock and ext row dedup prevent duplicate adjustments from concurrent `setLineItemAdjustments` calls

  **Shared functions extracted:**

  - `evaluateAutoApplyPromotions` — shared by route overrides and async subscriber
  - `computeNonStandardAdjustments` — shared by hook, route overrides, and subscriber

  **Docs:** ADR-0007 (route override architecture), ADR-0006 (in-memory lock), updated CONTEXT.md, README, and llms.txt with enforcement architecture and extended promotion compatibility matrix.

## 1.1.3

### Patch Changes

- 9d83cbd: Remove non-standard promotions from cart when computed adjustments are empty.

  Bundle and buy-get-repeat promotions could remain visible on the cart even when the quantity threshold wasn't met (e.g. a "3 in 50" bundle with only 2 items). The promotion passed extended rule
  evaluation and was added to the cart, but the adjustment calculator correctly returned zero adjustments — the subscriber never removed the promotion in that case. Now, when a non-standard
  promotion computes to zero adjustments, it is automatically removed from the cart.

## 1.1.2

### Patch Changes

- 60bd393: Fix target rule attribute normalization, add promotion mode validation, and improve documentation.

  The target-rule-evaluator crashed on Medusa's full-path target rule attributes (e.g. "items.product.id") because it only recognized short names like
  "product". This caused the cart-updated subscriber to fail before computing bundle/buy-get adjustments, leaving Medusa's native (incorrect) discount in
  place. Added a normalization map that translates all five Medusa attribute formats to the plugin's short keys.

  Added cross-validation in mode-validation.ts: max_quantity must be >= bundle_size for bundle mode and >= buy_quantity for buy-get repeat mode, and bundle
  value must be > 0. Without this, promotions silently produce zero adjustments at runtime. Validation errors from the backend are now surfaced as toast
  messages in the admin UI instead of being silently swallowed.

  Fixed hardcoded EUR currency in the promotion mode display widget — now reads currency_code from the promotion's application_method and formats with
  Intl.NumberFormat.

  Added red warning text in the promotion mode display widget when max_quantity is incompatible with bundle_size or buy_quantity.

  Updated README.md with end-to-end examples for creating bundle and buy-get promotions via both API and admin UI, including max_quantity constraints. Updated
  llms.txt to version 1.1.0 with matching examples, UI guides, and expanded troubleshooting.

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
