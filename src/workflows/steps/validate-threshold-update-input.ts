import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { ValidationResult } from "./validate-threshold-input"

export type ThresholdPromotionUpdateInput = {
  promotionId: string
  thresholdRuleId: string
  minCartSubtotal?: number
  discountType?: "fixed" | "percentage"
  discountValue?: number
  currencyCode?: string
  isAutomatic?: boolean
  campaignId?: string | null
}

export function validateThresholdUpdateInput(input: ThresholdPromotionUpdateInput): ValidationResult {
  const errors: string[] = []

  if (input.minCartSubtotal !== undefined && input.minCartSubtotal <= 0) {
    errors.push("minCartSubtotal must be greater than 0")
  }

  if (input.discountValue !== undefined && input.discountValue <= 0) {
    errors.push("discountValue must be greater than 0")
  }

  if (input.discountType === "percentage" && input.discountValue !== undefined && input.discountValue > 100) {
    errors.push("discountValue cannot exceed 100 for percentage discounts")
  }

  if (input.currencyCode !== undefined && !/^[A-Z]{3}$/.test(input.currencyCode)) {
    errors.push("currencyCode must be a 3-letter uppercase ISO currency code")
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

export const validateThresholdUpdateInputStep = createStep(
  "validate-threshold-update-input",
  async (input: ThresholdPromotionUpdateInput) => {
    const result = validateThresholdUpdateInput(input)
    if (!result.valid) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, result.errors.join(", "))
    }
    return new StepResponse(void 0)
  }
)
