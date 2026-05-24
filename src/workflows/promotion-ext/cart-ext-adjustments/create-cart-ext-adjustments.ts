import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createCartExtAdjustmentsStep } from "./steps"

type CreateCartExtAdjustmentsWorkflowInput = {
  items: {
    cart_id: string
    item_id: string | null
    amount: number
    code: string | null
    source: string
    description?: string | null
    promotion_id?: string | null
    provider_id?: string | null
    is_tax_inclusive?: boolean
    metadata?: Record<string, unknown> | null
  }[]
}

export const createCartExtAdjustmentsWorkflowId = "create-cart-ext-adjustments"

export const createCartExtAdjustmentsWorkflow = createWorkflow(
  createCartExtAdjustmentsWorkflowId,
  (input: WorkflowData<CreateCartExtAdjustmentsWorkflowInput>) => {
    const created = createCartExtAdjustmentsStep(input)
    return new WorkflowResponse(created)
  }
)
