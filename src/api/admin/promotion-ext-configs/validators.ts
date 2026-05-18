import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { z } from "@medusajs/framework/zod"

export const AdminGetPromotionExtConfigsSchema = createFindParams({ offset: 0, limit: 50 })
  .extend({
    id: z.union([z.string(), z.array(z.string())]).optional(),
    promotion_id: z.union([z.string(), z.array(z.string())]).optional(),
    auto_apply: z
      .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
      .optional(),
    created_at: createOperatorMap().optional(),
    updated_at: createOperatorMap().optional(),
  })

export const AdminGetPromotionExtConfigSchema = createSelectParams()

const COMBINATORS = ["and", "or"] as const

export const AdminCreatePromotionExtConfigSchema = z.object({
  promotion_id: z.string().min(1, "promotion_id is required"),
  auto_apply: z.boolean().optional().default(false),
  include_groups_combinator: z.enum(COMBINATORS).optional().default("or"),
  exclude_groups_combinator: z.enum(COMBINATORS).optional().default("or"),
})

export const AdminCreatePromotionExtConfigsWorkflowInputSchema = z.object({
  items: z.array(AdminCreatePromotionExtConfigSchema).nonempty("at least one item is required"),
})

export const AdminUpdatePromotionExtConfigSchema = z.object({
  auto_apply: z.boolean().optional(),
  include_groups_combinator: z.enum(COMBINATORS).optional(),
  exclude_groups_combinator: z.enum(COMBINATORS).optional(),
})

export const AdminUpdatePromotionExtConfigsWorkflowInputSchema = z.object({
  items: z
    .array(AdminUpdatePromotionExtConfigSchema.extend({ id: z.string().min(1) }))
    .nonempty("at least one item is required"),
})

export const AdminBatchDeletePromotionExtConfigsSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("at least one id is required"),
})
