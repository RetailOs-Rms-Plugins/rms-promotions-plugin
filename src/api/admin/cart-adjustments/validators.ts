import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { z } from "@medusajs/framework/zod"

export const AdminGetCartExtAdjustmentsSchema = createFindParams({ offset: 0, limit: 50 })
  .extend({
    id: z.union([z.string(), z.array(z.string())]).optional(),
    source: z.union([z.string(), z.array(z.string())]).optional(),
    item_id: z.union([z.string(), z.array(z.string())]).optional(),
    promotion_id: z.union([z.string(), z.array(z.string())]).optional(),
    created_at: createOperatorMap().optional(),
    updated_at: createOperatorMap().optional(),
  })

export const AdminGetCartExtAdjustmentSchema = createSelectParams()

export const AdminCreateCartExtAdjustmentSchema = z.object({
  item_id: z.string().min(1).nullable().optional(),
  amount: z.number({ message: "amount is required" }),
  description: z.string().optional(),
  is_tax_inclusive: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export const AdminUpdateCartExtAdjustmentSchema = z.object({
  amount: z.number().optional(),
  description: z.string().nullable().optional(),
  is_tax_inclusive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export const AdminBatchCreateCartExtAdjustmentsSchema = z.object({
  items: z.array(AdminCreateCartExtAdjustmentSchema).nonempty("at least one item is required"),
})

export const AdminBatchUpdateCartExtAdjustmentsSchema = z.object({
  items: z
    .array(AdminUpdateCartExtAdjustmentSchema.extend({ id: z.string().min(1) }))
    .nonempty("at least one item is required"),
})

export const AdminBatchDeleteCartExtAdjustmentsSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("at least one id is required"),
})
