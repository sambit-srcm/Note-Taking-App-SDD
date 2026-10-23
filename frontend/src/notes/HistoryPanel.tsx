import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type createApi } from '../auth/api';

interface VersionRow {
  id: string;
  title: string;
  createdAt: string;
}

export function HistoryPanel({
  api,
  noteId,
}: {
  api: ReturnType<typeof createApi>;
  noteId: string;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const versions = useQuery({
    queryKey: ['versions', noteId],
    enabled: open,
    queryFn: () =>
      api.request<{ items: VersionRow[] }>(`/api/notes/${noteId}/versions`, { auth: true }),
  });
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      api.request(`/api/notes/${noteId}/versions/${versionId}/restore`, {
        method: 'POST',
        auth: true,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['versions', noteId] }),
  });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        History
      </button>
    );
  }
  return (
    <section aria-label="History">
      <h2>History</h2>
      <ul>
        {(versions.data?.items ?? []).map((item) => (
          <li key={item.id}>
            <span>{item.title}</span>
            <button type="button" onClick={() => restore.mutate(item.id)}>
              Restore {item.title}
            </button>
          </li>
        ))}
      </ul>
      {restore.isSuccess ? <p>Restored</p> : null}
    </section>
  );
}
