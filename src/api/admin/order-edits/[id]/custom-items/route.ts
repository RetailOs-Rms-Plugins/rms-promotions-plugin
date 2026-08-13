import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { orderEditAddNewItemWorkflow } from "@medusajs/core-flows"

interface AdminAddCustomItemToOrderEditBody {
  title: string
  unit_price: number
  quantity: number
}

export const POST = async (
  req: MedusaRequest<AdminAddCustomItemToOrderEditBody>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { title, unit_price, quantity } = req.validatedBody

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "payment_status", "fulfillment_status"],
    filters: { id },
  })

  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id ${id} not found`)
  }

  const PAID_STATUSES = [
    "captured",
    "partially_captured",
    "partially_refunded",
    "refunded",
  ]

  if (PAID_STATUSES.includes(order.payment_status)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cannot add custom items to a paid order"
    )
  }

  const FULFILLED_STATUSES = [
    "fulfilled",
    "partially_fulfilled",
    "partially_shipped",
    "shipped",
    "partially_delivered",
    "delivered",
  ]

  if (FULFILLED_STATUSES.includes(order.fulfillment_status)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cannot add custom items to a fulfilled order"
    )
  }

  const { result } = await orderEditAddNewItemWorkflow(req.scope).run({
    input: {
      order_id: id,
      items: [{ title, unit_price, quantity }],
    },
  })

  res.json({ order_preview: result })
}
