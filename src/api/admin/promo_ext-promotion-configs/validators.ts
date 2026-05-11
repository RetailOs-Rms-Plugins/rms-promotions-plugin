import { z } from "@medusajs/framework/zod"
import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { applyAndAndOrOperators } from "@medusajs/medusa/api/utils/common-validators/common"

//#region GET (List)

export const AdminGetRmsPromotionConfigsParamsFields = z.object({
  q: z.string().optional(),
  id: z.union([z.string(), z.array(z.string())]).optional(),
  promotion_id: z.union([z.string(), z.array(z.string())]).optional(),
  rms_auto_apply: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : v),
      z.boolean()
    )
    .optional(),
  created_at: createOperatorMap().optional(),
  updated_at: createOperatorMap().optional(),
  deleted_at: createOperatorMap().optional(),
})

export const AdminGetRmsPromotionConfigsSchema = createFindParams({ offset: 0, limit: 50 })
  .merge(AdminGetRmsPromotionConfigsParamsFields)
  .merge(applyAndAndOrOperators(AdminGetRmsPromotionConfigsParamsFields))

//#endregion

//#region GET (Single)

export const AdminGetRmsPromotionConfigSchema = createSelectParams()

//#endregion

//#region DTO Schemas

export const CreateRmsPromotionConfigDTOSchema = z.object({
  promotion_id: z.string().min(1, "promotion_id is required"),
  rms_auto_apply: z.boolean().optional(),
})

export const CreateRmsPromotionConfigWorkflowInputSchema = z.object({
  items: z
    .array(CreateRmsPromotionConfigDTOSchema)
    .nonempty("At least one item is required"),
})

const UpdateRmsPromotionConfigDTOBaseSchema = z.object({
  id: z.string().min(1, "id is required"),
  promotion_id: z.string().min(1).optional(),
  rms_auto_apply: z.boolean().optional(),
})

export const UpdateRmsPromotionConfigDTOSchema = UpdateRmsPromotionConfigDTOBaseSchema

export const AdminUpdateRmsPromotionConfigSchema =
  UpdateRmsPromotionConfigDTOBaseSchema.omit({ id: true })

export const UpdateRmsPromotionConfigWorkflowInputSchema = z.object({
  items: z
    .array(UpdateRmsPromotionConfigDTOSchema)
    .nonempty("At least one item is required"),
})

export const DeleteRmsPromotionConfigsWorkflowInputSchema = z.object({
  ids: z.array(z.string()).nonempty("At least one id is required"),
})

//#endregion
