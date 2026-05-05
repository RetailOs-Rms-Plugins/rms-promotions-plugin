import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"

export type ThresholdPromotionInput = {
  code: string
  minCartSubtotal: number
  discountType: "fixed" | "percentage"
  discountValue: number
  currencyCode: string
  isAutomatic: boolean
  campaignId?: string | null
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] }

export function validateThresholdInput(input: ThresholdPromotionInput): ValidationResult {
  const errors: string[] = []

  if (input.minCartSubtotal <= 0) {
    errors.push("minCartSubtotal must be greater than 0")
  }

  if (input.discountValue <= 0) {
    errors.push("discountValue must be greater than 0")
  }

  if (input.discountType === "percentage" && input.discountValue > 100) {
    errors.push("discountValue cannot exceed 100 for percentage discounts")
  }

  if (!input.currencyCode || !/^[A-Z]{3}$/.test(input.currencyCode)) {
    errors.push("currencyCode must be a 3-letter uppercase ISO currency code")
  }

  if (!input.code || input.code.trim() === "") {
    errors.push("code must not be empty")
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

export const validateThresholdInputStep = createStep(
  "validate-threshold-input",
  async (input: ThresholdPromotionInput) => {
    const result = validateThresholdInput(input)
    if (!result.valid) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, result.errors.join(", "))
    }
    return new StepResponse(void 0)
  }
)
