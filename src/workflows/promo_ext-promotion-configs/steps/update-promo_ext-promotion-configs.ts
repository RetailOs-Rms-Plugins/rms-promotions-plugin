import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const updateRmsPromotionConfigsStepId = "update-rms-promotion-configs-step"

type UpdateRmsPromotionConfigsStepInput = {
  items: {
    id: string
    promotion_id?: string
    rms_auto_apply?: boolean
  }[]
}

export const updateRmsPromotionConfigsStep = createStep(
  updateRmsPromotionConfigsStepId,
  async (input: UpdateRmsPromotionConfigsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsPromotionConfigs({
      id: input.items.map((i) => i.id),
    })

    const updated = await service.updateRmsPromotionConfigs(input.items)

    return new StepResponse(updated, originals)
  },
  async (originals: { id: string; promotion_id: string; rms_auto_apply: boolean }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.updateRmsPromotionConfigs(originals)
  }
)
