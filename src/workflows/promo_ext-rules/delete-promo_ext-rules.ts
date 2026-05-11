import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteRmsRulesStep } from "./steps"

type DeleteRmsRulesWorkflowInput = { ids: string[] }

export const deleteRmsRulesWorkflow = createWorkflow(
  "delete-rms-rules",
  (input: WorkflowData<DeleteRmsRulesWorkflowInput>) => {
    const ids = deleteRmsRulesStep(input)
    return new WorkflowResponse(ids)
  }
)
