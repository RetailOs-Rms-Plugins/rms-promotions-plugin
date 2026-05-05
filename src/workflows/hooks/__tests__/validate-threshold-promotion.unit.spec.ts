import { findThresholdViolations } from "../validate-threshold-promotion"

describe("findThresholdViolations", () => {
  it("blocks a promotion when cart subtotal is below the threshold", () => {
    const violations = findThresholdViolations({
      cartSubtotal: 250,
      promotionsWithThresholds: [
        { code: "VIP300", minCartSubtotal: 300, currencyCode: "ILS" },
      ],
    })

    expect(violations).toEqual([
      { code: "VIP300", minCartSubtotal: 300, currencyCode: "ILS" },
    ])
  })

  it("allows a promotion when cart subtotal meets the threshold exactly", () => {
    const violations = findThresholdViolations({
      cartSubtotal: 300,
      promotionsWithThresholds: [
        { code: "VIP300", minCartSubtotal: 300, currencyCode: "ILS" },
      ],
    })

    expect(violations).toEqual([])
  })

  it("allows a promotion when cart subtotal exceeds the threshold", () => {
    const violations = findThresholdViolations({
      cartSubtotal: 400,
      promotionsWithThresholds: [
        { code: "VIP300", minCartSubtotal: 300, currencyCode: "ILS" },
      ],
    })

    expect(violations).toEqual([])
  })

  it("returns only the blocked promotions when multiple codes are being applied", () => {
    const violations = findThresholdViolations({
      cartSubtotal: 150,
      promotionsWithThresholds: [
        { code: "OVER100", minCartSubtotal: 100, currencyCode: "ILS" },
        { code: "OVER300", minCartSubtotal: 300, currencyCode: "ILS" },
      ],
    })

    expect(violations).toEqual([
      { code: "OVER300", minCartSubtotal: 300, currencyCode: "ILS" },
    ])
  })

  it("returns empty when no promotions have threshold rules", () => {
    const violations = findThresholdViolations({
      cartSubtotal: 0,
      promotionsWithThresholds: [],
    })

    expect(violations).toEqual([])
  })
})
