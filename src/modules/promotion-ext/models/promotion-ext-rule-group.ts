import { model } from "@medusajs/framework/utils"
import { PROMOTION_EXT_RULE_GROUP_MODEL } from "../constants"
import { PromotionExtConfig } from "./promotion-ext-config"
import { PromotionExtRule } from "./promotion-ext-rule"

export const PromotionExtRuleGroup = model.define(PROMOTION_EXT_RULE_GROUP_MODEL, {
  id: model.id({ prefix: "perg" }).primaryKey(),
  type: model.text(),
  rules_combinator: model.text().default("and"),
  promotion_config: model.belongsTo(() => PromotionExtConfig, {
    mappedBy: "rule_groups",
  }),
  rules: model.hasMany(() => PromotionExtRule, {
    mappedBy: "rule_group",
  }),
})
