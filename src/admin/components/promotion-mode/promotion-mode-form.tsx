import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { Button, Drawer, Input, Label, Select, toast } from "@medusajs/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useUpdatePromotionExtConfig } from "../../hooks/promotion-ext-config/use-update-promotion-ext-config"
import { PROMOTION_EXT_CONFIG_QUERY_KEY } from "../../hooks/promotion-ext-config/use-promotion-ext-config"
import { ModeConfig, PromotionMode } from "../../lib/types"

type FormValues = {
  promotion_mode: PromotionMode
  bundle_size?: number
  bundle_price?: number
  buy_quantity?: number
  get_quantity?: number
  discount_type?: "percentage" | "fixed"
  discount_value?: number
}

function buildModeConfig(values: FormValues): ModeConfig {
  if (values.promotion_mode === "bundle") {
    return {
      bundle_size: values.bundle_size!,
      bundle_price: values.bundle_price!,
      remainder: "full_price" as const,
    }
  }
  if (values.promotion_mode === "buyget_repeat") {
    return {
      buy_quantity: values.buy_quantity!,
      get_quantity: values.get_quantity!,
      discount_type: values.discount_type!,
      discount_value: values.discount_value!,
      discount_target: "cheapest" as const,
      remainder: "full_price" as const,
    }
  }
  return null
}

function extractFormValues(mode: PromotionMode, config: ModeConfig): FormValues {
  const base: FormValues = { promotion_mode: mode }
  if (mode === "bundle" && config) {
    const c = config as { bundle_size: number; bundle_price: number }
    base.bundle_size = c.bundle_size
    base.bundle_price = c.bundle_price
  }
  if (mode === "buyget_repeat" && config) {
    const c = config as {
      buy_quantity: number
      get_quantity: number
      discount_type: "percentage" | "fixed"
      discount_value: number
    }
    base.buy_quantity = c.buy_quantity
    base.get_quantity = c.get_quantity
    base.discount_type = c.discount_type
    base.discount_value = c.discount_value
  }
  return base
}

export function PromotionModeForm({
  configId,
  promotionId,
  currentMode,
  currentModeConfig,
  onClose,
  isDirtyRef,
}: {
  configId: string
  promotionId: string
  currentMode: PromotionMode
  currentModeConfig: ModeConfig
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
    const modeConfig = buildModeConfig(values)
    await mutateAsync({
      id: configId,
      promotion_mode: values.promotion_mode,
      mode_config: modeConfig,
    })
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

      <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
        <div>
          <Label htmlFor="promotion_mode">Promotion Mode</Label>
          <Controller
            name="promotion_mode"
            control={control}
            render={({ field: { onChange, value } }) => (
              <Select value={value} onValueChange={onChange}>
                <Select.Trigger>
                  <Select.Value placeholder="Select mode" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="standard">Standard</Select.Item>
                  <Select.Item value="bundle">Bundle Pricing</Select.Item>
                  <Select.Item value="buyget_repeat">Buy-Get Repeat</Select.Item>
                </Select.Content>
              </Select>
            )}
          />
        </div>

        {selectedMode === "bundle" && (
          <>
            <div>
              <Label htmlFor="bundle_size">Bundle Size (items per bundle)</Label>
              <Controller
                name="bundle_size"
                control={control}
                rules={{ required: true, min: 2 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={2}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
            <div>
              <Label htmlFor="bundle_price">Bundle Price (smallest currency unit)</Label>
              <Controller
                name="bundle_price"
                control={control}
                rules={{ required: true, min: 0 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={0}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
          </>
        )}

        {selectedMode === "buyget_repeat" && (
          <>
            <div>
              <Label htmlFor="buy_quantity">Buy Quantity</Label>
              <Controller
                name="buy_quantity"
                control={control}
                rules={{ required: true, min: 1 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
            <div>
              <Label htmlFor="get_quantity">Get Quantity</Label>
              <Controller
                name="get_quantity"
                control={control}
                rules={{ required: true, min: 1 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
            <div>
              <Label htmlFor="discount_type">Discount Type</Label>
              <Controller
                name="discount_type"
                control={control}
                rules={{ required: true }}
                render={({ field: { onChange, value } }) => (
                  <Select value={value ?? "percentage"} onValueChange={onChange}>
                    <Select.Trigger>
                      <Select.Value placeholder="Select type" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="percentage">Percentage</Select.Item>
                      <Select.Item value="fixed">Fixed Amount</Select.Item>
                    </Select.Content>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="discount_value">
                Discount Value {watch("discount_type") === "percentage" ? "(%)" : "(smallest currency unit)"}
              </Label>
              <Controller
                name="discount_value"
                control={control}
                rules={{ required: true, min: 0 }}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={0}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
          </>
        )}

        {selectedMode === "standard" && (
          <div className="text-ui-fg-muted text-small py-4">
            Standard mode uses Medusa's native discount calculation. No additional configuration needed.
          </div>
        )}
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
