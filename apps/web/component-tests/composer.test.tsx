import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/workspace/files/use-files-api', () => ({ useFilesApi: () => ({ upload: vi.fn() }) }));
const { Composer } = await import('../app/workspace/messages/composer');

describe('message composer', () => {
  it('sends once when Enter is pressed twice before the server answers', async () => {
    let finish: () => void = () => undefined;
    const onSend = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Composer label="general" members={[]} selfId="me" onSend={onSend} />);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'Hello team' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: /send/i }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish(); });
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps the text and allows a retry when sending fails', async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    render(<Composer label="general" members={[]} selfId="me" onSend={onSend} />);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'Retry me' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    expect((box as HTMLTextAreaElement).value).toBe('Retry me');
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    expect(onSend).toHaveBeenCalledTimes(2);
    expect((box as HTMLTextAreaElement).value).toBe('');
  });
});
