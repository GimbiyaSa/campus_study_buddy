// src/router.ts
export function getRouteFromPathname(pathname: string = window.location.pathname): string {
  const cleaned = (pathname || '/dashboard').replace(/^\//, '').replace(/\/$/, '');
  return cleaned === '' ? 'dashboard' : cleaned;
}
export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
