import { defineMiddlewares } from "@medusajs/medusa"
import promotionExtConfigsMiddlewares from "./admin/promotion-ext-configs/middlewares"
import promotionExtRuleGroupsMiddlewares from "./admin/promotion-ext-rule-groups/middlewares"
import promotionExtRulesMiddlewares from "./admin/promotion-ext-rules/middlewares"
import cartExtAdjustmentsMiddlewares from "./admin/cart-adjustments/middlewares"
import { v1CartAdjustmentRouteMiddlewares } from "./v1/cart-adjustments/middlewares"

export default defineMiddlewares({
  routes: [
    ...(promotionExtConfigsMiddlewares.routes ?? []),
    ...(promotionExtRuleGroupsMiddlewares.routes ?? []),
    ...(promotionExtRulesMiddlewares.routes ?? []),
    ...(cartExtAdjustmentsMiddlewares.routes ?? []),
    ...v1CartAdjustmentRouteMiddlewares,
  ],
})
