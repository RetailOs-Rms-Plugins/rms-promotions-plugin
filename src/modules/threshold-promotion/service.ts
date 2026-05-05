import { MedusaService } from "@medusajs/framework/utils"
import ThresholdRule from "./models/threshold-rule"

class ThresholdPromotionModuleService extends MedusaService({
  ThresholdRule,
}) {}

export default ThresholdPromotionModuleService
