# @retailos-ai/rms-promotions-extension

## 1.7.0

### Minor Changes

- ce92203: Bump peer dependencies to Medusa 2.19.0, `@retailos-ai/rms-medusa-ui` 1.4.0, and `@retailos-ai/rms-access` 1.3.0.

  - `@medusajs/*` peer ranges raised to `2.19.0`
  - Compatible with `@medusajs/ui@4.2.1`
  - `@retailos-ai/rms-medusa-ui` peer + dev raised to `^1.4.0`; yalc ref removed
  - `@retailos-ai/rms-access` peer + dev raised to `^1.3.0`; yalc ref removed
  - **Widget-zone suffix sweep (Step 8):** stripped deprecated `.before` / `.after` suffixes on zones that became invalid in Medusa 2.17.2 — mention if customers customize widgets.
  - No public API changes; promotion extension logic, admin UI, and REST routes unchanged from `1.6.x`
  - Consumer apps must run on Medusa 2.19+ after this release

## 1.6.0

### Minor Changes

- 5a57832: feat: add enrichCartPromotionsWithMetadata to expose promotion metadata in store cart responses

## 1.5.0

### Minor Changes

- 4444c61: Add custom line items to orders via order-edit workflow

  New admin API route `POST /admin/order-edits/:id/custom-items` allows adding line items without a product variant (title + unit_price + quantity) to an active order-edit session. Includes an admin widget on the order detail page with a form matching the Medusa draft-order pattern. Guards against paid/fulfilled orders. Existing promotion adjustments are preserved — no recalculation occurs.

  This is a temporary workaround for the order-edit promotion gap: custom promotions only recalculate on carts, not order edits. Store managers can manually apply missed discounts as negative-price custom items.

## 1.4.1

### Patch Changes

- 1dfa6c1: Fix duplicate standard promotion adjustments caused by race between workflow hook and cart.updated subscriber. Deduplicates preserved+restored adjustments by promotion_id+item_id before scaling and capping.

## 1.4.0

### Minor Changes

- 70bb864: feat: add enrichCartPromotionsWithAutoApply to expose auto_apply in store cart responses

## 1.3.3

### Patch Changes

- 8d07eb8: fix: use upsertLineItemAdjustments instead of non-existent updateLineItemAdjustments in recalcStandardAdjustments

## 1.3.2

### Patch Changes

- 873e3f1: Add recalcStandardAdjustments to correct native Medusa promotion adjustments after tier repricing. Percentage promos are recalculated using the repriced unit_price; fixed-amount promos are capped at the item subtotal when the discount exceeds the repriced price.

## 1.3.1

### Patch Changes

- 941668d: Move @retailos-ai/rms-access from dependencies to devDependencies + peerDependencies

## 1.3.0

### Minor Changes

- 0f48c08: Add cart-logic barrel export and remove cart extension points (routes, workflow hooks, cart event subscribers) now owned by rms-cart-orchestrator

## 1.2.0

### Minor Changes

- c7225a4: Add scoped v1/cart-adjustments routes with RBAC auth

## 1.1.12

### Patch Changes

- 75d056f: Upgrade Medusa dependencies to v2.16.0

## 1.1.11

### Patch Changes

- 7bf9ab5: Fix manual/ext adjustment duplication on cart mutations (BF-015)

  Manual and cart_ext_adjustment-tracked adjustments (e.g., Simply club discounts) were duplicated on every
  cart mutation (add item, update quantity, change address). Each mutation added one more copy per line item,
  inflating discount_total by 1× per mutation.

  Root cause: `applyExtAdjustmentsToCart` read the same adjustment from two sources — cart item adjustments
  (`preservedAdjustments`) and the `cart_ext_adjustment` table (`customAdjustments`) — and merged them without
  cross-source deduplication.

  Fix: Skip adjustments in `preservedAdjustments` whose code matches a `cart_ext_adjustment` record. Those
  adjustments are always re-created fresh from the table, so preserving them from cart items double-counts them.

## 1.1.10

### Patch Changes

- 97d6f92: Bug Fixes

  - Filter zero-amount adjustments and unlink budget-exhausted promos: Engine no longer produces $0 line-item
    adjustments. Promotions whose budget is fully consumed are automatically unlinked from the cart.
  - Unit tests for BF-010, BF-012, BF-013 bug fixes.
  - Mode config vs max_quantity validation: Backend now validates mode_config changes (not just promotion_mode
    changes) against the promotion's max_quantity. Frontend shows a descriptive toast instead of "Internal Server
    Error" when bundle_size or buy_quantity exceeds max_quantity.
  - Number input clearing in promotion mode form: Clearing bundle_size, buy_quantity, or get_quantity fields no
    longer snaps back to the original value.

  Features

  - Metadata field added to all four plugin models (PromotionExtConfig, PromotionExtRuleGroup, PromotionExtRule,
    CartExtAdjustment): model definition, types using MetadataType, Zod validators, workflow steps, query configs,
    and API route handlers updated end-to-end. Migration adds jsonb nullable columns to the three models that
    didn't have it.

