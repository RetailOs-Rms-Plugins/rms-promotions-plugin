import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { createPromotionExtRulesStep } from "./steps"

type CreatePromotionExtRulesWorkflowInput = {
  items: {
    rule_group_id: string
    rule_type: string
    config: Record<string, unknown>
    metadata?: MetadataType
  }[]
}

export const createPromotionExtRulesWorkflowId = "create-promotion-ext-rules"

export const createPromotionExtRulesWorkflow = createWorkflow(
  createPromotionExtRulesWorkflowId,
  (input: WorkflowData<CreatePromotionExtRulesWorkflowInput>) => {
    const created = createPromotionExtRulesStep(input)
    return new WorkflowResponse(created)
  }
)
