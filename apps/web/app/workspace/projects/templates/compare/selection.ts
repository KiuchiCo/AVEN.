export const TEMPLATE_COMPARE_LIMIT = 3;

export function toggleComparedTemplate(currentIds: string[], templateId: string): { ids: string[]; error: string } {
  if (currentIds.includes(templateId)) return { ids: currentIds.filter((id) => id !== templateId), error: '' };
  if (currentIds.length >= TEMPLATE_COMPARE_LIMIT) return { ids: currentIds, error: `Compare up to ${TEMPLATE_COMPARE_LIMIT} templates at once.` };
  return { ids: [...currentIds, templateId], error: '' };
}
