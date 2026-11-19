import type { Email } from './mailer.js';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const trim = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export type NotificationItem = { workspaceName: string; actorName: string; message: string; href: string; createdAt: Date };

/** Where a notification should open in the web app. */
export function notificationHref(entityType: string, entityId: string): string {
  if (entityType.startsWith('TASK')) return `/workspace/tasks/${encodeURIComponent(entityId)}`;
  if (entityType === 'DOCUMENT') return `/workspace/documents/${encodeURIComponent(entityId)}`;
  if (entityType === 'WORKFLOW') return '/workspace/automations';
  if (entityType === 'FILE') return '/workspace/files';
  if (entityType === 'KNOWLEDGE') return '/workspace/knowledge';
  return '/workspace/inbox';
}

const MAX_ITEMS = 20;

/** One email summarising several notifications. Everything that came from a member is escaped. */
export function renderNotificationEmail(input: { recipientName: string; items: NotificationItem[]; webBaseUrl: string }): Omit<Email, 'to'> {
  const { items, webBaseUrl } = input;
  const base = webBaseUrl.replace(/\/$/, '');
  const shown = items.slice(0, MAX_ITEMS);
  const extra = items.length - shown.length;
  const workspaces = [...new Set(items.map((item) => item.workspaceName))];
  const subject = `AVEN: ${items.length} new ${items.length === 1 ? 'update' : 'updates'}${workspaces.length === 1 ? ` in ${trim(workspaces[0], 60)}` : ''}`;
  const name = trim(input.recipientName.trim() || 'there', 60);
  const line = (item: NotificationItem) => `${item.actorName} ${item.message}`;
  const text = [
    `Hi ${name},`, '', `You have ${items.length} new ${items.length === 1 ? 'update' : 'updates'} in AVEN:`, '',
    ...shown.map((item) => `• ${trim(line(item), 200)} (${item.workspaceName})\n  ${base}${item.href}`),
    ...(extra > 0 ? ['', `…and ${extra} more in your Inbox: ${base}/workspace/inbox`] : []),
    '', `Open your Inbox: ${base}/workspace/inbox`, '',
    `You’re getting this because email notifications are on. Turn them off in Settings: ${base}/workspace/settings`,
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#2b2a27;max-width:560px;margin:0 auto;padding:24px">
<p style="font:600 22px Georgia,serif;margin:0 0 4px">AVEN.</p>
<p style="color:#77766e;margin:0 0 20px">Hi ${escapeHtml(name)}, you have ${items.length} new ${items.length === 1 ? 'update' : 'updates'}.</p>
<ul style="padding:0;list-style:none;margin:0">${shown.map((item) => `<li style="padding:12px 0;border-top:1px solid #dcd9d0"><a href="${escapeHtml(base + item.href)}" style="color:#2b2a27;text-decoration:none"><strong>${escapeHtml(item.actorName)}</strong> ${escapeHtml(trim(item.message, 200))}</a><br><span style="color:#77766e;font-size:12px">${escapeHtml(item.workspaceName)}</span></li>`).join('')}</ul>
${extra > 0 ? `<p style="color:#77766e">…and ${extra} more in your Inbox.</p>` : ''}
<p style="margin:24px 0"><a href="${escapeHtml(base)}/workspace/inbox" style="background:#292722;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open your Inbox</a></p>
<p style="color:#77766e;font-size:12px">You’re getting this because email notifications are on. <a href="${escapeHtml(base)}/workspace/settings" style="color:#6b5746">Change this in Settings</a>.</p>
</div>`;
  return { subject, text, html };
}

export function renderInvitationEmail(input: { inviterName: string; workspaceName: string; role: string; link: string; expiresAt: Date }): Omit<Email, 'to'> {
  const inviter = trim(input.inviterName.trim() || 'A teammate', 80);
  const workspace = trim(input.workspaceName, 80);
  const role = input.role.toLocaleLowerCase();
  const expires = input.expiresAt.toISOString().slice(0, 10);
  const subject = `${inviter} invited you to ${workspace} on AVEN`;
  const text = [`${inviter} invited you to join “${workspace}” on AVEN as ${role === 'administrator' ? 'an' : 'a'} ${role}.`, '', `Accept the invitation: ${input.link}`, '', `Sign in with this email address to accept. The link expires on ${expires}. If you weren’t expecting this, you can ignore it.`].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#2b2a27;max-width:560px;margin:0 auto;padding:24px">
<p style="font:600 22px Georgia,serif;margin:0 0 16px">AVEN.</p>
<p><strong>${escapeHtml(inviter)}</strong> invited you to join <strong>${escapeHtml(workspace)}</strong> as ${role === 'administrator' ? 'an' : 'a'} ${escapeHtml(role)}.</p>
<p style="margin:24px 0"><a href="${escapeHtml(input.link)}" style="background:#292722;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
<p style="color:#77766e;font-size:12px">Sign in with this email address to accept. The link expires on ${expires}. If you weren’t expecting this, you can ignore it.</p>
</div>`;
  return { subject, text, html };
}
