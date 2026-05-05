import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

export const deleteMedusaPromotionStep = createStep(
  "delete-medusa-promotion",
  async ({ promotionId }: { promotionId: string }, { container }) => {
    const promotionService = container.resolve(Modules.PROMOTION)
    await promotionService.deletePromotions(promotionId)
    return new StepResponse(void 0)
  }
)
