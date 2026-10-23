import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { setSession, clearSession } from '../auth/session';
import { NotesPage } from './NotesPage';
import { createApi } from '../auth/api';
import { useListState } from './listState';

const TAGS = {
  items: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Work', noteCount: 1 },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Home', noteCount: 1 },
  ],
};

function page(titles: string[]) {
  return {
    items: titles.map((title, index) => ({
      id: `33333333-3333-4333-8333-33333333333${index}`,
      title,
      updatedAt: '2026-10-23T00:00:00.000Z',
      deletedAt: null,
    })),
    pagination: { page: 1, pageSize: 20, total: titles.length },
  };
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  setSession({ accessToken: 'access', refreshToken: 'refresh' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotesPage api={createApi('http://api.test')} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  useListState.getState().reset();
  vi.unstubAllGlobals();
});

describe('notes list', () => {
  it('shows an error when the list request fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/tags')) return json(TAGS);
      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'The list failed.' }, requestId: 'r' },
        500,
      );
    });
    renderPage(fetchMock);
    expect(await screen.findByRole('alert')).toHaveTextContent('The list failed.');
  });

  it('shows notes, an empty list, and an error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/tags')) return json(TAGS);
      if (url.includes('trash=true')) return json(page([]));
      if (url.includes('/api/notes')) return json(page(['Alpha']));
      return json({});
    });
    renderPage(fetchMock);
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    expect(await screen.findByText('No notes')).toBeInTheDocument();
  });

  it('sends every selected tag and clears them', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/tags')) return json(TAGS);
      return json(page(['Alpha']));
    });
    renderPage(fetchMock);
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Home' }));
    await screen.findByRole('button', { name: 'Work', pressed: true });
    expect(
      urls.some(
        (url) =>
          url.includes('tagIds=') &&
          url.includes(TAGS.items[0]!.id) &&
          url.includes(TAGS.items[1]!.id),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear tags' }));
    expect(useListState.getState().tagIds).toEqual([]);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
