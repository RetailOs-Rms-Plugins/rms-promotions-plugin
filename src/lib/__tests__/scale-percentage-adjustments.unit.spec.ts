import { scalePercentageAdjustmentsForBundleRemaining } from "../compute-non-standard-adjustments"

function mockContainer(promoTypes: Record<string, string>) {
  return {
    resolve: jest.fn().mockReturnValue({
      graph: jest.fn().mockResolvedValue({
        data: Object.entries(promoTypes).map(([id, type]) => ({
          id,
          application_method: { type },
        })),
      }),
    }),
  }
}

describe("BF-013: scalePercentageAdjustmentsForBundleRemaining", () => {
  it("scales percentage adjustment to post-bundle remaining", async () => {
    // Item: 50€ tax-incl, 42.37€ tax-excl (18% VAT)
    // Bundle discount: 10€ tax-inclusive on this item
    // Percentage promo: 10% = 4.237€ on original tax-excl subtotal
    // After bundle: remaining = 42.37 - (10 * 42.37/50) = 42.37 - 8.474 = 33.896
    // Scale = 33.896 / 42.37 = 0.8
    // Scaled amount = 4.237 * 0.8 = 3.3896
    const standardAdjs = [
      { item_id: "item_a", amount: 4.237, is_tax_inclusive: false, promotion_id: "pct_promo" },
    ]
    const customAdjustments = [
      { item_id: "item_a", amount: 10, is_tax_inclusive: true },
    ]
    const itemTaxInclSubtotals = new Map([["item_a", 50]])
    const itemTaxExclSubtotals = new Map([["item_a", 42.37]])
    const container = mockContainer({ pct_promo: "percentage" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, customAdjustments, itemTaxInclSubtotals, itemTaxExclSubtotals, container
    )

    expect(result[0].amount).toBeCloseTo(3.3896, 2)
    expect(result[0].amount).toBeLessThan(4.237)
  })

  it("does NOT scale fixed-type standard adjustments", async () => {
    const standardAdjs = [
      { item_id: "item_a", amount: 500, is_tax_inclusive: false, promotion_id: "fixed_promo" },
    ]
    const customAdjustments = [
      { item_id: "item_a", amount: 1000, is_tax_inclusive: true },
    ]
    const itemTaxInclSubtotals = new Map([["item_a", 5000]])
    const itemTaxExclSubtotals = new Map([["item_a", 4237]])
    const container = mockContainer({ fixed_promo: "fixed" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, customAdjustments, itemTaxInclSubtotals, itemTaxExclSubtotals, container
    )

    expect(result[0].amount).toBe(500)
  })

  it("returns adjustments unchanged when no custom adjustments exist", async () => {
    const standardAdjs = [
      { item_id: "item_a", amount: 100, is_tax_inclusive: false, promotion_id: "pct_promo" },
    ]
    const container = mockContainer({ pct_promo: "percentage" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, [], new Map(), new Map(), container
    )

    expect(result[0].amount).toBe(100)
  })

  it("scales to zero when bundle consumes entire item budget", async () => {
    // Item 50€, bundle takes full 50€
    const standardAdjs = [
      { item_id: "item_a", amount: 5, is_tax_inclusive: true, promotion_id: "pct_promo" },
    ]
    const customAdjustments = [
      { item_id: "item_a", amount: 50, is_tax_inclusive: true },
    ]
    const itemTaxInclSubtotals = new Map([["item_a", 50]])
    const itemTaxExclSubtotals = new Map([["item_a", 42.37]])
    const container = mockContainer({ pct_promo: "percentage" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, customAdjustments, itemTaxInclSubtotals, itemTaxExclSubtotals, container
    )

    expect(result[0].amount).toBe(0)
  })

  it("handles mixed percentage and fixed promos — only scales percentage", async () => {
    const standardAdjs = [
      { item_id: "item_a", amount: 4.237, is_tax_inclusive: false, promotion_id: "pct_promo" },
      { item_id: "item_a", amount: 500, is_tax_inclusive: false, promotion_id: "fixed_promo" },
    ]
    const customAdjustments = [
      { item_id: "item_a", amount: 10, is_tax_inclusive: true },
    ]
    const itemTaxInclSubtotals = new Map([["item_a", 50]])
    const itemTaxExclSubtotals = new Map([["item_a", 42.37]])
    const container = mockContainer({ pct_promo: "percentage", fixed_promo: "fixed" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, customAdjustments, itemTaxInclSubtotals, itemTaxExclSubtotals, container
    )

    const pct = result.find((a) => a.promotion_id === "pct_promo")!
    const fixed = result.find((a) => a.promotion_id === "fixed_promo")!

    expect(pct.amount).toBeLessThan(4.237)
    expect(fixed.amount).toBe(500)
  })

  it("items without custom adjustments are not scaled", async () => {
    const standardAdjs = [
      { item_id: "item_a", amount: 5, is_tax_inclusive: false, promotion_id: "pct_promo" },
      { item_id: "item_b", amount: 3, is_tax_inclusive: false, promotion_id: "pct_promo" },
    ]
    const customAdjustments = [
      { item_id: "item_a", amount: 10, is_tax_inclusive: true },
    ]
    const itemTaxInclSubtotals = new Map([["item_a", 50], ["item_b", 30]])
    const itemTaxExclSubtotals = new Map([["item_a", 42.37], ["item_b", 25.42]])
    const container = mockContainer({ pct_promo: "percentage" })

    const result = await scalePercentageAdjustmentsForBundleRemaining(
      standardAdjs, customAdjustments, itemTaxInclSubtotals, itemTaxExclSubtotals, container
    )

    const adjA = result.find((a) => a.item_id === "item_a")!
    const adjB = result.find((a) => a.item_id === "item_b")!

    expect(adjA.amount).toBeLessThan(5)
    expect(adjB.amount).toBe(3)
  })
})
