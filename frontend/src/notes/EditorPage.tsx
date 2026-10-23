import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError, type createApi } from '../auth/api';
import { getSession } from '../auth/session';
import { SharePanel } from './SharePanel';
import { useAutosave } from './useAutosave';

const emptyDoc = { type: 'doc', content: [] };

export function EditorPage({ api }: { api: ReturnType<typeof createApi> }) {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('Untitled');
  const [id, setId] = useState(noteId);
  const [draft, setDraft] = useState(emptyDoc);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), Link.configure({ autolink: false })],
    content: emptyDoc,
    onUpdate: ({ editor: current }) => setDraft(current.getJSON() as unknown as typeof emptyDoc),
  });
  const autosave = useAutosave(
    JSON.stringify({ title, draft, id }),
    editor !== null && title.trim() !== '',
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
  return (
    <main>
      <h1>Edit note</h1>
      {id ? <SharePanel api={api} noteId={id} /> : null}
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
