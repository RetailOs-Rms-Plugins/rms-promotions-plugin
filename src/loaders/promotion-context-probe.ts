import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function promotionContextProbe({
  container,
}: {
  container: MedusaContainer
}) {
  const originalService = container.resolve(Modules.PROMOTION)

  const wrapper = new Proxy(originalService, {
    get(target, prop) {
      if (prop === "computeActions") {
        return async function (...args: unknown[]) {
          console.log("🔍 [PROBE] WRAPPER CALLED — computeActions intercepted")
          console.log("🔍 [PROBE] context keys:", Object.keys(args[1] as object))
          return target.computeActions(...(args as Parameters<typeof target.computeActions>))
        }
      }
      return typeof target[prop] === "function"
        ? target[prop].bind(target)
        : target[prop]
    },
  })

  // @ts-ignore — intentional override for probe
  container.register(Modules.PROMOTION, {
    resolve: () => wrapper,
  })

  console.log("✅ [PROBE] Promotion context probe loader registered")
}
