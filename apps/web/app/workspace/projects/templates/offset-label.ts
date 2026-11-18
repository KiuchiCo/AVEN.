export function formatTemplateOffset(offset: number | null, noun = 'day') {
  if (offset === null) return 'No date';
  if (offset === 0) return 'Due on template day';
  const amount = Math.abs(offset);
  const unit = amount === 1 ? noun : `${noun}s`;
  return offset < 0 ? `${amount} ${unit} before template day` : `${amount} ${unit} after template day`;
}
