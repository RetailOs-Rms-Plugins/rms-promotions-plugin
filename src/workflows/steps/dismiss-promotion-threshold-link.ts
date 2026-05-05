import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { THRESHOLD_PROMOTION_MODULE } from "../../modules/threshold-promotion"

type Input = { promotionId: string; thresholdRuleId: string }

export const dismissPromotionThresholdLinkStep = createStep(
  "dismiss-promotion-threshold-link",
  async ({ promotionId, thresholdRuleId }: Input, { container }) => {
    const remoteLink = container.resolve("remoteLink")

    await remoteLink.dismiss({
      [Modules.PROMOTION]: { promotion_id: promotionId },
      [THRESHOLD_PROMOTION_MODULE]: { threshold_rule_id: thresholdRuleId },
    })

    return new StepResponse(void 0)
  }
)
