export const DASHBOARD_CSP_NONCE_PLACEHOLDER = '__OPENWA_CSP_NONCE__';
export const LOCAL_DEV_AUTH_META = 'openwa-local-dev-auth';

/**
 * Inject the response-specific CSP nonce into the bundled dashboard document.
 *
 * Every occurrence, not just the first: the document carries one placeholder today, in the meta
 * element the plugin config UI reads, but the natural next one is a `nonce=` attribute on a script
 * tag. A single-occurrence replace would leave that one reading the literal placeholder, and the
 * browser would refuse the script with nothing failing server-side.
 */
export function injectDashboardCspNonce(html: string, nonce: string): string {
  return html.split(DASHBOARD_CSP_NONCE_PLACEHOLDER).join(nonce);
}

/**
 * Advertise runtime-only dashboard features without baking deployment settings into the Vite build.
 * A meta tag needs no inline script and therefore keeps the dashboard's strict CSP intact.
 */
export function injectLocalDevAuthFlag(html: string, enabled: boolean): string {
  if (!enabled || html.includes(`name="${LOCAL_DEV_AUTH_META}"`)) return html;
  return html.replace(/<\/head>/i, `<meta name="${LOCAL_DEV_AUTH_META}" content="true" /></head>`);
}
