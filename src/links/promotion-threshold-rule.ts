import { defineLink } from "@medusajs/framework/utils"
import PromotionModule from "@medusajs/medusa/promotion"
import ThresholdPromotionModule from "../modules/threshold-promotion"

export default defineLink(
  PromotionModule.linkable.promotion,
  ThresholdPromotionModule.linkable.thresholdRule
)
