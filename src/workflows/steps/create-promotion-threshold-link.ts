import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { THRESHOLD_PROMOTION_MODULE } from "../../modules/threshold-promotion"

type Input = { promotionId: string; thresholdRuleId: string }

export const createPromotionThresholdLinkStep = createStep(
  "create-promotion-threshold-link",
  async ({ promotionId, thresholdRuleId }: Input, { container }) => {
    const remoteLink = container.resolve("remoteLink")

    await remoteLink.create({
      [Modules.PROMOTION]: { promotion_id: promotionId },
      [THRESHOLD_PROMOTION_MODULE]: { threshold_rule_id: thresholdRuleId },
    })

    return new StepResponse({ promotionId, thresholdRuleId })
  },
  async (input: Input | undefined, { container }) => {
    if (!input) return
    const remoteLink = container.resolve("remoteLink")
    await remoteLink.dismiss({
      [Modules.PROMOTION]: { promotion_id: input.promotionId },
      [THRESHOLD_PROMOTION_MODULE]: { threshold_rule_id: input.thresholdRuleId },
    })
  }
)
