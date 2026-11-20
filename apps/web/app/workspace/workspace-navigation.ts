export const workspaceNavigation = [
  { label: 'Home', href: '/workspace', icon: 'home' },
  { label: 'Inbox', href: '/workspace/inbox', icon: 'inbox' },
  { label: 'My Tasks', href: '/workspace/tasks', icon: 'tasks' },
  { label: 'Task Labels', href: '/workspace/labels', icon: 'labels' },
  { label: 'Projects', href: '/workspace/projects', icon: 'projects' },
  { label: 'Documents', href: '/workspace/documents', icon: 'documents' },
  { label: 'Messages', href: '/workspace/messages', icon: 'messages' },
  { label: 'Whiteboards', href: '/workspace/whiteboards', icon: 'whiteboards' },
  { label: 'Files', href: '/workspace/files', icon: 'files' },
  { label: 'Knowledge', href: '/workspace/knowledge', icon: 'knowledge' },
  { label: 'Calendar', href: '/workspace/calendar', icon: 'calendar' },
  { label: 'Databases', href: '/workspace/databases', icon: 'databases' },
  { label: 'Intelligence', href: '/workspace/intelligence', icon: 'intelligence' },
  { label: 'Automations', href: '/workspace/automations', icon: 'automations' },
  { label: 'Analytics', href: '/workspace/analytics', icon: 'analytics' },
  { label: 'Activity', href: '/workspace/activity', icon: 'activity' },
  { label: 'People', href: '/workspace/members', icon: 'people' },
] as const;

/** The sidebar's two groups, in the order they appear. Everything in workspaceNavigation is in exactly one of them. */
export const navigationGroups = [
  { label: null, hrefs: ['/workspace', '/workspace/inbox', '/workspace/calendar', '/workspace/tasks', '/workspace/activity'] },
  { label: 'Workspace', hrefs: ['/workspace/projects', '/workspace/documents', '/workspace/databases', '/workspace/knowledge', '/workspace/whiteboards', '/workspace/messages', '/workspace/files', '/workspace/automations', '/workspace/intelligence', '/workspace/analytics', '/workspace/labels', '/workspace/members'] },
] as const;
