import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deleteCartExtAdjustmentsStep } from "./steps"

type DeleteCartExtAdjustmentsWorkflowInput = { ids: string[] }

export const deleteCartExtAdjustmentsWorkflowId = "delete-cart-ext-adjustments"

export const deleteCartExtAdjustmentsWorkflow = createWorkflow(
  deleteCartExtAdjustmentsWorkflowId,
  (input: WorkflowData<DeleteCartExtAdjustmentsWorkflowInput>) => {
    const result = deleteCartExtAdjustmentsStep(input)
    return new WorkflowResponse(result)
  }
)
