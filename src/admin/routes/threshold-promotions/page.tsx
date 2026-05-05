import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import { Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { ThresholdPromotion, ThresholdPromotionsResponse } from "../../lib/types"

const LIMIT = 15

const ThresholdPromotionsPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pageIndex, setPageIndex] = useState(0)
  const offset = useMemo(() => pageIndex * LIMIT, [pageIndex])

  const { data, isLoading } = useQuery<ThresholdPromotionsResponse>({
    queryKey: ["threshold-promotions", "list", LIMIT, offset],
    queryFn: () =>
      sdk.client.fetch<ThresholdPromotionsResponse>("/admin/threshold-promotions", {
        method: "GET",
        query: { limit: LIMIT, offset },
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (promotionId: string) =>
      sdk.client.fetch(`/admin/threshold-promotions/${promotionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threshold-promotions"] })
    },
  })

  const promotions = data?.threshold_promotions ?? []
  const count = data?.count ?? 0
  const pageCount = Math.ceil(count / LIMIT)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Threshold Promotions</Heading>
        <Button size="small" onClick={() => navigate("create")}>
          Create
        </Button>
      </div>

      {isLoading && (
        <div className="px-6 py-4">
          <Text>Loading...</Text>
        </div>
      )}

      {!isLoading && promotions.length === 0 && (
        <div className="px-6 py-4">
          <Text className="text-ui-fg-subtle">No threshold promotions yet.</Text>
        </div>
      )}

      {!isLoading && promotions.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Code</Table.HeaderCell>
              <Table.HeaderCell>Min Subtotal</Table.HeaderCell>
              <Table.HeaderCell>Discount</Table.HeaderCell>
              <Table.HeaderCell>Currency</Table.HeaderCell>
              <Table.HeaderCell>Automatic</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {promotions.map((tp: ThresholdPromotion) => {
              const { promotion, threshold_rule } = tp
              const method = promotion.application_method
              return (
                <Table.Row key={promotion.id}>
                  <Table.Cell>{promotion.code}</Table.Cell>
                  <Table.Cell>{threshold_rule.min_cart_subtotal}</Table.Cell>
                  <Table.Cell>
                    {method
                      ? `${method.value}${method.type === "percentage" ? "%" : ""}`
                      : "-"}
                  </Table.Cell>
                  <Table.Cell>{method?.currency_code ?? "-"}</Table.Cell>
                  <Table.Cell>{promotion.is_automatic ? "Yes" : "No"}</Table.Cell>
                  <Table.Cell>{promotion.status}</Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2">
                      <Link to={`${promotion.id}/edit`}>
                        <Button variant="secondary" size="small">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="small"
                        isLoading={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete promotion ${promotion.code}?`)) {
                            deleteMutation.mutate(promotion.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between px-6 py-4">
          <Text className="text-ui-fg-subtle">
            Page {pageIndex + 1} of {pageCount}
          </Text>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPageIndex((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Threshold Promotions",
  icon: Tag,
})

export default ThresholdPromotionsPage
