/**
 * Override for POST/DELETE /store/carts/:id/line-items/:line_id.
 *
 * Promotion logic runs inside the beforeRefreshingPaymentCollection hook,
 * within the workflow's distributed lock. Routes just run workflows and return.
 */

import { handleUpdateLineItem, handleDeleteLineItem } from "../../../../../../lib/cart-route-handlers"

export const POST = handleUpdateLineItem
export const DELETE = handleDeleteLineItem
