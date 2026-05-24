import { MedusaService } from "@medusajs/framework/utils"
import {
  CartExtAdjustment,
  PromotionExtConfig,
  PromotionExtRule,
  PromotionExtRuleGroup,
} from "./models"

class PromotionExtModuleService extends MedusaService({
  PromotionExtConfig,
  PromotionExtRuleGroup,
  PromotionExtRule,
  CartExtAdjustment,
}) {}

export default PromotionExtModuleService
