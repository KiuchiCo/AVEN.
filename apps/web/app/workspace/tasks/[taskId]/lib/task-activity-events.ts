const TASK_ACTIVITY_CHANGED = 'aven:task-activity-changed';

export function notifyTaskActivityChanged(taskId: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TASK_ACTIVITY_CHANGED, { detail: { taskId } }));
}

export function listenForTaskActivity(taskId: string, onChange: () => void) {
  const handleEvent = (event: Event) => {
    if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) onChange();
  };
  window.addEventListener(TASK_ACTIVITY_CHANGED, handleEvent);
  return () => window.removeEventListener(TASK_ACTIVITY_CHANGED, handleEvent);
}
