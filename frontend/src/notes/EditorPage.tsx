import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError, type createApi } from '../auth/api';
import { getSession } from '../auth/session';
import { HistoryPanel } from './HistoryPanel';
import { SharePanel } from './SharePanel';
import { useAutosave } from './useAutosave';

const emptyDoc = { type: 'doc', content: [] };

export function EditorPage({ api }: { api: ReturnType<typeof createApi> }) {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('Untitled');
  const [id, setId] = useState(noteId);
  const [draft, setDraft] = useState(emptyDoc);
  const [hydrated, setHydrated] = useState(noteId === undefined);
  const existing = useQuery({
    queryKey: ['note', noteId],
    enabled: noteId !== undefined,
    queryFn: () =>
      api.request<{ title: string; content: typeof emptyDoc }>(`/api/notes/${noteId}`, {
        auth: true,
      }),
  });
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), Link.configure({ autolink: false })],
    content: emptyDoc,
    onUpdate: ({ editor: current }) => setDraft(current.getJSON() as unknown as typeof emptyDoc),
  });
  useEffect(() => {
    if (!existing.data || !editor) return;
    setTitle(existing.data.title);
    setDraft(existing.data.content);
    editor.commands.setContent(existing.data.content, { emitUpdate: false });
    setHydrated(true);
  }, [existing.data, editor]);
  const autosave = useAutosave(
    JSON.stringify({ title, draft, id }),
    editor !== null && hydrated && title.trim() !== '',
    async () => {
      const content = editor?.getJSON() ?? draft;
      try {
        if (!id) {
          const created = await api.request<{ id: string }>('/api/notes', {
            method: 'POST',
            auth: true,
            body: { title: title.trim(), content },
          });
          setId(created.id);
          navigate(`/notes/${created.id}`, { replace: true });
          return;
        }
        await api.request(`/api/notes/${id}`, {
          method: 'PATCH',
          auth: true,
          body: { title: title.trim(), content },
        });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Save failed.';
        throw new Error(message, { cause: err });
      }
    },
  );
  if (!getSession()) return <Navigate to="/login" replace />;
  if (existing.error instanceof ApiError) return <p role="alert">{existing.error.message}</p>;
  return (
    <main>
      <h1>Edit note</h1>
      {id ? <SharePanel api={api} noteId={id} /> : null}
      {id ? <HistoryPanel api={api} noteId={id} /> : null}
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <EditorContent editor={editor} />
      <p role="status">{autosave.status}</p>
      {autosave.error ? <p role="alert">{autosave.error}</p> : null}
      {autosave.status === 'failed' ? (
        <button type="button" onClick={autosave.retry}>
          Retry
        </button>
      ) : null}
    </main>
  );
}
