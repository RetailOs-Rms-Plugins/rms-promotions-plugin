import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  AdminBatchCreateCartExtAdjustmentPayload,
  AdminBatchDeleteCartExtAdjustmentPayload,
  AdminBatchUpdateCartExtAdjustmentPayload,
  AdminCartExtAdjustmentsBatchDeleteResponse,
  AdminCartExtAdjustmentsBatchResponse,
} from "../../../../../types"
import {
  createCartExtAdjustmentsWorkflow,
  deleteCartExtAdjustmentsWorkflow,
  updateCartExtAdjustmentsWorkflow,
} from "../../../../../workflows/promotion-ext"
import { CART_EXT_ADJUSTMENT_MODEL, PROMOTION_EXT_MODULE } from "../../../../../modules/promotion-ext/constants"
import type PromotionExtModuleService from "../../../../../modules/promotion-ext/service"

export const POST = async (
  req: MedusaRequest<AdminBatchCreateCartExtAdjustmentPayload>,
  res: MedusaResponse<AdminCartExtAdjustmentsBatchResponse>
) => {
  const { cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const workflowItems = req.validatedBody.items.map((item) => ({
    cart_id,
    item_id: item.item_id ?? null,
    amount: item.amount,
    source: "manual",
    code: null,
    promotion_id: null,
    provider_id: null,
    description: item.description ?? null,
    is_tax_inclusive: item.is_tax_inclusive ?? false,
  }))

  const { result } = await createCartExtAdjustmentsWorkflow(req.scope).run({
    input: { items: workflowItems },
  })

  const created = result as { id: string }[]
  const service: PromotionExtModuleService = req.scope.resolve(PROMOTION_EXT_MODULE)

  await Promise.all(
    created.map((c) =>
      service.updateCartExtAdjustments([{ id: c.id, code: `MANUAL_${c.id.substring(4)}` }])
    )
  )

  const ids = created.map((c) => c.id)

  const cartModule = req.scope.resolve(Modules.CART)
  const updatedAdjustments = await service.listCartExtAdjustments({ id: ids })
  await cartModule.addLineItemAdjustments(
    cart_id,
    updatedAdjustments.map((adj: any) => ({
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      description: adj.description ?? undefined,
    }))
  )

  const { data: cart_ext_adjustments } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ cart_ext_adjustments: cart_ext_adjustments as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminBatchUpdateCartExtAdjustmentPayload>,
  res: MedusaResponse<AdminCartExtAdjustmentsBatchResponse>
) => {
  const { cart_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = req.scope.resolve(PROMOTION_EXT_MODULE)

  const ids = req.validatedBody.items.map((i) => i.id)
  const existing = await service.listCartExtAdjustments({ id: ids })

  const nonManual = existing.find((adj: any) => adj.source !== "manual")
  if (nonManual) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only manual adjustments can be updated. Adjustment "${(nonManual as any).id}" has source "${(nonManual as any).source}".`
    )
  }

  await updateCartExtAdjustmentsWorkflow(req.scope).run({
    input: { items: req.validatedBody.items },
  })

  const cartModule = req.scope.resolve(Modules.CART)
  const cart = await cartModule.retrieveCart(cart_id, { relations: ["items.adjustments"] })
  const codes = new Set(existing.map((adj: any) => adj.code as string))

  const remainingAdjustments = (cart.items ?? []).flatMap(
    (item: any) => (item.adjustments ?? []).filter((adj: any) => !codes.has(adj.code))
  )

  const updatedRows = await service.listCartExtAdjustments({ id: ids })

  await cartModule.setLineItemAdjustments(cart_id, [
    ...remainingAdjustments.map((adj: any) => ({
      id: adj.id,
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      is_tax_inclusive: adj.is_tax_inclusive ?? false,
      description: adj.description,
      promotion_id: adj.promotion_id,
      provider_id: adj.provider_id,
      metadata: adj.metadata ?? undefined,
    })),
    ...updatedRows.map((adj: any) => ({
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      is_tax_inclusive: adj.is_tax_inclusive ?? false,
      description: adj.description ?? undefined,
    })),
  ] as any)

  const { data: cart_ext_adjustments } = await query.graph({
    entity: CART_EXT_ADJUSTMENT_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ cart_ext_adjustments: cart_ext_adjustments as never })
}

export const DELETE = async (
  req: MedusaRequest<AdminBatchDeleteCartExtAdjustmentPayload>,
  res: MedusaResponse<AdminCartExtAdjustmentsBatchDeleteResponse>
) => {
  const { cart_id } = req.params
  const { ids } = req.validatedBody
  const service: PromotionExtModuleService = req.scope.resolve(PROMOTION_EXT_MODULE)

  const existing = await service.listCartExtAdjustments({ id: ids })

  const nonManual = existing.find((adj: any) => adj.source !== "manual")
  if (nonManual) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only manual adjustments can be deleted. Adjustment "${(nonManual as any).id}" has source "${(nonManual as any).source}".`
    )
  }

  const codes = new Set(existing.map((adj: any) => adj.code as string))

  await deleteCartExtAdjustmentsWorkflow(req.scope).run({ input: { ids } })

  const cartModule = req.scope.resolve(Modules.CART)
  const cart = await cartModule.retrieveCart(cart_id, { relations: ["items.adjustments"] })

  const remainingAdjustments = (cart.items ?? []).flatMap(
    (item: any) => (item.adjustments ?? []).filter((adj: any) => !codes.has(adj.code))
  )

  await cartModule.setLineItemAdjustments(
    cart_id,
    remainingAdjustments.map((adj: any) => ({
      id: adj.id,
      item_id: adj.item_id,
      code: adj.code,
      amount: adj.amount,
      is_tax_inclusive: adj.is_tax_inclusive ?? false,
      description: adj.description,
      promotion_id: adj.promotion_id,
      provider_id: adj.provider_id,
      metadata: adj.metadata ?? undefined,
    })) as any
  )

  res.status(200).json({ ids, deleted: true })
}
