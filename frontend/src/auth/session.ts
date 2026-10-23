export interface Session {
  accessToken: string;
  refreshToken: string;
}

let current: Session | null = null;

export function setSession(session: Session): void {
  current = session;
}

export function clearSession(): void {
  current = null;
}

export function getSession(): Session | null {
  return current;
}
