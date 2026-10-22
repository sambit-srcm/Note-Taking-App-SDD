import { healthResponseSchema } from '@notes/shared';

const contract = healthResponseSchema.safeParse({ status: 'ok' });

export default function App() {
  return (
    <main>
      <h1>Notes</h1>
      <p>API contract: {contract.success ? 'ok' : 'invalid'}</p>
    </main>
  );
}
