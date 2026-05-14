import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { deletePromotionsWorkflow } from "@medusajs/core-flows"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

async function cleanupPromotionExt(
  service: PromotionExtModuleService,
  promotionId: string
): Promise<void> {
  const [config] = await service.listPromotionExtConfigs(
    { promotion_id: promotionId },
    { take: 1 }
  )
  if (!config) return

  const groups = await service.listPromotionExtRuleGroups({
    promotion_config_id: config.id,
  })

  if (groups.length > 0) {
    const rules = await service.listPromotionExtRules({
      rule_group_id: groups.map((g) => g.id),
    })
    if (rules.length > 0) {
      await service.softDeletePromotionExtRules(rules.map((r) => r.id))
    }
    await service.softDeletePromotionExtRuleGroups(groups.map((g) => g.id))
  }

  await service.softDeletePromotionExtConfigs([config.id])
}

// Primary mechanism: workflow hook fires synchronously after deletePromotionsStep commits
deletePromotionsWorkflow.hooks.promotionsDeleted(
  async ({ ids }, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await Promise.all(ids.map((id) => cleanupPromotionExt(service, id)))
  }
)

// Fallback: event subscriber in case promotion.deleted is emitted by the event bus
export default async function promotionDeletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  await cleanupPromotionExt(service, data.id)
}

export const config: SubscriberConfig = {
  event: "promotion.deleted",
}
