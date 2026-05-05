import { computeThresholdChanges, ThresholdPromotion } from "../compute-threshold-changes"

describe("computeThresholdChanges", () => {
  it("adds a qualifying promotion that is not yet applied", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 120,
      appliedPromotionIds: [],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual(["OVER100"])
    expect(result.toRemove).toEqual([])
  })

  it("removes an applied promotion when subtotal drops below threshold", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 80,
      appliedPromotionIds: ["promo_1"],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual([])
    expect(result.toRemove).toEqual(["OVER100"])
  })

  it("is a no-op when promotion already applied and subtotal still qualifies", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 150,
      appliedPromotionIds: ["promo_1"],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it("is a no-op when subtotal is below threshold and promotion not applied", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 50,
      appliedPromotionIds: [],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it("applies when subtotal exactly equals the threshold", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 100,
      appliedPromotionIds: [],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual(["OVER100"])
    expect(result.toRemove).toEqual([])
  })

  it("handles multiple promotions with different thresholds independently", () => {
    const promos: ThresholdPromotion[] = [
      { promotionId: "promo_1", code: "OVER100", minCartSubtotal: 100 },
      { promotionId: "promo_2", code: "OVER300", minCartSubtotal: 300 },
    ]

    const result = computeThresholdChanges({
      cartSubtotal: 150,
      appliedPromotionIds: ["promo_2"],
      thresholdPromotions: promos,
    })

    expect(result.toAdd).toEqual(["OVER100"])
    expect(result.toRemove).toEqual(["OVER300"])
  })

  it("returns empty changes when there are no threshold promotions", () => {
    const result = computeThresholdChanges({
      cartSubtotal: 500,
      appliedPromotionIds: [],
      thresholdPromotions: [],
    })

    expect(result.toAdd).toEqual([])
    expect(result.toRemove).toEqual([])
  })
})
