import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { UpdatePromotionDTO } from "@medusajs/types"
import { ThresholdPromotionUpdateInput } from "./validate-threshold-update-input"

export const updateMedusaPromotionStep = createStep(
  "update-medusa-promotion",
  async (input: ThresholdPromotionUpdateInput, { container }) => {
    const { promotionId, discountType, discountValue, currencyCode, isAutomatic, campaignId } = input

    const promotionFields: Record<string, unknown> = {}
    const methodFields: Record<string, unknown> = {}

    if (isAutomatic !== undefined) promotionFields.is_automatic = isAutomatic
    if (campaignId !== undefined) promotionFields.campaign_id = campaignId ?? null
    if (discountType !== undefined) methodFields.type = discountType
    if (discountValue !== undefined) methodFields.value = discountValue
    if (currencyCode !== undefined) methodFields.currency_code = currencyCode

    const hasPromotionChanges = Object.keys(promotionFields).length > 0
    const hasMethodChanges = Object.keys(methodFields).length > 0

    if (!hasPromotionChanges && !hasMethodChanges) return new StepResponse(void 0)

    const promotionService = container.resolve(Modules.PROMOTION)

    const update: UpdatePromotionDTO = { id: promotionId, ...promotionFields }
    if (hasMethodChanges) update.application_method = methodFields as UpdatePromotionDTO["application_method"]

    await promotionService.updatePromotions(update)

    return new StepResponse(void 0)
  }
)
