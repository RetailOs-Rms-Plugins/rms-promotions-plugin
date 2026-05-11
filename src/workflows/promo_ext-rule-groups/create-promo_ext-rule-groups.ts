import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createRmsRuleGroupsStep } from "./steps"

type CreateRmsRuleGroupsWorkflowInput = {
  items: {
    promotion_config_id: string
    type: "include" | "exclude"
  }[]
}

export const createRmsRuleGroupsWorkflow = createWorkflow(
  "create-rms-rule-groups",
  (input: WorkflowData<CreateRmsRuleGroupsWorkflowInput>) => {
    const created = createRmsRuleGroupsStep(input)
    return new WorkflowResponse(created)
  }
)
