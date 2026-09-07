import { z } from "@medusajs/framework/zod"

export const AdminRepairOrderAdjustmentsSchema = z.object({
  adjustment_ids: z.array(z.string()).min(1),
  dry_run: z.boolean().default(false),
})
