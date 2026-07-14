import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { cartUpdatedHandler } from "../lib/cart-updated-handler"

// Async fallback for promotion evaluation. The primary synchronous path is
// the beforeRefreshingPaymentCollection hook (src/subscribers/sync-non-standard-adjustments.ts).
// This subscriber covers cart mutation paths not covered by route overrides
// (e.g., shipping method changes, customer assignment, admin operations).
export default async function cartUpdatedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await cartUpdatedHandler(data.id, container)
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
