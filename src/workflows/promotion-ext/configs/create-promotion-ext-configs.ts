import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createPromotionExtConfigsStep } from "./steps"

type CreatePromotionExtConfigsWorkflowInput = {
  items: {
    promotion_id: string
    auto_apply?: boolean
    promotion_mode?: string
    mode_config?: Record<string, unknown> | null
  }[]
}

export const createPromotionExtConfigsWorkflowId = "create-promotion-ext-configs"

export const createPromotionExtConfigsWorkflow = createWorkflow(
  createPromotionExtConfigsWorkflowId,
  (input: WorkflowData<CreatePromotionExtConfigsWorkflowInput>) => {
    const created = createPromotionExtConfigsStep(input)
    return new WorkflowResponse(created)
  }
)
