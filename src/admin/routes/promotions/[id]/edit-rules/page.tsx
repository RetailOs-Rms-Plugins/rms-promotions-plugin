import { useParams } from "react-router-dom"
import { RouteFocusModal } from "@retailos-ai/rms-medusa-ui"
import { RulesEditorForm } from "./components/rules-editor-form"

const EditPromotionRulesPage = () => {
  const { id } = useParams<{ id: string }>()

  return (
    <RouteFocusModal prev={`/promotions/${id}`}>
      <RulesEditorForm promotionId={id!} />
    </RouteFocusModal>
  )
}

export default EditPromotionRulesPage
