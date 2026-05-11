import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateRmsRuleGroupsStep } from "./steps"

type UpdateRmsRuleGroupsWorkflowInput = {
  items: {
    id: string
    type?: "include" | "exclude"
  }[]
}

export const updateRmsRuleGroupsWorkflow = createWorkflow(
  "update-rms-rule-groups",
  (input: WorkflowData<UpdateRmsRuleGroupsWorkflowInput>) => {
    const updated = updateRmsRuleGroupsStep(input)
    return new WorkflowResponse(updated)
  }
)
