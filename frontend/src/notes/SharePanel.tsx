import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, type createApi } from '../auth/api';

interface ShareStatus {
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  viewCount: number;
  token?: string;
}

export function SharePanel({ api, noteId }: { api: ReturnType<typeof createApi>; noteId: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const client = useQueryClient();
  const share = useQuery({
    queryKey: ['share', noteId],
    enabled: open,
    queryFn: async () => {
      try {
        return await api.request<ShareStatus>(`/api/notes/${noteId}/share`, { auth: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
  const create = useMutation({
    mutationFn: () =>
      api.request<ShareStatus>(`/api/notes/${noteId}/share`, {
        method: 'POST',
        auth: true,
        body: { expiresInDays: 7 },
      }),
    onSuccess: (created) => {
      setToken(created.token ?? null);
      void client.invalidateQueries({ queryKey: ['share', noteId] });
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.request(`/api/notes/${noteId}/share`, { method: 'DELETE', auth: true }),
    onSuccess: () => {
      setToken(null);
      void client.invalidateQueries({ queryKey: ['share', noteId] });
    },
  });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Share
      </button>
    );
  }
  return (
    <section aria-label="Share">
      <h2>Share</h2>
      {share.data ? (
        <p>
          {share.data.status}, views {share.data.viewCount}
        </p>
      ) : (
        <p>No active link</p>
      )}
      {token ? <p>Token {token}</p> : null}
      <button type="button" onClick={() => create.mutate()}>
        Create link
      </button>
      <button type="button" onClick={() => revoke.mutate()}>
        Revoke
      </button>
      {create.error instanceof ApiError ? <p role="alert">{create.error.message}</p> : null}
    </section>
  );
}
