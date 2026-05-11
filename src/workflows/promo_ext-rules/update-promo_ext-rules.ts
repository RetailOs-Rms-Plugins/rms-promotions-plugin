import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateRmsRulesStep } from "./steps"

type UpdateRmsRulesWorkflowInput = {
  items: {
    id: string
    rule_type?: string
    config?: Record<string, unknown>
  }[]
}

export const updateRmsRulesWorkflow = createWorkflow(
  "update-rms-rules",
  (input: WorkflowData<UpdateRmsRulesWorkflowInput>) => {
    const updated = updateRmsRulesStep(input)
    return new WorkflowResponse(updated)
  }
)
