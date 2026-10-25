import { renderNativeEvidencePlan } from '../shared/native-evidence-plan.mjs'
export const renderAmberPlan = (design, layouts) =>
  renderNativeEvidencePlan(design, layouts, design.amber)
