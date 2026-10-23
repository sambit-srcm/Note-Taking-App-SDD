import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, type createApi } from '../auth/api';
import { clearSession, getSession } from '../auth/session';
import { NoteList } from './NoteList';
import { useListState } from './listState';

interface Tag {
  id: string;
  name: string;
  noteCount: number;
}
interface Page {
  items: { id: string; title: string; updatedAt: string; deletedAt: string | null }[];
  pagination: { page: number; pageSize: number; total: number };
}

export function NotesPage({ api }: { api: ReturnType<typeof createApi> }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useListState();
  const [name, setName] = useState('');
  const session = getSession();
  const list = useQuery({
    queryKey: ['notes', state.page, state.sort, state.order, state.trash, state.tagIds],
    enabled: session !== null,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(state.page),
        pageSize: '20',
        trash: String(state.trash),
        sort: state.sort,
        order: state.order,
      });
      if (state.tagIds.length > 0) params.set('tagIds', state.tagIds.join(','));
      return api.request<Page>(`/api/notes?${params.toString()}`, { auth: true });
    },
  });
  const tags = useQuery({
    queryKey: ['tags'],
    enabled: session !== null,
    queryFn: () => api.request<{ items: Tag[] }>('/api/tags', { auth: true }),
  });
  const createTag = useMutation({
    mutationFn: () => api.request('/api/tags', { method: 'POST', auth: true, body: { name } }),
    onSuccess: () => {
      setName('');
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
  const renameTag = useMutation({
    mutationFn: (id: string) =>
      api.request(`/api/tags/${id}`, { method: 'PATCH', auth: true, body: { name } }),
    onSuccess: () => {
      setName('');
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
  const logout = useMutation({
    mutationFn: () =>
      api.request('/api/auth/logout', {
        method: 'POST',
        auth: true,
        body: { refreshToken: getSession()?.refreshToken },
      }),
    onSettled: () => {
      clearSession();
      navigate('/login');
    },
  });
  if (!session) return <Navigate to="/login" replace />;
  const total = list.data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return (
    <main>
      <h1>Notes</h1>
      <p>Your notes</p>
      <Link to="/search">Search</Link>
      <Link to="/notes/new">New note</Link>
      <button type="button" onClick={() => logout.mutate()}>
        Log out
      </button>
      <button type="button" onClick={() => state.setTrash(!state.trash)}>
        {state.trash ? 'Notes' : 'Trash'}
      </button>
      <label>
        Sort
        <select
          value={`${state.sort}:${state.order}`}
          onChange={(event) => {
            const [sort, order] = event.target.value.split(':') as [
              typeof state.sort,
              typeof state.order,
            ];
            state.setSort(sort, order);
          }}
        >
          <option value="updatedAt:desc">Updated</option>
          <option value="createdAt:desc">Created</option>
          <option value="title:asc">Title</option>
        </select>
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          createTag.mutate();
        }}
      >
        <label>
          New tag
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit">Add tag</button>
        <button
          type="button"
          disabled={state.tagIds.length !== 1 || name.trim() === ''}
          onClick={() => {
            const id = state.tagIds[0];
            if (id) renameTag.mutate(id);
          }}
        >
          Rename tag
        </button>
      </form>
      <button type="button" onClick={() => state.clearTags()}>
        Clear tags
      </button>
      <ul>
        {(tags.data?.items ?? []).map((tag) => (
          <li key={tag.id}>
            <button
              type="button"
              aria-pressed={state.tagIds.includes(tag.id)}
              onClick={() => state.toggleTag(tag.id)}
            >
              {tag.name}
            </button>
          </li>
        ))}
      </ul>
      <NoteList
        items={list.data?.items ?? []}
        empty={list.isSuccess && (list.data?.items.length ?? 0) === 0}
        error={
          list.error instanceof ApiError
            ? list.error.message
            : list.isError
              ? 'The list failed.'
              : null
        }
        page={state.page}
        totalPages={totalPages}
        onPage={state.setPage}
      />
    </main>
  );
}
