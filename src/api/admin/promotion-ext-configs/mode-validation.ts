import { MedusaError } from "@medusajs/framework/utils"

export async function validatePromotionModeCompatibility(
  query: { graph: (config: any) => Promise<any> },
  promotionId: string,
  promotionMode: string
) {
  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "application_method.type", "application_method.target_type"],
    filters: { id: promotionId },
  })

  const promotion = promotions[0]
  if (!promotion) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion "${promotionId}" not found`
    )
  }

  const am = (promotion as any).application_method
  if (!am) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Promotion "${promotionId}" has no application method configured`
    )
  }

  if (am.target_type !== "items") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${promotionMode === "bundle" ? "Bundle" : "Buy-Get Repeat"} mode requires a product-level promotion type (Amount off products or Percentage off product). Current promotion targets "${am.target_type}", not individual items.`
    )
  }

  if (promotionMode === "bundle" && am.type !== "fixed") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Bundle mode requires the promotion type "Amount off products" (fixed). Current promotion type is "${am.type}".`
    )
  }
}
