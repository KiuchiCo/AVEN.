import type { Key } from '../i18n/en';

export const workspaceNavigation = [
  { key: 'nav.home', label: 'Home', href: '/workspace', icon: 'home' },
  { key: 'nav.inbox', label: 'Inbox', href: '/workspace/inbox', icon: 'inbox' },
  { key: 'nav.tasks', label: 'My Tasks', href: '/workspace/tasks', icon: 'tasks' },
  { key: 'nav.labels', label: 'Task Labels', href: '/workspace/labels', icon: 'labels' },
  { key: 'nav.projects', label: 'Projects', href: '/workspace/projects', icon: 'projects' },
  { key: 'nav.documents', label: 'Documents', href: '/workspace/documents', icon: 'documents' },
  { key: 'nav.messages', label: 'Messages', href: '/workspace/messages', icon: 'messages' },
  { key: 'nav.whiteboards', label: 'Whiteboards', href: '/workspace/whiteboards', icon: 'whiteboards' },
  { key: 'nav.files', label: 'Files', href: '/workspace/files', icon: 'files' },
  { key: 'nav.knowledge', label: 'Knowledge', href: '/workspace/knowledge', icon: 'knowledge' },
  { key: 'nav.calendar', label: 'Calendar', href: '/workspace/calendar', icon: 'calendar' },
  { key: 'nav.databases', label: 'Databases', href: '/workspace/databases', icon: 'databases' },
  { key: 'nav.intelligence', label: 'Intelligence', href: '/workspace/intelligence', icon: 'intelligence' },
  { key: 'nav.automations', label: 'Automations', href: '/workspace/automations', icon: 'automations' },
  { key: 'nav.analytics', label: 'Analytics', href: '/workspace/analytics', icon: 'analytics' },
  { key: 'nav.activity', label: 'Activity', href: '/workspace/activity', icon: 'activity' },
  { key: 'nav.people', label: 'People', href: '/workspace/members', icon: 'people' },
] as const satisfies readonly { key: Key; label: string; href: string; icon: string }[];

/** The sidebar's two groups, in the order they appear. Everything in workspaceNavigation is in exactly one of them. */
export const navigationGroups = [
  { label: null, key: null, hrefs: ['/workspace', '/workspace/inbox', '/workspace/calendar', '/workspace/tasks', '/workspace/activity'] },
  { label: 'Workspace', key: 'group.workspace' as const, hrefs: ['/workspace/projects', '/workspace/documents', '/workspace/databases', '/workspace/knowledge', '/workspace/whiteboards', '/workspace/messages', '/workspace/files', '/workspace/automations', '/workspace/intelligence', '/workspace/analytics', '/workspace/labels', '/workspace/members'] },
] as const;
