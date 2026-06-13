import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { createPromotionExtRuleGroupsStep } from "./steps"

type CreatePromotionExtRuleGroupsWorkflowInput = {
  items: {
    promotion_config_id: string
    type: "include" | "exclude"
    metadata?: MetadataType
  }[]
}

export const createPromotionExtRuleGroupsWorkflowId = "create-promotion-ext-rule-groups"

export const createPromotionExtRuleGroupsWorkflow = createWorkflow(
  createPromotionExtRuleGroupsWorkflowId,
  (input: WorkflowData<CreatePromotionExtRuleGroupsWorkflowInput>) => {
    const created = createPromotionExtRuleGroupsStep(input)
    return new WorkflowResponse(created)
  }
)
