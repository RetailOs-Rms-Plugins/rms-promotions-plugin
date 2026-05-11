import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const deleteRmsRulesStepId = "delete-rms-rules-step"

type DeleteRmsRulesStepInput = { ids: string[] }

export const deleteRmsRulesStep = createStep(
  deleteRmsRulesStepId,
  async (input: DeleteRmsRulesStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsRules({ id: input.ids })

    await service.softDeleteRmsRules(input.ids)

    return new StepResponse(input.ids, originals)
  },
  async (originals: { id: string }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.restoreRmsRules(originals.map((o) => o.id))
  }
)
