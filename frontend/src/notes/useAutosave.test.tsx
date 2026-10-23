import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

function Harness({ fail }: { fail: boolean }) {
  const [title, setTitle] = useState('Hello');
  const auto = useAutosave(
    title,
    true,
    async () => {
      if (fail) throw new Error('The content is too large.');
    },
    20,
  );
  return (
    <div>
      <input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <p role="status">{auto.status}</p>
      {auto.error ? <p role="alert">{auto.error}</p> : null}
      <button type="button" onClick={auto.retry}>
        Retry
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('autosave', () => {
  it('shows saving then saved, and keeps the draft when a save fails', async () => {
    vi.useFakeTimers();
    const view = render(<Harness fail={false} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kept' } });
    expect(screen.getByRole('status')).toHaveTextContent('saving');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(screen.getByRole('status')).toHaveTextContent('saved');

    view.rerender(<Harness fail />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kept still' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The content is too large.');
    expect(screen.getByLabelText('Title')).toHaveValue('Kept still');
  });
});
