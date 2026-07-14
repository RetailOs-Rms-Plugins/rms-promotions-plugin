import "@retailos-ai/rms-access/middlewares/rbac/modules"
import {
  RbacModules as AccessRbacModules,
  type RbacModulesMap,
} from "@retailos-ai/rms-access/middlewares/rbac/modules"

export interface CartAdjustmentModels {
  CartAdjustment: "cart-adjustment"
}

declare module "@retailos-ai/rms-access/middlewares/rbac/modules" {
  interface RbacModulesMap {
    CartAdjustment: CartAdjustmentModels
  }
}

export const RbacModules: RbacModulesMap = {
  ...AccessRbacModules,
  CartAdjustment: { CartAdjustment: "cart-adjustment" },
}
