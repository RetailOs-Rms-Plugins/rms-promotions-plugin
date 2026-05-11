import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const createRmsPromotionConfigsStepId = "create-rms-promotion-configs-step"

type CreateRmsPromotionConfigsStepInput = {
  items: {
    promotion_id: string
    rms_auto_apply?: boolean
  }[]
}

export const createRmsPromotionConfigsStep = createStep(
  createRmsPromotionConfigsStepId,
  async (input: CreateRmsPromotionConfigsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    const created = await service.createRmsPromotionConfigs(input.items)
    return new StepResponse(created, created.map((c) => c.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.deleteRmsPromotionConfigs(ids)
  }
)
