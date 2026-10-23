import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { clearSession, getSession } from './auth/session';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App apiUrl="http://api.test" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('auth screens', () => {
  it('registers, signs in, and logs out without using localStorage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/register')) {
        return new Response(
          JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'a@b.co' }),
          {
            status: 201,
          },
        );
      }
      if (url.endsWith('/api/auth/login')) {
        return new Response(JSON.stringify({ accessToken: 'access', refreshToken: 'refresh' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/auth/logout')) return new Response(null, { status: 204 });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/register');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Your notes')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(getSession()?.accessToken).toBe('access');

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it('shows API field errors and does not reveal whether a reset email exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/login')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'The request is invalid.',
                fields: [{ path: 'email', message: 'Email is not valid.' }],
              },
              requestId: 'r',
            }),
            { status: 422 },
          );
        }
        return new Response(null, { status: 204 });
      }),
    );
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email is not valid.');
    expect(screen.queryByText(/stack/i)).not.toBeInTheDocument();

    cleanup();
    renderAt('/reset');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'missing@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(
      await screen.findByText('If an account exists, a reset code was sent.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not registered/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled();
  });

  it('sends a logged-out visitor away from notes', async () => {
    renderAt('/notes');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
