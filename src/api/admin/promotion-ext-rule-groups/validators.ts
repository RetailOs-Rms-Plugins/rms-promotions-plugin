import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { z } from "@medusajs/framework/zod"

const RULE_GROUP_TYPES = ["include", "exclude"] as const

export const AdminGetPromotionExtRuleGroupsSchema = createFindParams({ offset: 0, limit: 50 })
  .extend({
    id: z.union([z.string(), z.array(z.string())]).optional(),
    promotion_config_id: z.union([z.string(), z.array(z.string())]).optional(),
    type: z.union([z.enum(RULE_GROUP_TYPES), z.array(z.enum(RULE_GROUP_TYPES))]).optional(),
    created_at: createOperatorMap().optional(),
    updated_at: createOperatorMap().optional(),
  })

export const AdminGetPromotionExtRuleGroupSchema = createSelectParams()

export const AdminCreatePromotionExtRuleGroupSchema = z.object({
  promotion_config_id: z.string().min(1, "promotion_config_id is required"),
  type: z.enum(RULE_GROUP_TYPES),
})

export const AdminCreatePromotionExtRuleGroupsWorkflowInputSchema = z.object({
  items: z
    .array(AdminCreatePromotionExtRuleGroupSchema)
    .nonempty("at least one item is required"),
})

export const AdminUpdatePromotionExtRuleGroupSchema = z.object({
  type: z.enum(RULE_GROUP_TYPES).optional(),
})

export const AdminUpdatePromotionExtRuleGroupsWorkflowInputSchema = z.object({
  items: z
    .array(AdminUpdatePromotionExtRuleGroupSchema.extend({ id: z.string().min(1) }))
    .nonempty("at least one item is required"),
})

export const AdminBatchDeletePromotionExtRuleGroupsSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("at least one id is required"),
})
