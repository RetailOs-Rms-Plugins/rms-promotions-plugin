import { ContainerRegistrationKeys, remoteQueryObjectFromString, MedusaError } from "@medusajs/framework/utils"

export async function refetchCart(id: string, scope: any, fields: string[]) {
  const remoteQuery = scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "cart",
    variables: { filters: { id } },
    fields,
  })
  const [cart] = await remoteQuery(queryObject)
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart with id '${id}' not found`)
  }
  return cart
}