## 1.1.9

### Patch Changes

- 830c595: ---

  Bug Fixes

  - Discount stacking / negative cart totals (Entry 1): Non-standard promotions (bundle, buyget_repeat) are now mutually exclusive per item via a greedy best-deal algorithm.
    Only the highest-savings non-standard promo wins per item. Standard promotions stack after, with percentage discounts correctly recomputed on the post-bundle remaining
    price (not the original price). A per-item budget cap prevents totals from going negative.
  - Cart race condition (Entry 2): All promotion logic (auto-apply evaluation, non-standard adjustment computation) moved into the beforeRefreshingPaymentCollection workflow
    hook, running inside Medusa's distributed lock. Eliminates concurrent writers that caused duplicate adjustments, inconsistent discounts, and transient negative totals
    during rapid cart mutations.
  - Phantom promotion links (Entry 3): restoreEvictedStandardPromos now computes adjustments before linking — promos that produce no adjustments are never linked.
    Additionally, evaluateAutoApplyPromotions now checks application_method.target_rules against cart items before auto-linking, preventing promos from appearing in
    cart.promotions when no items match.
  - Duplicate adjustment ID error (Entry 4): Resolved by Entry 2 — no concurrent writers means no duplicate key conflicts.
  - Standard auto-apply promos missing adjustments on first link (Entry 8): Freshly-linked promo codes from evaluateAutoApplyPromotions are now threaded through to
    restoreEvictedStandardPromos, which computes their adjustments via computeActions even though they're already linked.
  - Rounding loss in budget cap (Entry 9): Replaced proportional scaling with Math.floor in capAdjustmentsToSubtotal with sequential capping (same algorithm as Medusa
    native). No rounding loss when multiple standard promos are capped at remaining budget.
  - Wrong price basis and Math.floor in calculators (Entry 10): computeBundle and computeBuyGetRepeat now use tax-exclusive subtotals for percentage promos and tax-inclusive
    prices for tax-inclusive bundles. All Math.floor calls on monetary amounts removed from calculators and spreadCartAdjustment.
  - is_tax_inclusive not forwarded in admin routes (Entry 11): All admin CRUD route handlers (POST, PATCH, DELETE — single and batch) now forward is_tax_inclusive and
    metadata when writing line item adjustments via addLineItemAdjustments / setLineItemAdjustments.

  Features

  - Target price per item (Entry 7): bundle_size validation changed from min(2) to min(1), enabling per-item target price promotions using the existing bundle calculator.

## 1.1.8

### Patch Changes

- b406fed: fix: restore standard promotions evicted by non-standard budget contamination

  Medusa's `computeActions` uses a shared budget map across all promotions. Non-standard promotions (bundle, buy-get repeat) consumed item budgets with their native `application_method.value`, leaving zero remaining budget for standard promotions computed later. This caused standard auto-apply promotions (e.g., "10% off") to produce zero adjustments and be removed from the cart entirely when a non-standard promotion (e.g., a bundle) was also active.

  Added `restoreEvictedStandardPromos` — after non-standard adjustments are computed, detects standard auto-apply promotions that were wrongly evicted, re-links them to the cart, and computes their adjustments independently with a clean budget context.

  See ADR-0009 for full analysis.

## 1.1.7

### Patch Changes

- 8b728a0: ⏺ Fix double discount on standard promotions with auto-apply enabled. When both the route handler and cart.updated subscriber called evaluateAutoApplyPromotions concurrently, each independently determined the promo should be added
  and triggered updateCartPromotionsWorkflow(ADD), creating duplicate line item adjustments. Added per-cart in-memory lock to serialize concurrent calls so the second caller sees the promo already applied and skips.

## 1.1.6

### Patch Changes

- 353abd5: ⏺ fix: prevent deadlock when removing cart items with non-standard promotions

  computeNonStandardAdjustments called updateCartPromotionsWorkflow.run() from inside
  a workflow hook when no eligible items remained, deadlocking on the cart lock.
  Added insideHook flag to skip that path — promotion removal is deferred to the
  route override (auto-apply) or cart.updated subscriber (code-applied).

## 1.1.5

### Patch Changes

- f3d16e4: fix: forward is_tax_inclusive and metadata to Medusa LineItemAdjustment

  - Fixed incorrect cart totals in tax-inclusive regions (e.g., Israel 18% VAT) where bundle/buyget discounts were double-taxed
  - Forward `is_tax_inclusive` from the promotion to CartExtAdjustment and through to Medusa's LineItemAdjustment in all three transfer paths (preserved, item-specific, cart-wide)
  - Forward `metadata` through the same paths to maintain full field parity with Medusa's native adjustments
  - Removed `BUNDLE_`/`BUYGET_REPEAT_` prefix from adjustment `code` field — now uses the raw promotion code to align with Medusa's convention (`adjustment.code === promotion.code`). Manual adjustments keep `MANUAL_<id>`.

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
