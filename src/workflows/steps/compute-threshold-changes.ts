import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type ThresholdPromotion = {
  promotionId: string
  code: string
  minCartSubtotal: number
}

export type ThresholdChanges = {
  toAdd: string[]
  toRemove: string[]
}

export function computeThresholdChanges({
  cartSubtotal,
  appliedPromotionIds,
  thresholdPromotions,
}: {
  cartSubtotal: number
  appliedPromotionIds: string[]
  thresholdPromotions: ThresholdPromotion[]
}): ThresholdChanges {
  const appliedSet = new Set(appliedPromotionIds)
  const toAdd: string[] = []
  const toRemove: string[] = []

  for (const promo of thresholdPromotions) {
    const qualifies = cartSubtotal >= promo.minCartSubtotal
    const isApplied = appliedSet.has(promo.promotionId)

    if (qualifies && !isApplied) {
      toAdd.push(promo.code)
    } else if (!qualifies && isApplied) {
      toRemove.push(promo.code)
    }
  }

  return { toAdd, toRemove }
}

export const computeThresholdChangesStep = createStep(
  "compute-threshold-changes",
  async (input: {
    cartSubtotal: number
    appliedPromotionIds: string[]
    thresholdPromotions: ThresholdPromotion[]
  }) => {
    return new StepResponse(computeThresholdChanges(input))
  }
)
