# Proxy Wrapper Risk Assessment: Intercepting `computeActions`

## What it is

A loader that resolves `promotionModuleService` from Medusa's IoC container at startup, wraps it in a custom class, and re-registers the wrapper under the same key. Any code that resolves `promotionModuleService` — including Medusa's own core workflows — then unknowingly calls our wrapper instead of the original.

---

## Risks

### 1. Unsupported extension point
Medusa does not document re-registering core module services as a supported pattern. There is no contract that the container key (`Modules.PROMOTION`) or the `computeActions` method signature will remain stable across versions. A minor Medusa upgrade could silently break it with no deprecation warning.

### 2. Re-registration can be undone
Medusa's container may re-resolve or re-instantiate `promotionModuleService` after our loader runs — for example during module initialization, hot reload, or worker startup. If it does, our wrapper is discarded and the original service is back, with no error and no log.

### 3. Full blast radius
A bug in our wrapper (an unhandled exception, a wrong return type, a type error) crashes **all** promotion computation across **all** carts in the system — not just the ones we care about. There is no isolation. A syntax error in the `minSubtotal` check takes down every promotion in the store.

### 4. Double-wrapping in multi-worker or hot-reload environments
If the loader runs more than once (multiple Medusa workers, hot reload in dev), the service gets wrapped multiple times. The second wrap receives an already-wrapped instance. This can cause duplicate rule evaluations, unexpected behavior, or stack overflows.

### 5. Method signature drift
If Medusa changes the arguments or return type of `computeActions` in a future version, our wrapper may receive or return incorrect data. This fails silently — the wrapper still runs, but produces wrong results. We would not know until cart discounts behave incorrectly in production.

### 6. Debugging becomes harder
Errors thrown inside the wrapper appear in stack traces as if they came from Medusa's own promotion service. Developers investigating a cart bug will not immediately know there is a custom wrapper in the call path. This increases debugging time significantly.

### 7. Breaks the single-responsibility of core workflows
Medusa's workflows (`updateCartPromotionsWorkflow`, `addToCartWorkflow`) assume `computeActions` is the canonical service. By wrapping it, we are changing the behavior of workflows we do not own, from a place those workflows cannot see. This makes the system harder to reason about.

### 8. Viability is not guaranteed across deployments
The existing probe confirms the wrapper is called in the current dev environment. It does not guarantee the same in production (different Node version, different Medusa config, different module load order). Container registration order is not guaranteed by Medusa's public API.

---

## When it might be acceptable anyway

- The custom rule logic is extremely simple and provably cannot throw
- The wrapper is covered by integration tests that catch signature drift
- The team accepts the upgrade risk and monitors Medusa changelogs carefully
- There is no alternative (e.g. automatic promotions that must be conditionally suppressed before computation)

---

## The safer alternative

Use `updateCartPromotionsWorkflow.hooks.validate` for code-based promotions (synchronous block) and accept that **automatic promotions with custom rules should not use `is_automatic: true`**. Make them code-only. This removes the need for the wrapper entirely and keeps all extension points within Medusa's documented surface.
