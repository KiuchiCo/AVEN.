import { BadRequestException } from '@nestjs/common';

export const dashboardWidgets = ['stats', 'nextUp', 'projects', 'events', 'documents', 'activity', 'insights'] as const;

export const profileSelect = { id: true, email: true, displayName: true, notifyTeamActivity: true, notifyTaskUpdates: true, dashboardHiddenWidgets: true, emailNotifications: true } as const;

export type ProfileUpdate = { displayName?: string; notifyTeamActivity?: boolean; notifyTaskUpdates?: boolean; dashboardHiddenWidgets?: string[]; emailNotifications?: boolean };

/** Validates a profile PATCH body. Unknown fields are rejected so typos never silently do nothing. */
export function parseProfileUpdate(input: unknown): ProfileUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  const body = input as Record<string, unknown>;
  const allowed = ['displayName', 'notifyTeamActivity', 'notifyTaskUpdates', 'dashboardHiddenWidgets', 'emailNotifications'];
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) throw new BadRequestException(`Unknown setting “${unknown}”.`);

  const update: ProfileUpdate = {};
  if ('displayName' in body) {
    const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!name || name.length > 120) throw new BadRequestException('Display name must be between 1 and 120 characters.');
    update.displayName = name;
  }
  for (const key of ['notifyTeamActivity', 'notifyTaskUpdates', 'emailNotifications'] as const) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') throw new BadRequestException(`${key} must be true or false.`);
      update[key] = body[key];
    }
  }
  if ('dashboardHiddenWidgets' in body) {
    const value = body.dashboardHiddenWidgets;
    if (!Array.isArray(value) || value.some((id) => !(dashboardWidgets as readonly string[]).includes(id as string))) throw new BadRequestException('dashboardHiddenWidgets must list known dashboard widgets.');
    update.dashboardHiddenWidgets = [...new Set(value as string[])];
  }
  if (!Object.keys(update).length) throw new BadRequestException('Provide at least one setting to change.');
  return update;
}
