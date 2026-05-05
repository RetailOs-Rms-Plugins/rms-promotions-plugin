import { validateThresholdInput } from "../validate-threshold-input"

const validInput = {
  code: "OVER100",
  minCartSubtotal: 100,
  discountType: "fixed" as const,
  discountValue: 10,
  currencyCode: "ILS",
  isAutomatic: true,
}

describe("validateThresholdInput", () => {
  it("accepts a valid fixed-discount input", () => {
    expect(validateThresholdInput(validInput)).toEqual({ valid: true })
  })

  it("accepts a valid percentage-discount input", () => {
    const result = validateThresholdInput({
      ...validInput,
      discountType: "percentage",
      discountValue: 10,
    })
    expect(result).toEqual({ valid: true })
  })

  it("rejects when minCartSubtotal is zero", () => {
    const result = validateThresholdInput({ ...validInput, minCartSubtotal: 0 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("minCartSubtotal must be greater than 0")
  })

  it("rejects when minCartSubtotal is negative", () => {
    const result = validateThresholdInput({ ...validInput, minCartSubtotal: -50 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("minCartSubtotal must be greater than 0")
  })

  it("rejects when discountValue is zero", () => {
    const result = validateThresholdInput({ ...validInput, discountValue: 0 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("discountValue must be greater than 0")
  })

  it("rejects when percentage discountValue exceeds 100", () => {
    const result = validateThresholdInput({
      ...validInput,
      discountType: "percentage",
      discountValue: 101,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("discountValue cannot exceed 100 for percentage discounts")
  })

  it("allows fixed discountValue above 100", () => {
    const result = validateThresholdInput({ ...validInput, discountType: "fixed", discountValue: 500 })
    expect(result).toEqual({ valid: true })
  })

  it("rejects a lowercase currency code", () => {
    const result = validateThresholdInput({ ...validInput, currencyCode: "ils" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("currencyCode must be a 3-letter uppercase ISO currency code")
  })

  it("rejects a currency code with wrong length", () => {
    const result = validateThresholdInput({ ...validInput, currencyCode: "US" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("currencyCode must be a 3-letter uppercase ISO currency code")
  })

  it("rejects an empty promotion code", () => {
    const result = validateThresholdInput({ ...validInput, code: "  " })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toContain("code must not be empty")
  })

  it("returns all errors when multiple fields are invalid", () => {
    const result = validateThresholdInput({
      ...validInput,
      minCartSubtotal: 0,
      discountValue: 0,
      code: "",
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveLength(3)
  })
})
