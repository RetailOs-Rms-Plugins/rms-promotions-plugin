import { useRef, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps } from "@medusajs/types"
import { Badge, Container, Drawer, DropdownMenu, Heading, IconButton, Prompt, Text, Tooltip } from "@medusajs/ui"
import { EllipsisHorizontal, InformationCircle, PencilSquare } from "@medusajs/icons"
import { usePromotionExtConfig, useCreatePromotionExtConfig } from "../hooks"
import { renderRulesDisplay } from "./rule-display"
import { RulesEditorForm } from "../components/rules-editor/rules-editor-form"
import { PromotionModeDisplay } from "../components/promotion-mode/promotion-mode-display"
import { PromotionModeForm } from "../components/promotion-mode/promotion-mode-form"

type AdminPromotion = {
  id: string
  application_method?: {
    type?: string
    value?: number
    target_type?: string
    max_quantity?: number | null
    currency_code?: string
  }
}

const EmptyRules = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center gap-y-2 py-8 text-center">
    <InformationCircle className="text-ui-fg-muted" />
    <Text size="small" weight="plus" className="text-ui-fg-subtle">
      No rules
    </Text>
    <Text size="small" className="text-ui-fg-muted max-w-xs">
      Add rules to control when this promotion is applied.
    </Text>
    <button
      onClick={onAdd}
      className="text-ui-fg-interactive text-small-plus mt-1 flex items-center gap-x-1 hover:opacity-80"
    >
      + Add rules
    </button>
  </div>
)

const PromotionRulesWidget = ({ data }: DetailWidgetProps<AdminPromotion>) => {
  const [open, setOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const isDirtyRef = useRef(false)

  const [modeOpen, setModeOpen] = useState(false)
  const [modeConfirmClose, setModeConfirmClose] = useState(false)
  const modeDirtyRef = useRef(false)

  const { config, isLoading } = usePromotionExtConfig(data.id)
  const { mutateAsync: createConfig, isPending: isCreatingConfig } = useCreatePromotionExtConfig()
  const ruleGroups = config?.rule_groups ?? []
  const rules = ruleGroups.flatMap((g) => g.rules ?? [])

  const hasRules = rules.length > 0

  const handleModeEditClick = async () => {
    if (!config && !isCreatingConfig) {
      await createConfig({ promotion_id: data.id })
    }
    setModeOpen(true)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isDirtyRef.current) {
      setConfirmClose(true)
      return
    }
    setOpen(next)
  }

  const handleConfirmedClose = () => {
    setConfirmClose(false)
    setOpen(false)
  }

  const handleModeOpenChange = (next: boolean) => {
    if (!next && modeDirtyRef.current) {
      setModeConfirmClose(true)
      return
    }
    setModeOpen(next)
  }

  const handleModeConfirmedClose = () => {
    setModeConfirmClose(false)
    setModeOpen(false)
  }

  return (
    <>
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">When will this promotion be applied?</Heading>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton variant="transparent">
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  className="gap-x-2"
                  onClick={() => setOpen(true)}
                >
                  <PencilSquare className="text-ui-fg-subtle" />
                  Edit
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>

          {!isLoading && !config && (
            <EmptyRules onAdd={() => setOpen(true)} />
          )}

          {!isLoading && config && !hasRules && (
            <>
              <div className="px-6 py-4 flex items-center gap-x-3">
                <div className="flex items-center gap-x-1">
                  <Text size="small" weight="plus" className="text-ui-fg-subtle">
                    Auto Apply
                  </Text>
                  <Tooltip content="When ON, this promotion is applied automatically when all rules pass. When OFF, customers must enter a promo code.">
                    <InformationCircle className="text-ui-fg-muted cursor-default" />
                  </Tooltip>
                </div>
                <Badge color={config.auto_apply ? "green" : "grey"}>
                  {config.auto_apply ? "ON" : "OFF"}
                </Badge>
              </div>
              <EmptyRules onAdd={() => setOpen(true)} />
            </>
          )}

          {!isLoading && config && hasRules && (
            <>
              <div className="px-6 py-4 flex items-center gap-x-3">
                <div className="flex items-center gap-x-1">
                  <Text size="small" weight="plus" className="text-ui-fg-subtle">
                    Auto Apply
                  </Text>
                  <Tooltip content="When ON, this promotion is applied automatically when all rules pass. When OFF, customers must enter a promo code.">
                    <InformationCircle className="text-ui-fg-muted cursor-default" />
                  </Tooltip>
                </div>
                <Badge color={config.auto_apply ? "green" : "grey"}>
                  {config.auto_apply ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="px-6 py-4">
                {renderRulesDisplay(config, ruleGroups, rules)}
              </div>
            </>
          )}
        </Container>

        <Drawer.Content>
          {open && (
            <RulesEditorForm
              promotionId={data.id}
              onClose={() => setOpen(false)}
              isDirtyRef={isDirtyRef}
            />
          )}
        </Drawer.Content>
      </Drawer>

      <Prompt open={confirmClose} variant="confirmation" onOpenChange={setConfirmClose}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Unsaved changes</Prompt.Title>
            <Prompt.Description>
              You have unsaved changes. Are you sure you want to discard them?
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel onClick={() => setConfirmClose(false)}>
              Cancel
            </Prompt.Cancel>
            <Prompt.Action onClick={handleConfirmedClose}>
              Discard
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>

      {/* Promotion Mode Section */}
      <Drawer open={modeOpen} onOpenChange={handleModeOpenChange}>
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">How is the discount applied?</Heading>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton variant="transparent">
                  <EllipsisHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  className="gap-x-2"
                  onClick={handleModeEditClick}
                >
                  <PencilSquare className="text-ui-fg-subtle" />
                  Edit
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>

          {!isLoading && (
            <PromotionModeDisplay
              mode={config?.promotion_mode ?? "standard"}
              modeConfig={config?.mode_config ?? null}
              applicationMethod={data.application_method}
            />
          )}
        </Container>

        <Drawer.Content>
          {modeOpen && config && (
            <PromotionModeForm
              configId={config.id}
              promotionId={data.id}
              currentMode={config.promotion_mode ?? "standard"}
              currentModeConfig={config.mode_config ?? null}
              applicationMethod={data.application_method}
              onClose={() => setModeOpen(false)}
              isDirtyRef={modeDirtyRef}
            />
          )}
        </Drawer.Content>
      </Drawer>

      <Prompt open={modeConfirmClose} variant="confirmation" onOpenChange={setModeConfirmClose}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Unsaved changes</Prompt.Title>
            <Prompt.Description>
              You have unsaved changes. Are you sure you want to discard them?
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel onClick={() => setModeConfirmClose(false)}>
              Cancel
            </Prompt.Cancel>
            <Prompt.Action onClick={handleModeConfirmedClose}>
              Discard
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.details.after",
})

export default PromotionRulesWidget
