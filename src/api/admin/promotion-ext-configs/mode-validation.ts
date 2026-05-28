import { MedusaError } from "@medusajs/framework/utils"

export async function validatePromotionModeCompatibility(
  query: { graph: (config: any) => Promise<any> },
  promotionId: string,
  promotionMode: string,
  modeConfig?: { bundle_size?: number; buy_quantity?: number } | null
) {
  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "application_method.type", "application_method.target_type", "application_method.value", "application_method.max_quantity"],
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

  if (promotionMode === "bundle" && am.value != null && am.value <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Bundle mode requires a positive bundle target price in the promotion's Amount field. Current value is ${am.value}.`
    )
  }

  const maxQty = am.max_quantity
  if (maxQty != null && maxQty > 0) {
    if (promotionMode === "bundle") {
      const bundleSize = modeConfig?.bundle_size
      if (bundleSize && maxQty < bundleSize) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `The promotion's Maximum Quantity (${maxQty}) is less than the bundle size (${bundleSize}). No complete bundles can form. Set max_quantity to at least ${bundleSize}, or leave it unset for unlimited.`
        )
      }
    }

    if (promotionMode === "buyget_repeat") {
      const buyQty = modeConfig?.buy_quantity
      if (buyQty && maxQty < buyQty) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `The promotion's Maximum Quantity (${maxQty}) is less than the buy quantity (${buyQty}). No buy-get cycles can form. Set max_quantity to at least ${buyQty}, or leave it unset for unlimited.`
        )
      }
    }
  }
}
