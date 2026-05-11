import { Module } from "@medusajs/framework/utils"
import RmsPromotionRulesModuleService from "./service"

export const RMS_PROMOTION_RULES_MODULE = "rms_promotion_rules"

export default Module(RMS_PROMOTION_RULES_MODULE, {
  service: RmsPromotionRulesModuleService,
})
