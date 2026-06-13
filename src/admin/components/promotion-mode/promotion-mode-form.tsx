import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { Button, Drawer, Input, Label, RadioGroup, Text, toast } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useUpdatePromotionExtConfig } from "../../hooks/promotion-ext-config/use-update-promotion-ext-config"
import { PROMOTION_EXT_CONFIG_QUERY_KEY } from "../../hooks/promotion-ext-config/use-promotion-ext-config"
import { ModeConfig, PromotionMode } from "../../lib/types"

type ApplicationMethod = {
  type?: string
  value?: number
  target_type?: string
  max_quantity?: number | null
  currency_code?: string
}

type FormValues = {
  promotion_mode: PromotionMode
  bundle_size?: number | null
  buy_quantity?: number | null
  get_quantity?: number | null
}

function buildModeConfig(values: FormValues): ModeConfig {
  if (values.promotion_mode === "bundle") {
    return {
      bundle_size: values.bundle_size!,
      bundle_price: 0,
      remainder: "full_price" as const,
    }
  }
  if (values.promotion_mode === "buyget_repeat") {
    return {
      buy_quantity: values.buy_quantity!,
      get_quantity: values.get_quantity!,
      discount_type: "percentage" as const,
      discount_value: 0,
      discount_target: "cheapest" as const,
      remainder: "full_price" as const,
    }
  }
  return null
}

function extractFormValues(mode: PromotionMode, config: ModeConfig): FormValues {
  const base: FormValues = { promotion_mode: mode }
  if (mode === "bundle" && config) {
    const c = config as { bundle_size: number }
    base.bundle_size = c.bundle_size
  }
  if (mode === "buyget_repeat" && config) {
    const c = config as { buy_quantity: number; get_quantity: number }
    base.buy_quantity = c.buy_quantity
    base.get_quantity = c.get_quantity
  }
  return base
}

function validateModeCompatibility(mode: PromotionMode, values: FormValues, am?: ApplicationMethod): string | null {
  if (mode === "standard") return null

  if (!am) return "Promotion has no application method configured."

  if (am.target_type !== "items") {
    return `${mode === "bundle" ? "Bundle" : "Buy-Get Repeat"} mode requires a product-level promotion type (Amount off products or Percentage off product). Current promotion targets the order, not individual items.`
  }

  if (mode === "bundle" && am.type !== "fixed") {
    return "Bundle mode requires the promotion type 'Amount off products' (Fixed). A percentage type cannot represent a bundle target price."
  }

  const maxQty = am.max_quantity
  if (maxQty != null && maxQty > 0) {
    if (mode === "bundle" && values.bundle_size && maxQty < values.bundle_size) {
      return `The promotion's Maximum Quantity (${maxQty}) is less than the bundle size (${values.bundle_size}). No complete bundles can form. Set max_quantity to at least ${values.bundle_size}, or leave it unset for unlimited.`
    }
    if (mode === "buyget_repeat" && values.buy_quantity && maxQty < values.buy_quantity) {
      return `The promotion's Maximum Quantity (${maxQty}) is less than the buy quantity (${values.buy_quantity}). No buy-get cycles can form. Set max_quantity to at least ${values.buy_quantity}, or leave it unset for unlimited.`
    }
  }

  return null
}

export function PromotionModeForm({
  configId,
  promotionId,
  currentMode,
  currentModeConfig,
  applicationMethod,
  onClose,
  isDirtyRef,
}: {
  configId: string
  promotionId: string
  currentMode: PromotionMode
  currentModeConfig: ModeConfig
  applicationMethod?: ApplicationMethod
  onClose: () => void
  isDirtyRef: React.MutableRefObject<boolean>
}) {
  const queryClient = useQueryClient()
  const { mutateAsync, isPending } = useUpdatePromotionExtConfig()

  const {
    control,
    handleSubmit,
    watch,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: extractFormValues(currentMode, currentModeConfig),
  })

  const selectedMode = watch("promotion_mode")

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty, isDirtyRef])

  const onSubmit = async (values: FormValues) => {
    const validationError = validateModeCompatibility(values.promotion_mode, values, applicationMethod)
    if (validationError) {
      toast.error(validationError)
      return
    }

    const modeConfig = buildModeConfig(values)
    try {
      await mutateAsync({
        id: configId,
        promotion_mode: values.promotion_mode,
        mode_config: modeConfig,
      })
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? "Failed to update promotion mode"
      toast.error(message)
      return
    }
    queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_CONFIG_QUERY_KEY, promotionId] })
    toast.success("Promotion mode updated")
    isDirtyRef.current = false
    onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
      <Drawer.Header>
        <Drawer.Title>Edit Promotion Mode</Drawer.Title>
      </Drawer.Header>

      <Drawer.Body className="flex flex-1 flex-col gap-y-8 overflow-y-auto">
        <div className="flex flex-col gap-y-8">
          {/* Promotion Mode Selection */}
          <div>
            <Label className="mb-3">Promotion Mode</Label>
            <Controller
              name="promotion_mode"
              control={control}
              render={({ field: { onChange, value, ...field } }) => (
                <RadioGroup
                  className="flex-col gap-y-3"
                  {...field}
                  value={value}
                  onValueChange={onChange}
                >
                  <RadioGroup.ChoiceBox
                    value="standard"
                    label="Standard"
                    description="Medusa handles the discount calculation natively."
                  />
                  <RadioGroup.ChoiceBox
                    value="bundle"
                    label="Bundle Pricing"
                    description="Set a fixed price for a group of items. Repeats for every qualifying group."
                  />
                  <RadioGroup.ChoiceBox
                    value="buyget_repeat"
                    label="Buy-Get Repeat"
                    description="Buy X items, get Y items discounted. Repeats for every qualifying group."
                  />
                </RadioGroup>
              )}
            />
          </div>

          {/* Bundle Fields */}
          {selectedMode === "bundle" && (
            <div>
              <Label className="mb-1.5">Bundle Size</Label>
              <Controller
                name="bundle_size"
                control={control}
                rules={{ required: true, min: 1 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    placeholder="3"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                )}
              />
              <Text size="small" className="text-ui-fg-muted mt-1">
                Number of items that form one bundle.
              </Text>
            </div>
          )}

          {/* Buy-Get Repeat Fields */}
          {selectedMode === "buyget_repeat" && (
            <>
              <div>
                <Label className="mb-1.5">Buy Quantity</Label>
                <Controller
                  name="buy_quantity"
                  control={control}
                  rules={{ required: true, min: 1 }}
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={1}
                      placeholder="2"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                    />
                  )}
                />
                <Text size="small" className="text-ui-fg-muted mt-1">
                  Number of items the customer pays full price for.
                </Text>
              </div>
              <div>
                <Label className="mb-1.5">Get Quantity</Label>
                <Controller
                  name="get_quantity"
                  control={control}
                  rules={{ required: true, min: 1 }}
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={1}
                      placeholder="1"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                    />
                  )}
                />
                <Text size="small" className="text-ui-fg-muted mt-1">
                  Number of items that receive the discount in each group.
                </Text>
              </div>
            </>
          )}
        </div>
      </Drawer.Body>

      <Drawer.Footer>
        <Drawer.Close asChild>
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Drawer.Close>
        <Button type="submit" isLoading={isPending}>
          Save
        </Button>
      </Drawer.Footer>
    </form>
  )
}
