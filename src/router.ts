export type Route =
  | { kind: 'home' }
  | { kind: 'national' }
  | { kind: 'region'; regionCode: string }
  | { kind: 'search'; query: string };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHashRoute(hash: string): Route {
  const value = hash.replace(/^#/, '') || '/';
  if (value === '/') return { kind: 'home' };
  if (value === '/national') return { kind: 'national' };
  const region = value.match(/^\/region\/([^/?#]+)$/);
  if (region?.[1]) return { kind: 'region', regionCode: safeDecode(region[1]) };
  const search = value.match(/^\/search(?:\?q=([^&]*))?$/);
  if (search) return { kind: 'search', query: safeDecode(search[1] ?? '') };
  return { kind: 'home' };
}

export function toHash(route: Route): string {
  if (route.kind === 'home') return '#/';
  if (route.kind === 'national') return '#/national';
  if (route.kind === 'region') return `#/region/${encodeURIComponent(route.regionCode)}`;
  return `#/search?q=${encodeURIComponent(route.query)}`;
}
