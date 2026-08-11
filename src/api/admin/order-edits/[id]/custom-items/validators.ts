import { z } from "@medusajs/framework/zod"

export const AdminAddCustomItemToOrderEditSchema = z.object({
  title: z.string(),
  unit_price: z.number(),
  quantity: z.number().int().min(1).default(1),
})
