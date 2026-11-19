import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Set while a workflow run is executing. Anything it changes (a task created or updated) must not start
 * further workflows, otherwise two workflows could trigger each other forever.
 */
export const workflowContext = new AsyncLocalStorage<{ runId: string }>();
