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
const PROMOTION_MODES = ["standard", "bundle", "buyget_repeat"] as const

const BundleModeConfigSchema = z.object({
  bundle_size: z.number().int().min(1),
  bundle_price: z.number().min(0).optional(),
  remainder: z.literal("full_price"),
})

const BuygetRepeatModeConfigSchema = z.object({
  buy_quantity: z.number().int().min(1),
  get_quantity: z.number().int().min(1),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.number().min(0).optional(),
  discount_target: z.literal("cheapest"),
  remainder: z.literal("full_price"),
})

export const AdminCreatePromotionExtConfigSchema = z.object({
  promotion_id: z.string().min(1, "promotion_id is required"),
  auto_apply: z.boolean().optional().default(false),
  include_groups_combinator: z.enum(COMBINATORS).optional().default("or"),
  exclude_groups_combinator: z.enum(COMBINATORS).optional().default("or"),
  promotion_mode: z.enum(PROMOTION_MODES).optional().default("standard"),
  mode_config: z.union([BundleModeConfigSchema, BuygetRepeatModeConfigSchema]).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.promotion_mode === "standard" && data.mode_config != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mode_config must be null when promotion_mode is 'standard'", path: ["mode_config"] })
  }
  if (data.promotion_mode === "bundle" && data.mode_config != null) {
    const result = BundleModeConfigSchema.safeParse(data.mode_config)
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mode_config does not match bundle schema", path: ["mode_config"] })
    }
  }
  if (data.promotion_mode === "buyget_repeat" && data.mode_config != null) {
    const result = BuygetRepeatModeConfigSchema.safeParse(data.mode_config)
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mode_config does not match buyget_repeat schema", path: ["mode_config"] })
    }
  }
  if ((data.promotion_mode === "bundle" || data.promotion_mode === "buyget_repeat") && data.mode_config == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mode_config is required when promotion_mode is not 'standard'", path: ["mode_config"] })
  }
})

export const AdminCreatePromotionExtConfigsWorkflowInputSchema = z.object({
  items: z.array(AdminCreatePromotionExtConfigSchema).nonempty("at least one item is required"),
})

export const AdminUpdatePromotionExtConfigSchema = z.object({
  auto_apply: z.boolean().optional(),
  include_groups_combinator: z.enum(COMBINATORS).optional(),
  exclude_groups_combinator: z.enum(COMBINATORS).optional(),
  promotion_mode: z.enum(PROMOTION_MODES).optional(),
  mode_config: z.union([BundleModeConfigSchema, BuygetRepeatModeConfigSchema]).nullable().optional(),
})

export const AdminUpdatePromotionExtConfigsWorkflowInputSchema = z.object({
  items: z
    .array(AdminUpdatePromotionExtConfigSchema.extend({ id: z.string().min(1) }))
    .nonempty("at least one item is required"),
})

export const AdminBatchDeletePromotionExtConfigsSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("at least one id is required"),
})
