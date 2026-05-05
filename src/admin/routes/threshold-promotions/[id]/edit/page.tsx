import { Button, Container, Heading, Input, Label, Select, Switch, Text } from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../../lib/sdk"
import { ThresholdPromotion } from "../../../../lib/types"

type DetailResponse = { threshold_promotion: ThresholdPromotion }

const EditThresholdPromotionPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["threshold-promotions", "detail", id],
    queryFn: () =>
      sdk.client.fetch<DetailResponse>(`/admin/threshold-promotions/${id}`, {
        method: "GET",
      }),
    enabled: !!id,
  })

  const tp = data?.threshold_promotion
  const method = tp?.promotion?.application_method

  const [minCartSubtotal, setMinCartSubtotal] = useState("")
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed")
  const [discountValue, setDiscountValue] = useState("")
  const [currencyCode, setCurrencyCode] = useState("")
  const [isAutomatic, setIsAutomatic] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tp) return
    setMinCartSubtotal(String(tp.threshold_rule.min_cart_subtotal))
    setDiscountType((method?.type as "fixed" | "percentage") ?? "fixed")
    setDiscountValue(String(method?.value ?? ""))
    setCurrencyCode(method?.currency_code ?? "")
    setIsAutomatic(tp.promotion.is_automatic)
  }, [tp])

  const updateMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/threshold-promotions/${id}`, {
        method: "POST",
        body: {
          min_cart_subtotal: Number(minCartSubtotal),
          discount_type: discountType,
          discount_value: Number(discountValue),
          currency_code: currencyCode.trim().toUpperCase(),
          is_automatic: isAutomatic,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threshold-promotions"] })
      navigate("../..")
    },
    onError: (err: any) => {
      setError(err?.message ?? "Failed to update promotion")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    updateMutation.mutate()
  }

  if (isLoading) {
    return (
      <Container className="p-6">
        <Text>Loading...</Text>
      </Container>
    )
  }

  if (!tp) {
    return (
      <Container className="p-6">
        <Text className="text-ui-fg-error">Promotion not found.</Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Edit — {tp.promotion.code}</Heading>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-4">
        {error && <Text className="text-ui-fg-error">{error}</Text>}

        <div className="flex flex-col gap-1">
          <Label htmlFor="min_cart_subtotal">Minimum Cart Subtotal</Label>
          <Input
            id="min_cart_subtotal"
            type="number"
            min={0.01}
            step="0.01"
            value={minCartSubtotal}
            onChange={(e) => setMinCartSubtotal(e.target.value)}
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
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="currency_code">Currency Code</Label>
          <Input
            id="currency_code"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
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
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("../..")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Container>
  )
}

export default EditThresholdPromotionPage
