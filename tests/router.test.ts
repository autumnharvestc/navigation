import { describe, expect, it } from 'vitest';
import { parseHashRoute, toHash } from '../src/router';

describe('parseHashRoute', () => {
  it('parses home and national routes', () => {
    expect(parseHashRoute('')).toEqual({ kind: 'home' });
    expect(parseHashRoute('#/')).toEqual({ kind: 'home' });
    expect(parseHashRoute('#/national')).toEqual({ kind: 'national' });
  });

  it('parses region and encoded search routes', () => {
    expect(parseHashRoute('#/region/110000')).toEqual({ kind: 'region', regionCode: '110000' });
    expect(parseHashRoute('#/search?q=%E5%8C%97%E4%BA%AC')).toEqual({
      kind: 'search', query: '北京'
    });
  });

  it('round-trips each route', () => {
    const routes = [
      { kind: 'home' as const },
      { kind: 'national' as const },
      { kind: 'region' as const, regionCode: '110000' },
      { kind: 'search' as const, query: '法院' }
    ];
    for (const route of routes) expect(parseHashRoute(toHash(route))).toEqual(route);
  });
});
