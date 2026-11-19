type TemplateBlock = { type: 'PARAGRAPH' | 'HEADING_1' | 'HEADING_2' | 'BULLET' | 'TODO' | 'QUOTE' | 'CALLOUT' | 'DIVIDER'; text: string };

export type DocumentTemplate = { id: string; name: string; description: string; title: string; blocks: TemplateBlock[] };

const h1 = (text: string): TemplateBlock => ({ type: 'HEADING_1', text });
const h2 = (text: string): TemplateBlock => ({ type: 'HEADING_2', text });
const p = (text: string): TemplateBlock => ({ type: 'PARAGRAPH', text });
const bullet = (text: string): TemplateBlock => ({ type: 'BULLET', text });
const todo = (text: string): TemplateBlock => ({ type: 'TODO', text });

export const documentTemplates: DocumentTemplate[] = [
  { id: 'meeting-notes', name: 'Meeting notes', description: 'Agenda, discussion, decisions and action items.', title: 'Meeting notes', blocks: [
    h1('Meeting notes'), p('Date, attendees and purpose.'), h2('Agenda'), bullet(''), h2('Discussion'), p(''), h2('Decisions'), bullet(''), h2('Action items'), todo(''), todo('') ] },
  { id: 'project-brief', name: 'Project brief', description: 'Goal, scope, success measures and risks.', title: 'Project brief', blocks: [
    h1('Project brief'), h2('Goal'), p('What are we trying to achieve, and why now?'), h2('Scope'), bullet('In scope: '), bullet('Out of scope: '), h2('Success measures'), bullet(''),
    h2('Milestones'), bullet(''), h2('Risks and open questions'), bullet(''), { type: 'CALLOUT', text: 'Turn the milestones above into tasks from the project page.' } ] },
  { id: 'weekly-plan', name: 'Weekly plan', description: 'Priorities, schedule and a short review.', title: 'Weekly plan', blocks: [
    h1('Weekly plan'), h2('Top priorities'), todo(''), todo(''), todo(''), h2('Schedule'), bullet('Monday: '), bullet('Tuesday: '), bullet('Wednesday: '), bullet('Thursday: '), bullet('Friday: '),
    { type: 'DIVIDER', text: '' }, h2('End-of-week review'), p('What went well, what to change.') ] },
  { id: 'decision-record', name: 'Decision record', description: 'Context, options considered and the decision.', title: 'Decision record', blocks: [
    h1('Decision record'), h2('Context'), p(''), h2('Options considered'), bullet(''), bullet(''), h2('Decision'), p(''), h2('Consequences'), bullet(''), { type: 'QUOTE', text: 'Record why, so the decision can be revisited with the same information.' } ] },
  { id: 'study-notes', name: 'Study notes', description: 'Key ideas, questions and a review checklist.', title: 'Study notes', blocks: [
    h1('Study notes'), h2('Key ideas'), bullet(''), h2('Questions to answer'), todo(''), h2('Examples'), p(''), h2('Review checklist'), todo('Summarise in my own words'), todo('Test myself without notes') ] },
];

/** Encodes a template in the same aven-doc-v1 format the editor reads. Must run in the browser (uses crypto.randomUUID). */
export function encodeTemplate(template: DocumentTemplate, leadingNote = '') {
  const blocks = template.blocks.map((block) => ({ id: crypto.randomUUID(), checked: false, ...block }));
  if (leadingNote.trim()) blocks.unshift({ id: crypto.randomUUID(), type: 'PARAGRAPH', text: leadingNote.trim(), checked: false });
  return JSON.stringify({ format: 'aven-doc-v1', blocks });
}
