import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { cleanupCartExtAdjustments } from "../lib/cleanup-cart-ext-adjustments"

export default async function cartCompletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await cleanupCartExtAdjustments(data.id, container)
}

export const config: SubscriberConfig = {
  event: "cart.completed",
}
