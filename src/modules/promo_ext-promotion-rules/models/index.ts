import { model } from "@medusajs/framework/utils"
import {
  RMS_PROMOTION_CONFIG_MODEL,
  RMS_RULE_GROUP_MODEL,
  RMS_RULE_MODEL,
} from "../constants"

// Defined leaf-first so forward-reference lazy functions resolve correctly at
// schema-setup time (after all consts are initialised).

export const RmsRule = model.define(RMS_RULE_MODEL, {
  id: model.id({ prefix: "rmsr" }).primaryKey(),
  rule_type: model.text(),
  config: model.json(),
  rule_group: model.belongsTo(() => RmsRuleGroup, { mappedBy: "rules" }),
})

export const RmsRuleGroup = model.define(RMS_RULE_GROUP_MODEL, {
  id: model.id({ prefix: "rmsrg" }).primaryKey(),
  type: model.enum(["include", "exclude"]),
  promotion_config: model.belongsTo(() => RmsPromotionConfig, {
    mappedBy: "rule_groups",
  }),
  rules: model.hasMany(() => RmsRule, { mappedBy: "rule_group" }),
})

export const RmsPromotionConfig = model.define(RMS_PROMOTION_CONFIG_MODEL, {
  id: model.id({ prefix: "rmspc" }).primaryKey(),
  promotion_id: model.text().unique(),
  rms_auto_apply: model.boolean().default(false),
  rule_groups: model.hasMany(() => RmsRuleGroup, { mappedBy: "promotion_config" }),
})
