import { model } from "@medusajs/framework/utils"
import { PROMOTION_EXT_RULE_MODEL } from "../constants"
import { PromotionExtRuleGroup } from "./promotion-ext-rule-group"

export const PromotionExtRule = model.define(PROMOTION_EXT_RULE_MODEL, {
  id: model.id({ prefix: "per" }).primaryKey(),
  rule_type: model.text(),
  config: model.json(),
  rule_group: model.belongsTo(() => PromotionExtRuleGroup, {
    mappedBy: "rules",
  }),
})
