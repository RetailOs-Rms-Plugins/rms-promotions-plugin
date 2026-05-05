import { Module } from "@medusajs/framework/utils"
import ThresholdPromotionModuleService from "./service"

export const THRESHOLD_PROMOTION_MODULE = "thresholdPromotion"

export default Module(THRESHOLD_PROMOTION_MODULE, {
  service: ThresholdPromotionModuleService,
})
