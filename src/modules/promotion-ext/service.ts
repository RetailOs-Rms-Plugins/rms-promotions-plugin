import { MedusaService } from "@medusajs/framework/utils"
import {
  PromotionExtConfig,
  PromotionExtRule,
  PromotionExtRuleGroup,
} from "./models"

class PromotionExtModuleService extends MedusaService({
  PromotionExtConfig,
  PromotionExtRuleGroup,
  PromotionExtRule,
}) {}

export default PromotionExtModuleService
