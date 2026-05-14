import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

export default async function promotionRestoredHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const [config] = await service.listPromotionExtConfigs(
    { promotion_id: data.id },
    { take: 1, withDeleted: true }
  )
  if (!config) return

  await service.restorePromotionExtConfigs([config.id])

  const groups = await service.listPromotionExtRuleGroups(
    { promotion_config_id: config.id },
    { withDeleted: true }
  )
  if (groups.length === 0) return

  await service.restorePromotionExtRuleGroups(groups.map((g) => g.id))

  const rules = await service.listPromotionExtRules(
    { rule_group_id: groups.map((g) => g.id) },
    { withDeleted: true }
  )
  if (rules.length > 0) {
    await service.restorePromotionExtRules(rules.map((r) => r.id))
  }
}

export const config: SubscriberConfig = {
  event: "promotion.restored",
}
