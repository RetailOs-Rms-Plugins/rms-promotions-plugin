import { defineMiddlewares } from "@medusajs/medusa"
import promotionExtConfigsMiddlewares from "./admin/promotion-ext-configs/middlewares"
import promotionExtRuleGroupsMiddlewares from "./admin/promotion-ext-rule-groups/middlewares"
import promotionExtRulesMiddlewares from "./admin/promotion-ext-rules/middlewares"
import cartExtAdjustmentsMiddlewares from "./admin/cart-adjustments/middlewares"
import orderEditsMiddlewares from "./admin/order-edits/middlewares"
import { v1CartAdjustmentRouteMiddlewares } from "./v1/cart-adjustments/middlewares"

export default defineMiddlewares({
  routes: [
    ...(promotionExtConfigsMiddlewares.routes ?? []),
    ...(promotionExtRuleGroupsMiddlewares.routes ?? []),
    ...(promotionExtRulesMiddlewares.routes ?? []),
    ...(cartExtAdjustmentsMiddlewares.routes ?? []),
    ...(orderEditsMiddlewares.routes ?? []),
    ...v1CartAdjustmentRouteMiddlewares,
  ],
})
