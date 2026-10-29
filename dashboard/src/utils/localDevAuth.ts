export const LOCAL_DEV_API_KEY = 'dev-admin-key';
const LOCAL_DEV_AUTH_META = 'openwa-local-dev-auth';

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function shouldUseLocalDevAuth(
  enabled: boolean,
  dashboardHostname: string,
  apiOrigin: string,
  dashboardOrigin: string,
): boolean {
  if (!enabled || !isLoopbackHostname(dashboardHostname)) return false;
  if (!apiOrigin) return true;

  try {
    return isLoopbackHostname(new URL(apiOrigin, dashboardOrigin).hostname);
  } catch {
    return false;
  }
}

/** Return the implicit development key only when the server opted in and every browser hop is local. */
export function localDevApiKey(apiOrigin: string): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const enabled = document.querySelector(`meta[name="${LOCAL_DEV_AUTH_META}"]`)?.getAttribute('content') === 'true';
  return shouldUseLocalDevAuth(enabled, window.location.hostname, apiOrigin, window.location.origin)
    ? LOCAL_DEV_API_KEY
    : null;
}
