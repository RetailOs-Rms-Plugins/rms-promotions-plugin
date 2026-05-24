import { Badge, Text } from "@medusajs/ui"
import { BundleModeConfig, BuyGetRepeatModeConfig, ModeConfig, PromotionMode } from "../../lib/types"

const MODE_LABELS: Record<PromotionMode, string> = {
  standard: "Standard",
  bundle: "Bundle Pricing",
  buyget_repeat: "Buy-Get Repeat",
}

function formatCurrency(amount: number): string {
  return (amount / 100).toFixed(2)
}

function BundleDisplay({ config }: { config: BundleModeConfig }) {
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Bundle Size</Text>
        <Badge size="2xsmall">{config.bundle_size} items</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Bundle Price</Text>
        <Badge size="2xsmall">{formatCurrency(config.bundle_price)}</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Remainder</Text>
        <Badge size="2xsmall">Full Price</Badge>
      </div>
    </div>
  )
}

function BuyGetRepeatDisplay({ config }: { config: BuyGetRepeatModeConfig }) {
  const discountLabel =
    config.discount_type === "percentage"
      ? `${config.discount_value}%`
      : formatCurrency(config.discount_value)

  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Buy</Text>
        <Badge size="2xsmall">{config.buy_quantity} items</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Get</Text>
        <Badge size="2xsmall">{config.get_quantity} items</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Discount</Text>
        <Badge size="2xsmall">{discountLabel} {config.discount_type === "percentage" ? "off" : "off (fixed)"}</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Applies to</Text>
        <Badge size="2xsmall">Cheapest item</Badge>
      </div>
      <div className="flex items-center gap-x-2">
        <Text size="small" className="text-ui-fg-subtle">Remainder</Text>
        <Badge size="2xsmall">Full Price</Badge>
      </div>
    </div>
  )
}

export function PromotionModeDisplay({
  mode,
  modeConfig,
}: {
  mode: PromotionMode
  modeConfig: ModeConfig
}) {
  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-x-2">
        <Text size="small" weight="plus" className="text-ui-fg-subtle">
          Promotion Mode
        </Text>
        <Badge color={mode === "standard" ? "grey" : "blue"} size="2xsmall">
          {MODE_LABELS[mode]}
        </Badge>
      </div>

      {mode === "bundle" && modeConfig && (
        <BundleDisplay config={modeConfig as BundleModeConfig} />
      )}

      {mode === "buyget_repeat" && modeConfig && (
        <BuyGetRepeatDisplay config={modeConfig as BuyGetRepeatModeConfig} />
      )}

      {mode === "standard" && (
        <Text size="small" className="text-ui-fg-muted">
          Medusa handles discount calculation natively.
        </Text>
      )}
    </div>
  )
}
