import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coachingCatalog } from '../app/workspace/projects/templates/presets/task-coaching/coaching-catalog.ts';
import { buildTaskCoaching } from '../app/workspace/projects/templates/presets/task-coaching/coaching-text.ts';

test('every starter template task has coaching: 52 templates, 312 tasks', () => {
  const presets = Object.values(coachingCatalog);
  assert.equal(presets.length, 52);
  assert.equal(presets.reduce((sum, preset) => sum + preset.tasks.length, 0), 312);
});

test('coaching is built from the template name and task title, with every section filled', () => {
  const { name, tasks } = coachingCatalog['accessibility-remediation'];
  const coaching = buildTaskCoaching(name, tasks[0]);
  assert.equal(coaching.taskTitle, 'Choose journeys and conformance scope');
  assert.equal(coaching.steps.length, 8);
  assert.equal(coaching.steps[0].guidance.startsWith('Restate the intended result for Choose journeys and conformance scope in Accessibility remediation;'), true);
  assert.deepEqual(Object.keys(coaching.worksheet), ['outcome', 'owner', 'evidence', 'decisions', 'dependencies', 'risks', 'review', 'handoff']);
  assert.ok(coaching.readinessRubric.length > 0 && coaching.readinessRubric.every((dimension) => dimension.levels.length > 0));
  assert.ok(!JSON.stringify(coaching).includes('\u0000'), 'no placeholder left behind');
});

test('titles with quotes and backslashes come through unchanged', () => {
  const coaching = buildTaskCoaching('Name with "quotes"', 'Task \\ with “curly” and "straight" quotes');
  assert.equal(coaching.taskTitle, 'Task \\ with “curly” and "straight" quotes');
  assert.ok(coaching.steps[0].guidance.includes('Task \\ with “curly” and "straight" quotes in Name with "quotes";'));
});
