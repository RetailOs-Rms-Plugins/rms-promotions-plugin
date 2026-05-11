import { MedusaService } from "@medusajs/framework/utils"
import { RmsPromotionConfig, RmsRule, RmsRuleGroup } from "./models"

class RmsPromotionRulesModuleService extends MedusaService({
  RmsPromotionConfig,
  RmsRuleGroup,
  RmsRule,
}) {}

export default RmsPromotionRulesModuleService
