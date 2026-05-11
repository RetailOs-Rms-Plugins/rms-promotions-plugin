import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createRmsRulesStep } from "./steps"

type CreateRmsRulesWorkflowInput = {
  items: {
    rule_group_id: string
    rule_type: string
    config: Record<string, unknown>
  }[]
}

export const createRmsRulesWorkflow = createWorkflow(
  "create-rms-rules",
  (input: WorkflowData<CreateRmsRulesWorkflowInput>) => {
    const created = createRmsRulesStep(input)
    return new WorkflowResponse(created)
  }
)
