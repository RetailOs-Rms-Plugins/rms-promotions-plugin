import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateThresholdPromotionWorkflow } from "../../../../workflows/update-threshold-promotion"
import { deleteThresholdPromotionWorkflow } from "../../../../workflows/delete-threshold-promotion"
import { UpdateThresholdPromotionBody } from "../validators"

async function resolveThresholdRule(req: MedusaRequest, promotionId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "threshold_rule.id", "threshold_rule.*"],
    filters: { id: [promotionId] },
  })

  const promotion = promotions[0]
  if (!promotion) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Promotion ${promotionId} not found`)
  }

  const rule = (promotion as any).threshold_rule
  if (!rule) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No threshold rule linked to promotion ${promotionId}`
    )
  }

  return { promotion, rule }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { promotion, rule } = await resolveThresholdRule(req, id)

  res.json({ threshold_promotion: { promotion, threshold_rule: rule } })
}

export const POST = async (
  req: MedusaRequest<UpdateThresholdPromotionBody>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { rule } = await resolveThresholdRule(req, id)
  const body = req.validatedBody

  await updateThresholdPromotionWorkflow(req.scope).run({
    input: {
      promotionId: id,
      thresholdRuleId: rule.id,
      minCartSubtotal: body.min_cart_subtotal,
      discountType: body.discount_type,
      discountValue: body.discount_value,
      currencyCode: body.currency_code,
      isAutomatic: body.is_automatic,
      campaignId: body.campaign_id,
    },
  })

  const { promotion: updated, rule: updatedRule } = await resolveThresholdRule(req, id)
  res.json({ threshold_promotion: { promotion: updated, threshold_rule: updatedRule } })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { rule } = await resolveThresholdRule(req, id)

  await deleteThresholdPromotionWorkflow(req.scope).run({
    input: { promotionId: id, thresholdRuleId: rule.id },
  })

  res.json({ id, object: "threshold_promotion", deleted: true })
}
