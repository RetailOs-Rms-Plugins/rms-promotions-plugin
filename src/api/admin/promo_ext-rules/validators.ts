import { z } from "@medusajs/framework/zod"
import {
  createFindParams,
  createOperatorMap,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import { applyAndAndOrOperators } from "@medusajs/medusa/api/utils/common-validators/common"

export const RULE_TYPES = ["comparison"] as const
export const RULE_FIELDS = [
  "subtotal",
  "quantity",
  "quantityOfProduct",
  "quantityOfCollection",
  "usesPerCustomer",
  "customerGroup",
  "firstOrder",
] as const
export const RULE_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin"] as const

//#region GET (List)

export const AdminGetRmsRulesParamsFields = z.object({
  id: z.union([z.string(), z.array(z.string())]).optional(),
  rule_group_id: z.union([z.string(), z.array(z.string())]).optional(),
  rule_type: z.union([z.string(), z.array(z.string())]).optional(),
  created_at: createOperatorMap().optional(),
  updated_at: createOperatorMap().optional(),
  deleted_at: createOperatorMap().optional(),
})

export const AdminGetRmsRulesSchema = createFindParams({ offset: 0, limit: 50 })
  .merge(AdminGetRmsRulesParamsFields)
  .merge(applyAndAndOrOperators(AdminGetRmsRulesParamsFields))

//#endregion

//#region GET (Single)

export const AdminGetRmsRuleSchema = createSelectParams()

//#endregion

//#region Comparison rule config schema

const ComparisonRuleConfigSchema = z
  .object({
    field: z.enum(RULE_FIELDS),
    operator: z.enum(RULE_OPERATORS),
    value: z.union([
      z.number(),
      z.string(),
      z.array(z.string()),
      z.boolean(),
    ]),
    scope: z
      .object({
        product_id: z.string().optional(),
        collection_id: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const numericFields = ["subtotal", "quantity", "quantityOfProduct", "quantityOfCollection", "usesPerCustomer"]
    const numericOperators = ["eq", "neq", "gt", "gte", "lt", "lte"]
    const listOperators = ["in", "nin"]

    if (numericFields.includes(data.field)) {
      if (!numericOperators.includes(data.operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `operator "${data.operator}" is not valid for field "${data.field}"`,
          path: ["operator"],
        })
      }
      if (typeof data.value !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value must be a number for field "${data.field}"`,
          path: ["value"],
        })
      }
    }

    if (data.field === "customerGroup") {
      if (!listOperators.includes(data.operator)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `operator "${data.operator}" is not valid for field "customerGroup" — use "in" or "nin"`,
          path: ["operator"],
        })
      }
      if (!Array.isArray(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value must be an array of group IDs for field "customerGroup"`,
          path: ["value"],
        })
      }
    }

    if (data.field === "firstOrder") {
      if (data.operator !== "eq") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `operator "${data.operator}" is not valid for field "firstOrder" — use "eq"`,
          path: ["operator"],
        })
      }
      if (typeof data.value !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value must be a boolean for field "firstOrder"`,
          path: ["value"],
        })
      }
    }

    if (data.field === "quantityOfProduct" && !data.scope?.product_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `scope.product_id is required for field "quantityOfProduct"`,
        path: ["scope", "product_id"],
      })
    }

    if (data.field === "quantityOfCollection" && !data.scope?.collection_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `scope.collection_id is required for field "quantityOfCollection"`,
        path: ["scope", "collection_id"],
      })
    }
  })

// Discriminated union — extend here when new rule types are added
const RuleConfigSchema = z.discriminatedUnion("rule_type", [
  z.object({
    rule_type: z.literal("comparison"),
    config: ComparisonRuleConfigSchema,
  }),
])

//#endregion

//#region DTO Schemas

export const CreateRmsRuleDTOSchema = RuleConfigSchema.and(
  z.object({
    rule_group_id: z.string().min(1, "rule_group_id is required"),
  })
)

export const CreateRmsRuleWorkflowInputSchema = z.object({
  items: z
    .array(CreateRmsRuleDTOSchema)
    .nonempty("At least one item is required"),
})

export const AdminUpdateRmsRuleSchema = z.object({
  rule_type: z.enum(RULE_TYPES).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const UpdateRmsRuleDTOBaseSchema = z.object({
  id: z.string().min(1, "id is required"),
  rule_type: z.enum(RULE_TYPES).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const UpdateRmsRuleDTOSchema = UpdateRmsRuleDTOBaseSchema

export const UpdateRmsRuleWorkflowInputSchema = z.object({
  items: z
    .array(UpdateRmsRuleDTOSchema)
    .nonempty("At least one item is required"),
})

export const DeleteRmsRulesWorkflowInputSchema = z.object({
  ids: z.array(z.string()).nonempty("At least one id is required"),
})

//#endregion
