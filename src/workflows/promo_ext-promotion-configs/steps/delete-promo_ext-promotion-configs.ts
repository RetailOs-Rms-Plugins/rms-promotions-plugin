import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const deleteRmsPromotionConfigsStepId = "delete-rms-promotion-configs-step"

type DeleteRmsPromotionConfigsStepInput = { ids: string[] }

export const deleteRmsPromotionConfigsStep = createStep(
  deleteRmsPromotionConfigsStepId,
  async (input: DeleteRmsPromotionConfigsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsPromotionConfigs({ id: input.ids })

    await service.softDeleteRmsPromotionConfigs(input.ids)

    return new StepResponse(input.ids, originals)
  },
  async (originals: { id: string }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.restoreRmsPromotionConfigs(originals.map((o) => o.id))
  }
)
