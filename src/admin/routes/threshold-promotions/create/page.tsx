import { Button, Container, Heading, Input, Label, Select, Switch, Text } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

const CreateThresholdPromotionPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [code, setCode] = useState("")
  const [minCartSubtotal, setMinCartSubtotal] = useState("")
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed")
  const [discountValue, setDiscountValue] = useState("")
  const [currencyCode, setCurrencyCode] = useState("ILS")
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/threshold-promotions", {
        method: "POST",
        body: {
          code: code.trim().toUpperCase(),
          min_cart_subtotal: Number(minCartSubtotal),
          discount_type: discountType,
          discount_value: Number(discountValue),
          currency_code: currencyCode.trim().toUpperCase(),
          is_automatic: isAutomatic,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threshold-promotions"] })
      navigate("..")
    },
    onError: (err: any) => {
      setError(err?.message ?? "Failed to create promotion")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    createMutation.mutate()
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Create Threshold Promotion</Heading>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-4">
        {error && (
          <Text className="text-ui-fg-error">{error}</Text>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="code">Promotion Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="OVER100"
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="min_cart_subtotal">Minimum Cart Subtotal</Label>
          <Input
            id="min_cart_subtotal"
            type="number"
            min={0.01}
            step="0.01"
            value={minCartSubtotal}
            onChange={(e) => setMinCartSubtotal(e.target.value)}
            placeholder="100"
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="discount_type">Discount Type</Label>
          <Select
            value={discountType}
            onValueChange={(v) => setDiscountType(v as "fixed" | "percentage")}
          >
            <Select.Trigger id="discount_type">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="fixed">Fixed</Select.Item>
              <Select.Item value="percentage">Percentage</Select.Item>
            </Select.Content>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="discount_value">Discount Value</Label>
          <Input
            id="discount_value"
            type="number"
            min={0.01}
            step="0.01"
            max={discountType === "percentage" ? 100 : undefined}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountType === "percentage" ? "10" : "10.00"}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="currency_code">Currency Code</Label>
          <Input
            id="currency_code"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
            placeholder="ILS"
            maxLength={3}
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="is_automatic"
            checked={isAutomatic}
            onCheckedChange={setIsAutomatic}
          />
          <Label htmlFor="is_automatic">Apply Automatically</Label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" isLoading={createMutation.isPending}>
            Create
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("..")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Container>
  )
}

export default CreateThresholdPromotionPage
