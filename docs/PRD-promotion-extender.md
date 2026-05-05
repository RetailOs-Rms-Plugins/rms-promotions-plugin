# PRD: RMS Promotion Extender Plugin

## Context

Medusa v2's promotion module evaluates rules against a hardcoded set of cart attributes. This plugin extends that system in two independent directions:

1. **Expose additional cart attributes** as valid rule targets (fields already on the cart object that Medusa's admin UI simply doesn't surface)
2. **Support advanced computed rules** based on derived values that don't exist as native cart fields

These are two separate goals with separate implementations. They do not share code.

---

## Constraints

- All code lives in `rms-promotions-extension-plugin`
- The only allowed backend change: add the plugin to `medusa-config.ts`
- No UI work in this phase — all functionality exposed and testable via API calls only

---

## Goal 1: Expose additional cart attributes as rule targets

### Problem

Medusa's admin API endpoint `GET /admin/promotions/rule-attribute-options/:rule_type` returns a hardcoded static list of attributes. Fields like `subtotal`, `quantity`, `item_total`, and any nested cart field are already present in the context the rules engine evaluates — they just aren't exposed as selectable attributes.

### How it works

The rules engine passes the full cart object as `computeActionContext` to `promotionService.computeActions()`. It evaluates rules using `pickValueFromObject(context, attributePath)`, which supports any dot-notation path. So any field on the cart object already works — it just needs to be registered as a valid attribute.

### Solution

Override the route `GET /admin/promotions/rule-attribute-options/:rule_type` from within the plugin. The custom route:

1. Calls the Medusa core handler to get the default attributes
2. Appends a plugin-defined list of additional attributes
3. Returns the merged result

### Attribute definition shape

Each custom attribute follows Medusa's existing shape:

```ts
{
  id: string           // unique identifier
  value: string        // dot-notation path on the cart object (e.g. "subtotal", "customer.metadata.is_vip")
  label: string        // human-readable name
  field_type: "number" | "text" | "boolean"
  operators: string[]  // e.g. ["gt", "gte", "lt", "lte", "eq"]
}
```

### Extensibility

Custom attributes are defined in a single config file in the plugin (`src/config/custom-rule-attributes.ts`). Adding a new attribute = adding one entry to that array. No other files change.

### Examples of attributes this unlocks (no extra code)

| Attribute | Cart path | Type |
|---|---|---|
| Cart subtotal | `subtotal` | number |
| Total item quantity | `quantity` | number |
| Item subtotal (pre-discount) | `item_subtotal` | number |
| Customer metadata field | `customer.metadata.<key>` | any |
| Sales channel | `sales_channel_id` | text |

### Scope

- No context enrichment needed
- No changes to how Medusa evaluates rules
- Risk: low

---

## Goal 2: Support advanced computed rules

### Problem

Some rule conditions cannot be expressed using existing cart fields. They require values derived from the cart that Medusa does not compute — e.g. number of unique products, whether any item is a gift card, total weight, etc.

These derived values must be computed and injected into the context before `computeActions` is called.

### How the rules engine is called

Inside `updateCartPromotionsWorkflow`, the step `getActionsToComputeFromPromotionsStep` does:

```js
const promotionService = container.resolve(Modules.PROMOTION)
await promotionService.computeActions(promotionCodesToApply, computeActionContext, options)
```

It resolves `promotionModuleService` from the IoC container **at call time**. If the plugin registers a wrapper around that service before this step runs, the wrapper can enrich the context before delegating to the real service.

### Viability gate (must confirm before building)

**A minimal test must be run first:**

Write a plugin loader that re-registers `promotionModuleService` in the container with a wrapper whose `computeActions` logs `"WRAPPER CALLED"`. Apply a promo code to a cart. If the log appears — the approach works. If not — this goal requires a different strategy (e.g. requiring a `modules` config entry in medusa-config, which is a larger change).

**Do not build Goal 2 production code until this test passes.**

### Solution (if viability confirmed)

The loader:
1. Resolves the existing `promotionModuleService` from the container
2. Creates a `ContextEnricherWrapper` class that wraps it
3. Re-registers `promotionModuleService` in the container with the wrapper

The wrapper's `computeActions`:
1. Iterates a registry of **context enrichers**
2. Each enricher is a function `(cart) => Record<string, unknown>` — it takes the context and returns new fields to merge in
3. Merges all enricher outputs into the context
4. Calls the original service's `computeActions` with the enriched context

### Enricher registry shape

```ts
type ContextEnricher = {
  key: string                                      // the field name injected into context
  compute: (context: ComputeActionContext) => unknown  // derives the value
}
```

### Extensibility

Adding a new complex rule type = add one enricher to `src/config/context-enrichers.ts`. No other files change.

### Examples

```ts
// Unique product count
{
  key: "unique_products_count",
  compute: (ctx) => new Set(ctx.items?.map(i => i.product?.id)).size
}

// Has gift card
{
  key: "has_giftcard",
  compute: (ctx) => ctx.items?.some(i => i.is_giftcard) ?? false
}
```

---

## Implementation phases

### Phase 0 — Viability test for Goal 2
Write the minimal loader probe. Confirm wrapper is called during promo evaluation.
**Gate:** If probe fails, reassess Goal 2 strategy before proceeding.

### Phase 1 — Goal 1 (no dependencies)
- API route override for rule-attribute-options
- Custom attributes config file
- Integration test: create a promotion rule using `subtotal`, apply it to a cart, verify it evaluates correctly

### Phase 2 — Goal 2 (depends on Phase 0 passing)
- Loader with service wrapper
- Context enricher registry
- Two built-in enrichers as reference implementations
- Integration test: create a promotion rule using a computed attribute, verify correct evaluation

---

## Files to create

```
rms-promotions-extension-plugin/src/
├── api/
│   └── admin/
│       └── promotions/
│           └── rule-attribute-options/
│               └── [rule_type]/
│                   └── route.ts          # Goal 1: attribute list override
├── config/
│   ├── custom-rule-attributes.ts         # Goal 1: attribute definitions
│   └── context-enrichers.ts             # Goal 2: enricher registry
└── loaders/
    └── promotion-context-extender.ts     # Goal 2: service wrapper loader
```

---

## What this does NOT cover

- Admin UI for custom attributes (deferred)
- Changing how promotions are created or stored
- Any modification to Medusa's promotion discount calculation logic
- Order-level promotion workflows (`computeDraftOrderAdjustmentsWorkflow`, etc.) — cart only in this phase
