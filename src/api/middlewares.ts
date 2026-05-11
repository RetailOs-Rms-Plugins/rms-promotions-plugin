import { defineMiddlewares } from "@medusajs/medusa"
import promotionExtConfigsMiddlewares from "./admin/promotion-ext-configs/middlewares"
import promotionExtRuleGroupsMiddlewares from "./admin/promotion-ext-rule-groups/middlewares"
import promotionExtRulesMiddlewares from "./admin/promotion-ext-rules/middlewares"

export default defineMiddlewares({
  routes: [
    ...(promotionExtConfigsMiddlewares.routes ?? []),
    ...(promotionExtRuleGroupsMiddlewares.routes ?? []),
    ...(promotionExtRulesMiddlewares.routes ?? []),
  ],
})
