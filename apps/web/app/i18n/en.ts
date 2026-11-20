/** English is the source: every other dictionary must have exactly these keys, and the same {placeholders}. */
export const en = {
  'nav.home': 'Home', 'nav.inbox': 'Inbox', 'nav.calendar': 'Calendar', 'nav.tasks': 'My Tasks', 'nav.labels': 'Task Labels', 'nav.projects': 'Projects', 'nav.documents': 'Documents',
  'nav.messages': 'Messages', 'nav.whiteboards': 'Whiteboards', 'nav.files': 'Files', 'nav.knowledge': 'Knowledge', 'nav.databases': 'Databases', 'nav.intelligence': 'Intelligence',
  'nav.automations': 'Automations', 'nav.analytics': 'Analytics', 'nav.activity': 'Activity', 'nav.people': 'People',
  'group.workspace': 'Workspace', 'group.favourites': 'Favourites',
  'shell.tagline': 'Your entire world, organised.', 'shell.settings': 'Settings', 'shell.closeNav': 'Close navigation', 'shell.openNav': 'Open navigation', 'shell.back': 'Back', 'shell.forward': 'Forward',
  'shell.searchLabel': 'Search your workspace', 'shell.searchPlaceholder': 'Search or ask AVEN…', 'shell.create': 'Create', 'shell.createHint': 'Start with a section', 'shell.createTasks': 'Tasks',
  'shell.plan': '{name} Plan', 'shell.pageSearch': 'Search', 'shell.pageWorkspace': 'Workspace', 'shell.unread': '{n} unread',
  'home.aria': 'Workspace dashboard', 'home.welcomeBack': 'Welcome back, {name}.', 'home.greetMorning': 'Good morning, {name}.', 'home.greetAfternoon': 'Good afternoon, {name}.', 'home.greetEvening': 'Good evening, {name}.',
  'home.sub': 'Here’s your day at a glance.', 'home.customise': 'Customise', 'home.done': 'Done', 'home.showOn': 'Show on your dashboard', 'home.loading': 'Loading your workspace…',
  'widget.stats': 'Summary tiles', 'widget.nextUp': 'Priority tasks', 'widget.events': 'Today', 'widget.insights': 'AI briefing', 'widget.projects': 'Project progress', 'widget.documents': 'Recent', 'widget.activity': 'Recent activity',
  'home.tile.tasks': 'Tasks', 'home.tile.meetings': 'Meetings', 'home.tile.deadlines': 'Deadlines', 'home.tile.projects': 'Projects',
  'home.cap.open': 'Open', 'home.cap.openOverdue': 'Open · {n} overdue', 'home.cap.today': 'Today', 'home.cap.thisWeek': 'This week', 'home.cap.active': 'Active',
  'home.priorityTasks': 'Priority tasks', 'home.seeAll': 'See all', 'home.noTasks': 'Nothing assigned to you. Tasks assigned to you will appear here.',
  'home.today': 'Today', 'home.openCalendar': 'Open the calendar', 'home.noEvents': 'Nothing scheduled. Your day is clear.', 'home.nothingToday': 'Nothing today. Coming up:',
  'home.briefing': 'Your AI briefing', 'home.noInsights': 'Nothing needs your attention right now.', 'home.viewBriefing': 'View briefing', 'home.showInsights': 'Show insights',
  'home.projectProgress': 'Project progress', 'home.noProjects': 'No active projects yet.',
  'home.recent': 'Recent', 'home.recentItems': 'Recent items', 'home.tab.all': 'All', 'home.tab.documents': 'Documents', 'home.tab.projects': 'Projects', 'home.viewAll': 'View all', 'home.noRecent': 'Documents you write and projects you start will appear here.',
  'home.recentActivity': 'Recent activity', 'home.noActivity': 'Changes in this workspace will appear here.',
  'ai.aria': 'AVEN Intelligence', 'ai.title': 'AVEN Intelligence', 'ai.heading': 'Your intelligent workspace.', 'ai.blurb': 'Plan, create, analyse and get things done across your entire workspace.',
  'ai.daily': 'Daily briefing', 'ai.dailySub': 'A summary of your day', 'ai.find': 'Find anything', 'ai.findSub': 'Search across all your workspace content', 'ai.action': 'Take action', 'ai.actionSub': 'Create, update and organise with AI',
  'ai.deep': 'Deep work', 'ai.deepSub': 'Get focused help on any task or project', 'ai.ask': 'Ask AVEN anything', 'ai.askPlaceholder': 'Ask AVEN anything…', 'ai.chipDay': 'Summarise my day', 'ai.chipWeek': 'Plan my week', 'ai.chipProject': 'Project update',
  'settings.language.title': 'Language', 'settings.language.hint': 'Changes the menus and the Home screen. Other screens are still in English for now. Dates follow your device.', 'settings.language.saved': 'Language saved.',
} as const;

export type Key = keyof typeof en;
export type Dictionary = Record<Key, string>;
