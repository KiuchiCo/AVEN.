import type { WorkspaceMember } from '../types';

export function MemberPicker({ members, selected, onChange, disabled = false }: { members: WorkspaceMember[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return <label className="task-collab__member-picker">Mention people<select multiple value={selected} disabled={disabled} onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select><small>Use Command-click or Control-click to select more than one.</small></label>;
}
