import { z } from "@medusajs/framework/zod"
import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { applyAndAndOrOperators } from "@medusajs/medusa/api/utils/common-validators/common"

//#region GET (List)

export const AdminGetRmsRuleGroupsParamsFields = z.object({
  id: z.union([z.string(), z.array(z.string())]).optional(),
  promotion_config_id: z.union([z.string(), z.array(z.string())]).optional(),
  type: z.enum(["include", "exclude"]).optional(),
  created_at: createOperatorMap().optional(),
  updated_at: createOperatorMap().optional(),
  deleted_at: createOperatorMap().optional(),
})

export const AdminGetRmsRuleGroupsSchema = createFindParams({ offset: 0, limit: 50 })
  .merge(AdminGetRmsRuleGroupsParamsFields)
  .merge(applyAndAndOrOperators(AdminGetRmsRuleGroupsParamsFields))

//#endregion

//#region GET (Single)

export const AdminGetRmsRuleGroupSchema = createSelectParams()

//#endregion

//#region DTO Schemas

export const CreateRmsRuleGroupDTOSchema = z.object({
  promotion_config_id: z.string().min(1, "promotion_config_id is required"),
  type: z.enum(["include", "exclude"]),
})

export const CreateRmsRuleGroupWorkflowInputSchema = z.object({
  items: z
    .array(CreateRmsRuleGroupDTOSchema)
    .nonempty("At least one item is required"),
})

const UpdateRmsRuleGroupDTOBaseSchema = z.object({
  id: z.string().min(1, "id is required"),
  type: z.enum(["include", "exclude"]).optional(),
})

export const UpdateRmsRuleGroupDTOSchema = UpdateRmsRuleGroupDTOBaseSchema

export const AdminUpdateRmsRuleGroupSchema =
  UpdateRmsRuleGroupDTOBaseSchema.omit({ id: true })

export const UpdateRmsRuleGroupWorkflowInputSchema = z.object({
  items: z
    .array(UpdateRmsRuleGroupDTOSchema)
    .nonempty("At least one item is required"),
})

export const DeleteRmsRuleGroupsWorkflowInputSchema = z.object({
  ids: z.array(z.string()).nonempty("At least one id is required"),
})

//#endregion
