import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deletePromotionExtConfigsStep } from "./steps"

type DeletePromotionExtConfigsWorkflowInput = { ids: string[] }

export const deletePromotionExtConfigsWorkflowId = "delete-promotion-ext-configs"

export const deletePromotionExtConfigsWorkflow = createWorkflow(
  deletePromotionExtConfigsWorkflowId,
  (input: WorkflowData<DeletePromotionExtConfigsWorkflowInput>) => {
    const result = deletePromotionExtConfigsStep(input)
    return new WorkflowResponse(result)
  }
)
