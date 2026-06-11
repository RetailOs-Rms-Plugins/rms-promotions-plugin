import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  AdminCreateCartExtAdjustmentPayload,
  AdminGetCartExtAdjustmentParams,
  AdminCartExtAdjustmentListResponse,
  AdminCartExtAdjustmentResponse,
} from "../../../../types"
import { createCartExtAdjustmentsWorkflow } from "../../../../workflows/promotion-ext"
import { CART_EXT_ADJUSTMENT_MODEL, PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext/constants"
import type PromotionExtModuleService from "../../../../modules/promotion-ext/service"
import { spreadCartAdjustment } from "../../../../lib/adjustment-spread"

export const GET = async (
  req: MedusaRequest<AdminGetCartExtAdjustmentParams>,
  res: MedusaResponse<AdminCartExtAdjustmentListResponse>
) => {
  const { cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { source, item_id, promotion_id, id, ...restFilters } = req.filterableFields ?? {}

  const filters: Record<string, unknown> = { ...restFilters, cart_id }
  if (id) filters.id = id
  if (source) filters.source = source
  if (item_id) filters.item_id = item_id
  if (promotion_id) filters.promotion_id = promotion_id

  const {
    data,
    metadata: { count, take, skip } = {} as any,
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters,
  })

  res.status(200).json({
    cart_ext_adjustments: data as never,
    count,
    offset: skip,
    limit: take,
  })
}

export const POST = async (
  req: MedusaRequest<AdminCreateCartExtAdjustmentPayload>,
  res: MedusaResponse<AdminCartExtAdjustmentResponse>
) => {
  const { cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { item_id, amount, description, is_tax_inclusive } = req.validatedBody

  const { result } = await createCartExtAdjustmentsWorkflow(req.scope).run({
    input: {
      items: [
        {
          cart_id,
          item_id: item_id ?? null,
          amount,
          source: "manual",
          code: null,
          promotion_id: null,
          provider_id: null,
          description: description ?? null,
          is_tax_inclusive: is_tax_inclusive ?? false,
        },
      ],
    },
  })

  const created = (result as { id: string }[])[0]
  const code = `MANUAL_${created.id.substring(4)}`

  const service: PromotionExtModuleService = req.scope.resolve(PROMOTION_EXT_MODULE)
  await service.updateCartExtAdjustments([{ id: created.id, code }])

  const cartModule = req.scope.resolve(Modules.CART)

  const taxInclusive = is_tax_inclusive ?? false

  if (item_id) {
    await cartModule.addLineItemAdjustments(cart_id, [
      {
        item_id,
        code,
        amount,
        is_tax_inclusive: taxInclusive,
        description: description ?? undefined,
      },
    ] as any)
  } else {
    const cart = await cartModule.retrieveCart(cart_id, { relations: ["items"] })
    const cartItems = (cart.items ?? []).map((item: any) => {
      const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number(item.unit_price ?? 0)
      const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0)
      return { id: item.id, subtotal: unitPrice * qty }
    })
    const spread = spreadCartAdjustment(amount, cartItems)
    if (spread.length) {
      await cartModule.addLineItemAdjustments(
        cart_id,
        spread.map((s) => ({ item_id: s.item_id, code, amount: s.amount, is_tax_inclusive: taxInclusive, description: description ?? undefined })) as any
      )
    }
  }

  const {
    data: [cart_ext_adjustment],
  } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters: { id: created.id },
  })

  res.status(201).json({ cart_ext_adjustment: cart_ext_adjustment as never })
}
