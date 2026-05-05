import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createThresholdPromotionWorkflow } from "../../../workflows/create-threshold-promotion"
import { CreateThresholdPromotionBody } from "./validators"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rules, metadata } = await query.graph({
    entity: "threshold_rule",
    fields: ["*", "promotion.*"],
    pagination: {
      skip: Number(req.query.offset ?? 0),
      take: Number(req.query.limit ?? 20),
    },
  })

  res.json({
    threshold_promotions: rules,
    count: metadata?.count ?? rules.length,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 20,
  })
}

export const POST = async (
  req: MedusaRequest<CreateThresholdPromotionBody>,
  res: MedusaResponse
) => {
  const body = req.validatedBody

  const { result } = await createThresholdPromotionWorkflow(req.scope).run({
    input: {
      code: body.code,
      minCartSubtotal: body.min_cart_subtotal,
      discountType: body.discount_type,
      discountValue: body.discount_value,
      currencyCode: body.currency_code,
      isAutomatic: body.is_automatic,
      campaignId: body.campaign_id,
    },
  })

  res.status(201).json({ threshold_promotion: result })
}
