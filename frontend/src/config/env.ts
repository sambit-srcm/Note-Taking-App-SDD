/**
 * Validates VITE_API_URL. Error messages name the variable and a fixed reason
 * only; the supplied value is never included.
 */
export function getApiUrl(env: Record<string, unknown> = import.meta.env): string {
  const value = env['VITE_API_URL'];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('VITE_API_URL is missing');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_URL is invalid: must be an absolute http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_API_URL is invalid: must be an absolute http(s) URL');
  }
  return value;
}
