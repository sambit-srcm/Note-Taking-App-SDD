import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ApiError, createApi } from './auth/api';
import { setSession } from './auth/session';
import { EditorPage } from './notes/EditorPage';
import { NotesPage } from './notes/NotesPage';

function fieldMessage(error: unknown, path: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return error.fields.find((field) => field.path === path)?.message ?? error.message;
}

function FormError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.fields.length > 0) return null;
  return <p role="alert">{error.message}</p>;
}

export default function App({ apiUrl = 'http://127.0.0.1:3000' }: { apiUrl?: string }) {
  const api = createApi(apiUrl);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<Register api={api} />} />
      <Route path="/login" element={<Login api={api} />} />
      <Route path="/reset" element={<ResetRequest api={api} />} />
      <Route path="/reset/confirm" element={<ResetConfirm api={api} />} />
      <Route path="/notes" element={<NotesPage api={api} />} />
      <Route path="/notes/new" element={<EditorPage api={api} />} />
      <Route path="/notes/:noteId" element={<EditorPage api={api} />} />
    </Routes>
  );
}

function Register({ api }: { api: ReturnType<typeof createApi> }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.request('/api/auth/register', { method: 'POST', body: { email, password } }),
    onSuccess: () => navigate('/login'),
  });
  return (
    <main>
      <h1>Notes</h1>
      <h2>Create account</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Email
          <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {fieldMessage(mutation.error, 'email') ? (
          <p role="alert">{fieldMessage(mutation.error, 'email')}</p>
        ) : null}
        {fieldMessage(mutation.error, 'password') ? (
          <p role="alert">{fieldMessage(mutation.error, 'password')}</p>
        ) : null}
        <FormError error={mutation.error} />
        <button type="submit">Register</button>
      </form>
      <Link to="/login">Sign in</Link>
    </main>
  );
}

function Login({ api }: { api: ReturnType<typeof createApi> }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.request<{ accessToken: string; refreshToken: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    onSuccess: (tokens) => {
      setSession(tokens);
      navigate('/notes');
    },
  });
  return (
    <main>
      <h1>Notes</h1>
      <h2>Sign in</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Email
          <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {fieldMessage(mutation.error, 'email') ? (
          <p role="alert">{fieldMessage(mutation.error, 'email')}</p>
        ) : null}
        <FormError error={mutation.error} />
        <button type="submit">Sign in</button>
      </form>
      <Link to="/register">Create account</Link>
      <Link to="/reset">Forgot password</Link>
    </main>
  );
}

function ResetRequest({ api }: { api: ReturnType<typeof createApi> }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(() => setCooldown(0), 60_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const mutation = useMutation({
    mutationFn: () =>
      api.request('/api/auth/password-reset/request', { method: 'POST', body: { email } }),
    onSuccess: () => {
      setSent(true);
      setCooldown(60);
    },
  });
  return (
    <main>
      <h1>Notes</h1>
      <h2>Reset password</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Email
          <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button type="submit" disabled={cooldown > 0}>
          {cooldown > 0 ? 'Resend in 60s' : 'Send code'}
        </button>
      </form>
      {sent ? <p>If an account exists, a reset code was sent.</p> : null}
      {fieldMessage(mutation.error, 'email') ? (
        <p role="alert">{fieldMessage(mutation.error, 'email')}</p>
      ) : null}
      <FormError error={mutation.error} />
      <Link to="/reset/confirm">Enter code</Link>
    </main>
  );
}

function ResetConfirm({ api }: { api: ReturnType<typeof createApi> }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.request('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: { email, otp, newPassword },
      }),
    onSuccess: () => navigate('/login'),
  });
  return (
    <main>
      <h1>Notes</h1>
      <h2>Enter code</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Email
          <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Code
          <input name="otp" value={otp} onChange={(event) => setOtp(event.target.value)} />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <FormError error={mutation.error} />
        <button type="submit">Reset password</button>
      </form>
    </main>
  );
}
