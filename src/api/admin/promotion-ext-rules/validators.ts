import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { z } from "@medusajs/framework/zod"

const VALID_RULE_FIELDS = [
  "subtotal",
  "quantity",
  "quantityOfProduct",
  "quantityOfCollection",
  "usesPerCustomer",
  "customerGroup",
  "firstOrder",
] as const

const VALID_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin"] as const

const ComparisonConfigSchema = z
  .object({
    field: z.enum(VALID_RULE_FIELDS),
    operator: z.enum(VALID_OPERATORS),
    value: z.union([z.number(), z.string(), z.array(z.string()), z.boolean()]),
    scope: z
      .object({
        product_id: z.string().optional(),
        collection_id: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const scopedFields = ["quantityOfProduct", "quantityOfCollection"]
    if (scopedFields.includes(data.field) && !data.scope) {
      ctx.addIssue({
        code: "custom",
        message: `scope is required for field "${data.field}"`,
        path: ["scope"],
      })
    }

    if (data.field === "quantityOfProduct" && data.scope && !data.scope.product_id) {
      ctx.addIssue({
        code: "custom",
        message: "scope.product_id is required for field quantityOfProduct",
        path: ["scope", "product_id"],
      })
    }

    if (data.field === "quantityOfCollection" && data.scope && !data.scope.collection_id) {
      ctx.addIssue({
        code: "custom",
        message: "scope.collection_id is required for field quantityOfCollection",
        path: ["scope", "collection_id"],
      })
    }

    const arrayOnlyOperators = ["in", "nin"]
    if (arrayOnlyOperators.includes(data.operator) && !Array.isArray(data.value)) {
      ctx.addIssue({
        code: "custom",
        message: `operator "${data.operator}" requires an array value`,
        path: ["value"],
      })
    }
  })

const RuleConfigSchema = z.discriminatedUnion("rule_type", [
  z.object({
    rule_type: z.literal("comparison"),
    config: ComparisonConfigSchema,
  }),
])

export const AdminGetPromotionExtRulesSchema = createFindParams({ offset: 0, limit: 50 })
  .extend({
    id: z.union([z.string(), z.array(z.string())]).optional(),
    rule_group_id: z.union([z.string(), z.array(z.string())]).optional(),
    rule_type: z.union([z.string(), z.array(z.string())]).optional(),
    created_at: createOperatorMap().optional(),
    updated_at: createOperatorMap().optional(),
  })

export const AdminGetPromotionExtRuleSchema = createSelectParams()

export const AdminCreatePromotionExtRuleSchema = z
  .object({
    rule_group_id: z.string().min(1, "rule_group_id is required"),
    rule_type: z.string().min(1, "rule_type is required"),
    config: z.record(z.string(), z.unknown()),
  })
  .superRefine((data, ctx) => {
    if (data.rule_type === "comparison") {
      const result = ComparisonConfigSchema.safeParse(data.config)
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue({ ...issue, path: ["config", ...issue.path] })
        })
      }
    } else {
      ctx.addIssue({
        code: "custom",
        message: `Unknown rule_type "${data.rule_type}". Valid values: comparison`,
        path: ["rule_type"],
      })
    }
  })

export const AdminCreatePromotionExtRulesWorkflowInputSchema = z.object({
  items: z.array(AdminCreatePromotionExtRuleSchema).nonempty("at least one item is required"),
})

export const AdminUpdatePromotionExtRuleSchema = z
  .object({
    rule_type: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.rule_type !== undefined && data.rule_type !== "comparison") {
      ctx.addIssue({
        code: "custom",
        message: `Unknown rule_type "${data.rule_type}". Valid values: comparison`,
        path: ["rule_type"],
      })
    }

    if (data.rule_type === "comparison" && data.config) {
      const result = ComparisonConfigSchema.safeParse(data.config)
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue({ ...issue, path: ["config", ...issue.path] })
        })
      }
    }
  })

export const AdminUpdatePromotionExtRulesWorkflowInputSchema = z.object({
  items: z
    .array(AdminUpdatePromotionExtRuleSchema.extend({ id: z.string().min(1) }))
    .nonempty("at least one item is required"),
})

export const AdminBatchDeletePromotionExtRulesSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("at least one id is required"),
})
