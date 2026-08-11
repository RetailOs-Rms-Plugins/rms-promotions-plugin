import { useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import {
  Container,
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
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"

type OrderChangeResponse = {
  order_change: { id: string }
}

type OrderPreviewResponse = {
  order_preview: unknown
}

const ORDER_CHANGE_QUERY_KEY = "order-change-active"

const OrderCustomItemsWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [modalOpen, setModalOpen] = useState(false)
  const [orderChangeId, setOrderChangeId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [title, setTitle] = useState("")
  const [unitPrice, setUnitPrice] = useState<string>("")
  const [quantity, setQuantity] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const isPaid = order.payment_status !== "not_paid"
  const isFulfilled = order.fulfillment_status !== "not_fulfilled"
  const isDisabledByStatus = isPaid || isFulfilled

  const { data: activeEditSession } = useQuery({
    queryKey: [ORDER_CHANGE_QUERY_KEY, order.id],
    queryFn: () =>
      sdk.client.fetch<{ order_changes: { id: string; status: string }[] }>(
        `/admin/orders/${order.id}/changes`,
        { method: "GET" }
      ),
  })

  const hasActiveEditSession =
    activeEditSession?.order_changes?.some(
      (c) => c.status === "pending" || c.status === "requested"
    ) ?? false

  const isDisabled = isDisabledByStatus || hasActiveEditSession

  const resetForm = () => {
    setTitle("")
    setUnitPrice("")
    setQuantity(1)
    setErrors({})
  }

  const cancelEditSession = async (changeId: string) => {
    try {
      await sdk.client.fetch(`/admin/order-edits/${order.id}`, {
        method: "DELETE",
      })
    } catch {
      // Best-effort cleanup
    }
  }

  const handleOpenModal = async () => {
    try {
      const response = await sdk.client.fetch<OrderChangeResponse>(
        "/admin/order-edits",
        {
          method: "POST",
          body: { order_id: order.id },
        }
      )
      setOrderChangeId(response.order_change.id)
      setModalOpen(true)
    } catch (error: any) {
      toast.error(error?.message || "Failed to start edit session")
    }
  }

  const handleCloseModal = async (open: boolean) => {
    if (open) return
    if (orderChangeId) {
      await cancelEditSession(orderChangeId)
      setOrderChangeId(null)
    }
    setModalOpen(false)
    resetForm()
  }

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = "Title is required"
    if (unitPrice === "") newErrors.unit_price = "Unit price is required"
    const parsedPrice = Number(unitPrice)
    if (unitPrice !== "" && isNaN(parsedPrice))
      newErrors.unit_price = "Must be a valid number"
    if (quantity < 1) newErrors.quantity = "Quantity must be at least 1"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    try {
      await sdk.client.fetch<OrderPreviewResponse>(
        `/admin/order-edits/${order.id}/custom-items`,
        {
          method: "POST",
          body: {
            title: title.trim(),
            unit_price: parsedPrice,
            quantity,
          },
        }
      )

      await sdk.client.fetch(`/admin/order-edits/${order.id}/request`, {
        method: "POST",
      })

      await sdk.client.fetch(`/admin/order-edits/${order.id}/confirm`, {
        method: "POST",
      })

      queryClient.invalidateQueries({ queryKey: ["order", order.id] })
      queryClient.invalidateQueries({
        queryKey: [ORDER_CHANGE_QUERY_KEY, order.id],
      })
      toast.success("Custom item added")
      setOrderChangeId(null)
      setModalOpen(false)
      resetForm()
    } catch (error: any) {
      toast.error(error?.message || "Failed to add custom item")
      if (orderChangeId) {
        await cancelEditSession(orderChangeId)
        setOrderChangeId(null)
      }
      setModalOpen(false)
      resetForm()
    } finally {
      setSubmitting(false)
    }
  }

  const currencyCode = order.currency_code?.toUpperCase() ?? ""

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

        {isDisabledByStatus && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-muted">
              Cannot add custom items to an order that has been{" "}
              {isPaid ? "paid" : "fulfilled"}.
            </Text>
          </div>
        )}

        {!isDisabledByStatus && hasActiveEditSession && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-muted">
              Close the current edit session before adding custom items.
            </Text>
          </div>
        )}
      </Container>

      <FocusModal open={modalOpen} onOpenChange={handleCloseModal}>
        <FocusModal.Content>
          <div className="flex h-full flex-col overflow-hidden">
            <FocusModal.Header>
              <div className="flex items-center justify-end gap-x-2">
                <FocusModal.Close asChild>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </FocusModal.Close>
                <Button
                  size="small"
                  onClick={handleSubmit}
                  isLoading={submitting}
                >
                  Add item
                </Button>
              </div>
            </FocusModal.Header>

            <FocusModal.Body className="flex-1 overflow-auto">
              <div className="mx-auto flex w-full max-w-lg flex-col gap-y-8 px-6 py-16">
                <div>
                  <Heading>Add custom item</Heading>
                  <Text size="small" className="text-ui-fg-subtle">
                    Add a custom item to the order. This will add a new line
                    item not associated with an existing product.
                  </Text>
                </div>

                <div className="flex flex-col gap-y-4">
                  <div className="flex flex-col gap-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="Enter the title of the item"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value)
                        setErrors({ ...errors, title: undefined! })
                      }}
                    />
                    {errors.title && (
                      <Text size="small" className="text-ui-fg-error">
                        {errors.title}
                      </Text>
                    )}
                  </div>

                  <div className="flex flex-col gap-y-2">
                    <Label>Unit price</Label>
                    <div className="flex items-center gap-x-2">
                      <Text
                        size="small"
                        weight="plus"
                        className="text-ui-fg-muted"
                      >
                        {currencyCode}
                      </Text>
                      <Input
                        type="number"
                        placeholder="Enter the unit price of the item"
                        value={unitPrice}
                        onChange={(e) => {
                          setUnitPrice(e.target.value)
                          setErrors({ ...errors, unit_price: undefined! })
                        }}
                      />
                    </div>
                    {errors.unit_price && (
                      <Text size="small" className="text-ui-fg-error">
                        {errors.unit_price}
                      </Text>
                    )}
                  </div>

                  <div className="flex flex-col gap-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(parseInt(e.target.value) || 1)
                        setErrors({ ...errors, quantity: undefined! })
                      }}
                    />
                    {errors.quantity && (
                      <Text size="small" className="text-ui-fg-error">
                        {errors.quantity}
                      </Text>
                    )}
                  </div>
                </div>
              </div>
            </FocusModal.Body>
          </div>
        </FocusModal.Content>
      </FocusModal>
    </>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderCustomItemsWidget
