/**
 * PROBE: Viability test for Goal 2 (computed context enrichment).
 *
 * This file runs at server startup (Medusa imports all workflow files after
 * all modules are loaded). It re-registers the promotion service in the
 * global container with a thin Proxy wrapper that logs when computeActions
 * is called.
 *
 * HOW TO VERIFY:
 *   1. Build the plugin and install it in the backend.
 *   2. Add it to medusa-config.ts plugins array.
 *   3. Start the backend and apply a promo code to any cart.
 *   4. Look for "🔍 [PROBE] WRAPPER CALLED" in the server logs.
 *
 * RESULT:
 *   - Log appears  → Goal 2 is fully buildable via this mechanism.
 *   - Log missing  → Container re-registration is bypassed; need a different strategy.
 *
 * DELETE THIS FILE once the probe result is confirmed.
 */

import { container } from "@medusajs/framework"
import { asValue } from "@medusajs/framework/awilix"
import { Modules } from "@medusajs/framework/utils"

const originalService = container.resolve(Modules.PROMOTION)

const wrapper = new Proxy(originalService, {
  get(target: any, prop: string) {
    if (prop === "computeActions") {
      return async function (...args: unknown[]) {
        console.log("🔍 [PROBE] WRAPPER CALLED — computeActions intercepted")
        console.log(
          "🔍 [PROBE] context top-level keys:",
          Object.keys(args[1] as object)
        )
        return target.computeActions.apply(target, args)
      }
    }
    const value = target[prop]
    return typeof value === "function" ? value.bind(target) : value
  },
})

container.register(Modules.PROMOTION, asValue(wrapper))

console.log("✅ [PROBE] Promotion wrapper registered in global container")
