import { afterEach, describe, expect, it } from 'vitest';
import { renderShell, startApp } from '../src/app';

describe('renderShell', () => {
  it('renders the global navigation and current title', () => {
    const root = document.createElement('div');
    renderShell(root, { kind: 'home' });
    expect(root.querySelector('header')?.textContent).toContain('国家级');
    expect(root.querySelector('h1')?.textContent).toContain('中国大陆政府机构官网导航');
  });

  it('renders a custom title as text rather than HTML', () => {
    const root = document.createElement('div');
    const title = '<img src="x" onerror="alert(1)">';

    renderShell(root, { kind: 'home' }, { title });

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.brand')?.textContent).toBe(title);
    expect(root.querySelector('h1')?.textContent).toBe(title);
  });
});

describe('startApp', () => {
  afterEach(() => {
    location.hash = '';
  });

  it('renders the initial route, updates on hashchange, and removes its listener on cleanup', () => {
    location.hash = '#/';
    const root = document.createElement('div');
    document.body.append(root);
    const cleanup = startApp(root);

    expect(root.querySelector('p')?.textContent).toContain('home');

    location.hash = '#/national';
    window.dispatchEvent(new Event('hashchange'));
    expect(root.querySelector('p')?.textContent).toContain('national');

    cleanup();
    location.hash = '#/region/110000';
    window.dispatchEvent(new Event('hashchange'));
    expect(root.querySelector('p')?.textContent).toContain('national');

    root.remove();
  });
});
