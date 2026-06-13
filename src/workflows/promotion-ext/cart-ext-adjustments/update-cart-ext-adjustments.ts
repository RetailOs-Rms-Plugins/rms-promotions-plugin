import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { updateCartExtAdjustmentsStep } from "./steps"

type UpdateCartExtAdjustmentsWorkflowInput = {
  items: {
    id: string
    amount?: number
    description?: string | null
    is_tax_inclusive?: boolean
    metadata?: MetadataType
  }[]
}

export const updateCartExtAdjustmentsWorkflowId = "update-cart-ext-adjustments"

export const updateCartExtAdjustmentsWorkflow = createWorkflow(
  updateCartExtAdjustmentsWorkflowId,
  (input: WorkflowData<UpdateCartExtAdjustmentsWorkflowInput>) => {
    const updated = updateCartExtAdjustmentsStep(input)
    return new WorkflowResponse(updated)
  }
)
