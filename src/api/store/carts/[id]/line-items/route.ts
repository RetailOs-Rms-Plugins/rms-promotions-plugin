/**
 * Override for POST /store/carts/:id/line-items (add item to cart).
 *
 * Promotion logic (auto-apply evaluation + non-standard adjustments) runs
 * inside the beforeRefreshingPaymentCollection hook, within the workflow's
 * distributed lock. The route handler just runs the workflow and returns.
 */

import { handleAddLineItem } from "../../../../../lib/cart-route-handlers"

export const POST = handleAddLineItem
