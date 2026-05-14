import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps } from "@medusajs/types"
import { Badge, Container, DropdownMenu, Heading, IconButton, Text } from "@medusajs/ui"
import { EllipsisHorizontal, PencilSquare } from "@medusajs/icons"
import { useNavigate } from "react-router-dom"
import { usePromotionExtConfig } from "../hooks"
import { renderRulesDisplay } from "./rule-display"

type AdminPromotion = { id: string }

const PromotionRulesWidget = ({ data }: DetailWidgetProps<AdminPromotion>) => {
  const navigate = useNavigate()

  const { config, isLoading } = usePromotionExtConfig(data.id)
  const ruleGroups = config?.rule_groups ?? []
  const rules = ruleGroups.flatMap((g) => g.rules ?? [])

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Promotion Rules Config</Heading>
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <IconButton variant="transparent">
              <EllipsisHorizontal />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item
              className="gap-x-2"
              onClick={() => navigate(`/promotions/${data.id}/edit-rules`)}
            >
              <PencilSquare className="text-ui-fg-subtle" />
              Edit
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <div className="px-6 py-4 flex items-center gap-x-3">
        <Text size="small" weight="plus" className="text-ui-fg-subtle">
          Auto-apply
        </Text>
        {isLoading ? (
          <Badge color="grey">Loading...</Badge>
        ) : config ? (
          <Badge color={config.auto_apply ? "green" : "grey"}>
            {config.auto_apply ? "ON" : "OFF"}
          </Badge>
        ) : (
          <Badge color="grey">Not configured</Badge>
        )}
      </div>

      {!isLoading && config && (
        <div className="px-6 py-4">
          {renderRulesDisplay(config, ruleGroups, rules)}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.details.after",
})

export default PromotionRulesWidget
