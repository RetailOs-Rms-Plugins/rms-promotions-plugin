import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  AdminCartExtAdjustmentDeleteResponse,
  AdminCartExtAdjustmentResponse,
  AdminUpdateCartExtAdjustmentPayload,
} from "../../../../../types"
import {
  deleteCartExtAdjustmentsWorkflow,
  updateCartExtAdjustmentsWorkflow,
} from "../../../../../workflows/promotion-ext"
import { CART_EXT_ADJUSTMENT_MODEL } from "../../../../../modules/promotion-ext/constants"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminCartExtAdjustmentResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [cart_ext_adjustment],
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!cart_ext_adjustment) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart ext adjustment with id "${id}" not found`
    )
  }

  res.status(200).json({ cart_ext_adjustment: cart_ext_adjustment as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminUpdateCartExtAdjustmentPayload>,
  res: MedusaResponse<AdminCartExtAdjustmentResponse>
) => {
  const { id, cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [existing],
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    fields: ["id", "source", "code", "item_id", "amount"],
    filters: { id },
  })

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ext adjustment with id "${id}" not found`)
  }

  if ((existing as any).source !== "manual") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only manual adjustments can be updated. Engine-computed adjustments are managed automatically."
    )
  }

  await updateCartExtAdjustmentsWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })

  const cartModule = req.scope.resolve(Modules.CART)
  const cart = await cartModule.retrieveCart(cart_id, {
    relations: ["items.adjustments"],
  })

  const code = (existing as any).code as string
  const remainingAdjustments = (cart.items ?? []).flatMap(
    (item: any) => (item.adjustments ?? []).filter((adj: any) => adj.code !== code)
  )

  const updatedAmount = req.validatedBody.amount ?? (existing as any).amount
  const updatedDescription = req.validatedBody.description !== undefined
    ? req.validatedBody.description
    : (existing as any).description

  await cartModule.setLineItemAdjustments(cart_id, [
    ...remainingAdjustments.map((adj: any) => ({
      id: adj.id,
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      description: adj.description,
      promotion_id: adj.promotion_id,
      provider_id: adj.provider_id,
    })),
    {
      item_id: (existing as any).item_id,
      code,
      amount: updatedAmount,
      description: updatedDescription ?? undefined,
    },
  ])

  const {
    data: [cart_ext_adjustment],
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  res.status(200).json({ cart_ext_adjustment: cart_ext_adjustment as never })
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminCartExtAdjustmentDeleteResponse>
) => {
  const { id, cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [existing],
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    fields: ["id", "source", "code"],
    filters: { id },
  })

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ext adjustment with id "${id}" not found`)
  }

  if ((existing as any).source !== "manual") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only manual adjustments can be deleted. Engine-computed adjustments are managed automatically."
    )
  }

  await deleteCartExtAdjustmentsWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  const code = (existing as any).code as string
  const cartModule = req.scope.resolve(Modules.CART)
  const cart = await cartModule.retrieveCart(cart_id, {
    relations: ["items.adjustments"],
  })

  const remainingAdjustments = (cart.items ?? []).flatMap(
    (item: any) => (item.adjustments ?? []).filter((adj: any) => adj.code !== code)
  )

  await cartModule.setLineItemAdjustments(
    cart_id,
    remainingAdjustments.map((adj: any) => ({
      id: adj.id,
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      description: adj.description,
      promotion_id: adj.promotion_id,
      provider_id: adj.provider_id,
    }))
  )

  res.status(200).json({ id, object: "cart_ext_adjustment", deleted: true })
}
