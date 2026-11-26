import { useT } from '../../../../i18n';
import type { WorkspaceMember } from '../types';

export function MemberPicker({ members, selected, onChange, disabled = false }: { members: WorkspaceMember[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const t = useT();
  function toggle(userId: string, checked: boolean) {
    if (checked) {
      if (selected.length >= 20) return;
      onChange([...selected, userId]);
    } else onChange(selected.filter((id) => id !== userId));
  }
  return <fieldset className="task-collab__member-picker" disabled={disabled}><legend>{t('td.mention')} <span>{selected.length}/20</span></legend>{members.length ? <div className="task-collab__member-picker-list">{members.map((member) => <label key={member.userId}><input type="checkbox" checked={selected.includes(member.userId)} disabled={!selected.includes(member.userId) && selected.length >= 20} onChange={(event) => toggle(member.userId, event.target.checked)} /><span>{member.displayName}</span></label>)}</div> : <small>{t('td.noMembers')}</small>}<small>{t('td.mentionNote')}</small></fieldset>;
}
