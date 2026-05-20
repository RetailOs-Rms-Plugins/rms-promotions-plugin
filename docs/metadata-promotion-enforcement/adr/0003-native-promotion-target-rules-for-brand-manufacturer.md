# ADR-0003: Use Native Medusa PromotionRule with setPromotionContext Hook for Brand/Manufacturer Item Targeting

**Status:** Accepted  
**Date:** 2026-05-20

---

## Context

Merchants want to restrict which cart items a promotion discount is applied to — specifically, items whose product is linked to selected brands or manufacturers from the `rms-products-bridge` plugin. This is fundamentally different from the activation conditions managed by the existing three-layer system (Layers 1–3). Activation conditions gate whether a promotion fires at all; item targeting gates which individual line items receive the discount.

Medusa's native promotion system already supports this concept through **target rules** — `PromotionRule` records attached to a promotion's `application_method` with `target_type: "items"`. These rules filter which cart items get an `ADD_ITEM_ADJUSTMENT` action during `computeActions`. Medusa's own admin UI exposes target rules through an "Edit item conditions" drawer that supports Product, Category, Collection, Type, and Tag as rule attributes.

The `rms-products-bridge` plugin stores brand and manufacturer associations as **many-to-many links** via Medusa's link system — there is no `brand_id` column on the product record. These attributes are therefore invisible to Medusa's standard `computeActions` context.

Three approaches were considered for implementing brand/manufacturer item targeting.

---

## Options

### Option A — Post-process Medusa's adjustment output

After `computeActions` produces `ADD_ITEM_ADJUSTMENT` actions, intercept them and remove adjustments for items that do not belong to the selected brands/manufacturers.

**Rejected because:**
- No documented hook runs between `computeActions` and the step that writes adjustments to the cart — interception would require a proxy wrapper on the promotion module service, which ADR-0002 already rejected as fragile and unsupported.
- Even if technically achievable, the cart would briefly show incorrect totals while the adjustment removal propagates.

### Option B — Plugin-owned item-filtering system

Store brand/manufacturer item conditions in a new plugin table, evaluate them independently of Medusa's engine, and remove adjustments from non-matching items in a post-checkout subscriber.

**Rejected because:**
- Reimplements large portions of Medusa's discount allocation logic (budget tracking, allocation strategy, tax-inclusive amounts) — high maintenance cost with high risk of divergence.
- Requires a third evaluation layer on top of the existing three, adding operational complexity with no clean ownership boundary.
- Medusa's cart totals would not reflect item-level filtering until a second pass runs — storefront UX degrades.

### Option C — Native Medusa PromotionRule + setPromotionContext hook (chosen)

Use Medusa's existing `PromotionRule` data model with custom `attribute` values (`brand_id`, `manufacturer_id`), combined with the `setPromotionContext` hook to inject those attribute values onto cart items before `computeActions` runs.

**Why this works — source-verified findings:**

1. **`areRulesValidForContext`** (the Medusa function that checks each item against target rules) uses `pickValueFromObject(ruleAttribute, context)` to resolve the attribute value from the item. This is a generic dot-notation path resolver with **no hardcoded attribute allowlist** — any property on the item object is evaluated correctly.

2. **`ComputeActionItemLine`** (the item type passed to `computeActions`) extends `Record<string, unknown>` — arbitrary extra properties are valid.

3. **`updateCartPromotionsWorkflow`** exposes a `setPromotionContext` hook that runs after the cart is fetched and before `computeActions` is called. The hook receives `{ cart }` and the DI container. Its return value is merged onto the `applicationContext`:
   ```ts
   const mergedContext = { ...computeActionContext, ...(setPromotionContextResult ?? {}) }
   ```
   Returning `{ items: enrichedItems }` replaces the items in the context with ones that carry `brand_id` and `manufacturer_id` arrays.

4. **`refreshCartItemsWorkflow`** (triggered on cart mutations like add/remove item) calls `updateCartPromotionsWorkflow` internally — the `setPromotionContext` hook fires on every cart update automatically.

5. **The admin API validator** (`validate-rule-attribute.ts`) rejects unknown attributes at the HTTP layer. Bypassed by creating `PromotionRule` records directly via the promotion module service, which has no such restriction. Our plugin's own admin API endpoint handles this creation.

---

## Decision

Use **Option C**: native `PromotionRule` records with custom attributes (`brand_id`, `manufacturer_id`) created via the promotion module service, and a `setPromotionContext` hook that enriches cart items with brand/manufacturer IDs from the link system before Medusa evaluates the rules.

---

## Reasons

- **Zero custom evaluation logic.** Medusa's `computeActions` already correctly handles the `in`, `eq`, and `nin` operators against array-valued item properties. We write enrichment code, not discount math.
- **Discount allocation is correct by construction.** Only items that pass the target rules receive `ADD_ITEM_ADJUSTMENT` actions. Budget tracking, tax treatment, and allocation strategies (ONCE vs EACH) are all handled by Medusa — we do not touch them.
- **Stays within documented extension points.** `setPromotionContext` is a stable, publicly documented hook. No proxy wrappers, no service re-registration.
- **Natural UI analogy.** Our "Edit item conditions" drawer mirrors Medusa's existing native drawer UX — merchants encounter the same mental model.

---

## Consequences

- **`setPromotionContext` hook scope:** the hook fires for every `updateCartPromotionsWorkflow` invocation, regardless of whether the promotion has brand/manufacturer target rules. The hook implementation must be efficient — query the link system only when the promotion's target rules include `brand_id` or `manufacturer_id` attributes. If no such rules exist, the hook returns immediately without any DB calls.

- **`completeCartWorkflow` does not re-compute adjustments.** It only registers usage of already-applied promotions. This means brand/manufacturer target rule filtering applies during cart updates (Layers 1 and 2) but is not re-evaluated at checkout. The item adjustments locked into the cart at the moment of checkout are what the order is created with. This is acceptable — adjustments are always computed fresh on every cart mutation, so the state at checkout reflects the most recent evaluation.

- **Admin API bypass for rule creation.** Our plugin's endpoint calls `promotionModuleService.addRules(applicationMethodId, targetRules)` directly. This bypasses Medusa's HTTP-layer attribute validation. Our own endpoint must validate that only `brand_id` and `manufacturer_id` attributes are accepted — no open pass-through.

- **Plugin dependency:** this feature requires `rms-products-bridge` to be installed and its link tables to be populated. If the bridge plugin is absent, the enrichment hook must degrade gracefully — no crash, simply return items without enrichment (the target rules will evaluate against items with no `brand_id`/`manufacturer_id` and will not match, meaning no item gets a discount under those rules).

- **Many-to-many product–brand relationship:** a product can belong to multiple brands. The enrichment hook stores brand IDs as an array on each item (`brand_id: ["brand_01", "brand_02"]`). Medusa's `in` operator on an array attribute evaluates as "at least one value in the item's array matches a value in the rule's values list" — which is the correct semantic for multi-brand products.
