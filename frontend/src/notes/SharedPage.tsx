import { useQuery } from '@tanstack/react-query';
import { ApiError, type createApi } from '../auth/api';
import { useParams } from 'react-router-dom';

export function SharedPage({ api }: { api: ReturnType<typeof createApi> }) {
  const { token } = useParams();
  const note = useQuery({
    queryKey: ['shared', token],
    enabled: typeof token === 'string',
    queryFn: () =>
      api.request<{ title: string; content: unknown; updatedAt: string }>(`/api/shared/${token}`),
  });
  if (note.error instanceof ApiError) return <p role="alert">{note.error.message}</p>;
  if (!note.data) return <p>Loading</p>;
  return (
    <main>
      <h1>{note.data.title}</h1>
      <p>Read only</p>
    </main>
  );
}
