import { renderNativeEvidencePlan } from './native-evidence-plan.mjs'
export const renderAmberPlan = (design, layouts) =>
  renderNativeEvidencePlan(design, layouts, design.amber)
