import { useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import {
  Container,
  CurrencyInput,
  Divider,
  DropdownMenu,
  FocusModal,
  Heading,
  IconButton,
  Input,
  Label,
  Text,
  Button,
  toast,
} from "@medusajs/ui"
import { EllipsisHorizontal, Plus } from "@medusajs/icons"
import { useNavigate } from "react-router-dom"
import { sdk } from "../lib/sdk"
import { NumberInput } from "../components/inputs/number-input"

type OrderChangeResponse = {
  order_change: { id: string }
}

type OrderPreviewResponse = {
  order_preview: unknown
}

const PAID_STATUSES = [
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
]
const FULFILLED_STATUSES = [
  "fulfilled",
  "partially_fulfilled",
  "partially_shipped",
  "shipped",
  "partially_delivered",
  "delivered",
]

const getNativeSymbol = (currencyCode: string) => {
  const formatted = new Intl.NumberFormat([], {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
  }).format(0)

  return formatted.replace(/\d/g, "").replace(/[.,]/g, "").trim()
}

const OrderCustomItemsWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [title, setTitle] = useState("")
  const [unitPriceValue, setUnitPriceValue] = useState("")
  const [quantity, setQuantity] = useState(1)

  const navigate = useNavigate()

  const isPaid = PAID_STATUSES.includes(order.payment_status)
  const isFulfilled = FULFILLED_STATUSES.includes(order.fulfillment_status)
  const isDisabled = isPaid || isFulfilled

  const currencyCode = order.currency_code ?? "usd"

  const resetForm = () => {
    setTitle("")
    setUnitPriceValue("")
    setQuantity(1)
  }

  const ensureEditSession = async (): Promise<boolean> => {
    try {
      const { order_changes } = await sdk.client.fetch<{
        order_changes: { id: string; status: string }[]
      }>(`/admin/orders/${order.id}/changes`, { method: "GET" })

      const hasActive = order_changes?.some(
        (c) => c.status === "pending" || c.status === "requested"
      )

      if (hasActive) return true

      await sdk.client.fetch<OrderChangeResponse>("/admin/order-edits", {
        method: "POST",
        body: { order_id: order.id },
      })
      return true
    } catch (error: any) {
      toast.error(error?.message || "Failed to start edit session")
      return false
    }
  }

  const handleOpenModal = () => {
    setModalOpen(true)
  }

  const handleCloseModal = (open: boolean) => {
    if (open) return
    setModalOpen(false)
    resetForm()
  }

  const convertNumber = (value: string) => {
    const num = parseFloat(value)
    return isNaN(num) ? 0 : num
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    if (!unitPriceValue) {
      toast.error("Unit price is required")
      return
    }

    setSubmitting(true)
    try {
      const sessionReady = await ensureEditSession()
      if (!sessionReady) {
        setSubmitting(false)
        return
      }

      await sdk.client.fetch<OrderPreviewResponse>(
        `/admin/order-edits/${order.id}/custom-items`,
        {
          method: "POST",
          body: {
            title: title.trim(),
            unit_price: convertNumber(unitPriceValue),
            quantity,
          },
        }
      )

      toast.success("Custom item added to edit session")
      setModalOpen(false)
      resetForm()
      navigate(0)
    } catch (error: any) {
      toast.error(error?.message || "Failed to add custom item")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Custom Items</Heading>
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <IconButton
                size="small"
                variant="transparent"
                disabled={isDisabled}
              >
                <EllipsisHorizontal />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Item
                className="gap-x-2"
                disabled={isDisabled}
                onClick={handleOpenModal}
              >
                <Plus className="text-ui-fg-subtle" />
                Add custom item
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>

        {isDisabled && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-muted">
              Cannot add custom items to an order that has been{" "}
              {isPaid ? "paid" : "fulfilled"}.
            </Text>
          </div>
        )}
      </Container>

      <FocusModal open={modalOpen} onOpenChange={handleCloseModal}>
        <FocusModal.Content>
          <div className="flex h-full flex-col overflow-hidden">
            <FocusModal.Header />

            <FocusModal.Body className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1 flex-col items-center overflow-y-auto">
                <div className="flex w-full max-w-[720px] flex-col gap-y-6 px-2 py-16">
                  <div>
                    <Heading>Add custom item</Heading>
                    <Text size="small" className="text-ui-fg-subtle">
                      Add a custom item to the order. This will add a new line
                      item that is not associated with an existing product.
                    </Text>
                  </div>

                  <Divider variant="dashed" />

                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <Label size="small" weight="plus">
                        Title
                      </Label>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        Enter the title of the item
                      </Text>
                    </div>
                    <div>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>
                  </div>

                  <Divider variant="dashed" />

                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <Label size="small" weight="plus">
                        Unit price
                      </Label>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        Enter the unit price of the item
                      </Text>
                    </div>
                    <div>
                      <CurrencyInput
                        symbol={getNativeSymbol(currencyCode)}
                        code={currencyCode}
                        value={unitPriceValue}
                        onValueChange={(_value, _name, values) =>
                          setUnitPriceValue(values?.value ?? "")
                        }
                      />
                    </div>
                  </div>

                  <Divider variant="dashed" />

                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <Label size="small" weight="plus">
                        Quantity
                      </Label>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        Enter the quantity of the item
                      </Text>
                    </div>
                    <div className="w-full flex-1">
                      <div className="w-full flex-1">
                        <NumberInput
                          value={quantity}
                          onChange={setQuantity}
                          min={1}
                          max={9999}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FocusModal.Body>

            <FocusModal.Footer>
              <div className="flex items-center justify-end gap-x-2">
                <FocusModal.Close asChild>
                  <Button
                    size="small"
                    variant="secondary"
                    type="button"
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </FocusModal.Close>
                <Button
                  size="small"
                  type="button"
                  onClick={handleSubmit}
                  isLoading={submitting}
                >
                  Add item
                </Button>
              </div>
            </FocusModal.Footer>
          </div>
        </FocusModal.Content>
      </FocusModal>
    </>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details",
})

export default OrderCustomItemsWidget
