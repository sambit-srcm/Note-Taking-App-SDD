import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type createApi } from '../auth/api';
import { getSession } from '../auth/session';

interface Hit {
  id: string;
  title: string;
  snippet: string;
  highlights: { start: number; end: number }[];
  updatedAt: string;
}

export function markedSnippet(snippet: string, highlights: { start: number; end: number }[]) {
  const parts: { text: string; mark: boolean; key: string }[] = [];
  let cursor = 0;
  highlights.forEach((range, index) => {
    if (range.start > cursor)
      parts.push({ text: snippet.slice(cursor, range.start), mark: false, key: `t${index}` });
    parts.push({ text: snippet.slice(range.start, range.end), mark: true, key: `m${index}` });
    cursor = range.end;
  });
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), mark: false, key: 'end' });
  return parts;
}

export function SearchPage({ api }: { api: ReturnType<typeof createApi> }) {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const search = useQuery({
    queryKey: ['search', submitted],
    enabled: getSession() !== null && submitted !== '',
    queryFn: () =>
      api.request<{ items: Hit[] }>(`/api/search?q=${encodeURIComponent(submitted)}`, {
        auth: true,
      }),
  });
  if (!getSession()) return <Navigate to="/login" replace />;
  return (
    <main>
      <h1>Search</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <label>
          Query
          <input value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>
      {search.error instanceof ApiError ? <p role="alert">{search.error.message}</p> : null}
      <ul>
        {(search.data?.items ?? []).map((item) => (
          <li key={item.id}>
            <Link to={`/notes/${item.id}`}>{item.title}</Link>
            <p>
              {markedSnippet(item.snippet, item.highlights).map((part) =>
                part.mark ? (
                  <mark key={part.key}>{part.text}</mark>
                ) : (
                  <span key={part.key}>{part.text}</span>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
