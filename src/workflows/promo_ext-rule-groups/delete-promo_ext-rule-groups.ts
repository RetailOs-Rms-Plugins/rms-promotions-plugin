import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteRmsRuleGroupsStep } from "./steps"

type DeleteRmsRuleGroupsWorkflowInput = { ids: string[] }

export const deleteRmsRuleGroupsWorkflow = createWorkflow(
  "delete-rms-rule-groups",
  (input: WorkflowData<DeleteRmsRuleGroupsWorkflowInput>) => {
    const ids = deleteRmsRuleGroupsStep(input)
    return new WorkflowResponse(ids)
  }
)
