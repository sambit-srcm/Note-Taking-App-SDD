import { errorResponseSchema } from '@notes/shared';
import { clearSession, getSession, setSession, type Session } from './session';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export function createApi(baseUrl: string) {
  async function raw(
    path: string,
    options: RequestOptions,
    accessToken?: string,
  ): Promise<Response> {
    const headers = new Headers();
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const init: RequestInit = { method: options.method ?? 'GET', headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(`${baseUrl}${path}`, init);
  }

  async function parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(response.status, 'INTERNAL_ERROR', 'The request failed.');
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.fields ?? [],
      );
    }
    return body as T;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const session = options.auth ? getSession() : null;
    let response = await raw(path, options, session?.accessToken);
    if (response.status === 401 && options.auth && session) {
      const refreshed = await raw('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
      });
      if (refreshed.ok) {
        const tokens = (await refreshed.json()) as Session;
        setSession(tokens);
        response = await raw(path, options, tokens.accessToken);
      } else {
        clearSession();
      }
    }
    return parse<T>(response);
  }

  return { request };
}
