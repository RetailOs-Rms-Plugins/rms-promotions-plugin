import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type { ThresholdPromotionInput } from "./validate-threshold-input"

export const createMedusaPromotionStep = createStep(
  "create-medusa-promotion",
  async (input: ThresholdPromotionInput, { container }) => {
    const promotionService = container.resolve(Modules.PROMOTION)

    const promotion = await promotionService.createPromotions({
      code: input.code,
      type: "standard",
      status: "active",
      is_automatic: input.isAutomatic,
      campaign_id: input.campaignId ?? undefined,
      application_method: {
        type: input.discountType,
        target_type: "order",
        allocation: "across",
        value: input.discountValue,
        currency_code: input.currencyCode,
      },
    })

    return new StepResponse(promotion, promotion.id)
  },
  async (promotionId: string, { container }) => {
    if (!promotionId) return
    const promotionService = container.resolve(Modules.PROMOTION)
    await promotionService.deletePromotions(promotionId)
  }
)
