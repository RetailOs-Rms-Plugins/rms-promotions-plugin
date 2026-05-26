import { Badge, Text, Tooltip } from "@medusajs/ui"
import { InformationCircle } from "@medusajs/icons"
import { BundleModeConfig, BuyGetRepeatModeConfig, ModeConfig, PromotionMode } from "../../lib/types"

type ApplicationMethod = {
  type?: string
  value?: number
  max_quantity?: number | null
}

const MODE_LABELS: Record<PromotionMode, string> = {
  standard: "Standard",
  bundle: "Bundle Pricing",
  buyget_repeat: "Buy-Get Repeat",
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
      <Text size="small" weight="plus" leading="compact">{label}</Text>
      <Text size="small" leading="compact">{children}</Text>
    </div>
  )
}

function ReadOnlyRow({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  return (
    <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
      <div className="flex items-center gap-x-1">
        <Text size="small" weight="plus" leading="compact">{label}</Text>
        <Tooltip content={tooltip}>
          <InformationCircle className="text-ui-fg-muted cursor-default" />
        </Tooltip>
      </div>
      <Text size="small" leading="compact" className="text-ui-fg-muted">{children}</Text>
    </div>
  )
}

function CurrencyValue({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-x-2">
      {amount}€
      <Badge size="2xsmall" className="w-fit">EUR</Badge>
    </span>
  )
}

function BundleDisplay({ config, applicationMethod }: { config: BundleModeConfig; applicationMethod?: ApplicationMethod }) {
  return (
    <>
      <Row label="Bundle Size">{config.bundle_size} items</Row>
      <ReadOnlyRow label="Bundle Price" tooltip="This value comes from the promotion's Amount field.">
        {applicationMethod?.value != null ? (
          <CurrencyValue amount={applicationMethod.value} />
        ) : config.bundle_price != null ? (
          <CurrencyValue amount={config.bundle_price} />
        ) : (
          "-"
        )}
      </ReadOnlyRow>
      <ReadOnlyRow label="Type" tooltip="Bundle promotions must use the 'Amount off products' type (Fixed).">
        {applicationMethod?.type === "percentage" ? "Percentage" : "Fixed"}
      </ReadOnlyRow>
      <ReadOnlyRow label="Max Items" tooltip="Maximum number of items that can participate in bundles. Only complete bundles form — partial groups are ignored. This value comes from the promotion's Maximum Quantity field.">
        {applicationMethod?.max_quantity != null ? applicationMethod.max_quantity : "-"}
      </ReadOnlyRow>
      <Row label="Remainder">Full Price</Row>
    </>
  )
}

function BuyGetRepeatDisplay({ config, applicationMethod }: { config: BuyGetRepeatModeConfig; applicationMethod?: ApplicationMethod }) {
  return (
    <>
      <Row label="Buy">{config.buy_quantity} items</Row>
      <Row label="Get">{config.get_quantity} items</Row>
      <ReadOnlyRow label="Discount Type" tooltip="This value comes from the promotion's Type field.">
        {(applicationMethod?.type ?? config.discount_type) === "percentage" ? "Percentage" : "Fixed"}
      </ReadOnlyRow>
      <ReadOnlyRow label="Discount Value" tooltip="This value comes from the promotion's Amount field.">
        {(applicationMethod?.value ?? config.discount_value) != null ? (
          (applicationMethod?.type ?? config.discount_type) === "percentage"
            ? `${applicationMethod?.value ?? config.discount_value}%`
            : <CurrencyValue amount={(applicationMethod?.value ?? config.discount_value)!} />
        ) : (
          "-"
        )}
      </ReadOnlyRow>
      <ReadOnlyRow label="Max Buy Items" tooltip="Maximum number of 'buy' items. Controls how many buy-get cycles can apply (cycles = max_quantity / buy_quantity). Note: this counts buy items, not discounted items. This value comes from the promotion's Maximum Quantity field.">
        {applicationMethod?.max_quantity != null ? applicationMethod.max_quantity : "-"}
      </ReadOnlyRow>
      <Row label="Applies to">Cheapest item</Row>
      <Row label="Remainder">Full Price</Row>
    </>
  )
}

export function PromotionModeDisplay({
  mode,
  modeConfig,
  applicationMethod,
}: {
  mode: PromotionMode
  modeConfig: ModeConfig
  applicationMethod?: ApplicationMethod
}) {
  return (
    <>
      <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" weight="plus" leading="compact">Promotion Mode</Text>
        <Badge color={mode === "standard" ? "grey" : "blue"} size="2xsmall" className="w-fit">
          {MODE_LABELS[mode]}
        </Badge>
      </div>

      {mode === "bundle" && modeConfig && (
        <BundleDisplay config={modeConfig as BundleModeConfig} applicationMethod={applicationMethod} />
      )}

      {mode === "buyget_repeat" && modeConfig && (
        <BuyGetRepeatDisplay config={modeConfig as BuyGetRepeatModeConfig} applicationMethod={applicationMethod} />
      )}

      {mode === "standard" && (
        <Row label="Calculation">Medusa native</Row>
      )}
    </>
  )
}
