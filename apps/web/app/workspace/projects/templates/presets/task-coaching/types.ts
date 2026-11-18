export type TemplateTaskCoachingStep = { title: string; guidance: string };
export type TemplateTaskWorksheet = {
  outcome: string;
  owner: string;
  evidence: string;
  decisions: string;
  dependencies: string;
  risks: string;
  review: string;
  handoff: string;
};
export type TemplateTaskCoaching = {
  taskTitle: string;
  steps: TemplateTaskCoachingStep[];
  worksheet: TemplateTaskWorksheet;
};
