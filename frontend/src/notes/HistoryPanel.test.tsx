import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../auth/api';
import { clearSession, setSession } from '../auth/session';
import { HistoryPanel } from './HistoryPanel';

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
});

describe('history panel', () => {
  it('lists a version and restores it', async () => {
    setSession({ accessToken: 'a', refreshToken: 'r' });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.endsWith('/restore'))
          return new Response(JSON.stringify({ id: 'n', title: 'Old' }), { status: 200 });
        return new Response(
          JSON.stringify({
            items: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                title: 'Old',
                createdAt: '2026-10-23T00:00:00.000Z',
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1 },
          }),
          { status: 200 },
        );
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <HistoryPanel
          api={createApi('http://api.test')}
          noteId="11111111-1111-4111-8111-111111111111"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Old' }));
    expect(await screen.findByText('Restored')).toBeInTheDocument();
    expect(calls.some((call) => call.startsWith('POST') && call.includes('/restore'))).toBe(true);
  });
});
