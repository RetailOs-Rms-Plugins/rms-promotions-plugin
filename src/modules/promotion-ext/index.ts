import { Module } from "@medusajs/framework/utils"
import PromotionExtModuleService from "./service"

export { PROMOTION_EXT_MODULE } from "./constants"
export * from "./models"

export default Module("promotion_ext", {
  service: PromotionExtModuleService,
})
