import { z } from "@medusajs/framework/zod"

export const PostAdminCreateThresholdPromotion = z.object({
  code: z.string().min(1),
  min_cart_subtotal: z.number().positive(),
  discount_type: z.enum(["fixed", "percentage"]),
  discount_value: z.number().positive(),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  is_automatic: z.boolean(),
  campaign_id: z.string().nullable().optional(),
})

export const PostAdminUpdateThresholdPromotion = z.object({
  min_cart_subtotal: z.number().positive().optional(),
  discount_type: z.enum(["fixed", "percentage"]).optional(),
  discount_value: z.number().positive().optional(),
  currency_code: z.string().regex(/^[A-Z]{3}$/).optional(),
  is_automatic: z.boolean().optional(),
  campaign_id: z.string().nullable().optional(),
})

export type CreateThresholdPromotionBody = z.infer<typeof PostAdminCreateThresholdPromotion>
export type UpdateThresholdPromotionBody = z.infer<typeof PostAdminUpdateThresholdPromotion>
