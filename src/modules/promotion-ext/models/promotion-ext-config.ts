import { model } from "@medusajs/framework/utils"
import { PROMOTION_EXT_CONFIG_MODEL } from "../constants"
import { PromotionExtRuleGroup } from "./promotion-ext-rule-group"

export const PromotionExtConfig = model.define(PROMOTION_EXT_CONFIG_MODEL, {
  id: model.id({ prefix: "pec" }).primaryKey(),
  promotion_id: model.text(),
  auto_apply: model.boolean().default(false),
  rule_groups: model.hasMany(() => PromotionExtRuleGroup, {
    mappedBy: "promotion_config",
  }),
})
