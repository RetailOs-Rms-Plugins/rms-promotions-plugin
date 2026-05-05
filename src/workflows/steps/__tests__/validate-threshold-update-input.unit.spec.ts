import { validateThresholdUpdateInput } from "../validate-threshold-update-input"

describe("validateThresholdUpdateInput", () => {
  const base = { promotionId: "promo_1", thresholdRuleId: "rule_1" }

  it("is valid with only minCartSubtotal changed", () => {
    const result = validateThresholdUpdateInput({ ...base, minCartSubtotal: 200 })
    expect(result).toEqual({ valid: true })
  })

  it("is valid with multiple fields changed", () => {
    const result = validateThresholdUpdateInput({
      ...base,
      minCartSubtotal: 100,
      discountValue: 15,
      currencyCode: "USD",
    })
    expect(result).toEqual({ valid: true })
  })

  it("is valid with no optional fields (no-op)", () => {
    const result = validateThresholdUpdateInput(base)
    expect(result).toEqual({ valid: true })
  })

  it("is invalid if minCartSubtotal is zero", () => {
    const result = validateThresholdUpdateInput({ ...base, minCartSubtotal: 0 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/minCartSubtotal/)
  })

  it("is invalid if discountValue is negative", () => {
    const result = validateThresholdUpdateInput({ ...base, discountValue: -5 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/discountValue/)
  })

  it("is invalid if percentage discountType with discountValue > 100", () => {
    const result = validateThresholdUpdateInput({
      ...base,
      discountType: "percentage",
      discountValue: 110,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/100/)
  })

  it("allows percentage discountType with discountValue = 100", () => {
    const result = validateThresholdUpdateInput({
      ...base,
      discountType: "percentage",
      discountValue: 100,
    })
    expect(result).toEqual({ valid: true })
  })

  it("is invalid if currencyCode is not 3 uppercase letters", () => {
    const result = validateThresholdUpdateInput({ ...base, currencyCode: "usd" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/currencyCode/)
  })

  it("collects multiple errors", () => {
    const result = validateThresholdUpdateInput({
      ...base,
      minCartSubtotal: -1,
      currencyCode: "bad",
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})
