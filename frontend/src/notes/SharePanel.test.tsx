import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../auth/api';
import { setSession, clearSession } from '../auth/session';
import { SharePanel } from './SharePanel';

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
});

describe('share panel', () => {
  it('creates a link and shows the token once', async () => {
    setSession({ accessToken: 'a', refreshToken: 'r' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              status: 'active',
              expiresAt: '2026-10-30T00:00:00.000Z',
              viewCount: 0,
              token: 'once',
            }),
            { status: 201 },
          );
        }
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'missing' }, requestId: 'r' }),
          { status: 404 },
        );
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SharePanel
          api={createApi('http://api.test')}
          noteId="11111111-1111-4111-8111-111111111111"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('No active link')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText('Token once')).toBeInTheDocument();
  });
});
