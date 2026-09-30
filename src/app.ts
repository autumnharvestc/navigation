import { parseHashRoute } from './router';
import type { Route } from './router';

export type AppOptions = { title?: string };

function createLink(href: string, text: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  return link;
}

export function renderShell(root: HTMLElement, route: Route, options: AppOptions = {}): void {
  const title = options.title ?? '中国大陆政府机构官网导航';

  const brand = createLink('#/', title);
  brand.className = 'brand';

  const navigation = document.createElement('nav');
  navigation.setAttribute('aria-label', '主导航');
  navigation.append(
    createLink('#/national', '国家级'),
    createLink('#/', '省级目录'),
    createLink('#/search', '全域搜索'),
  );

  const header = document.createElement('header');
  header.className = 'site-header';
  header.append(brand, navigation);

  const heading = document.createElement('h1');
  heading.textContent = title;

  const currentPage = document.createElement('p');
  currentPage.textContent = `当前页面：${route.kind}`;

  const main = document.createElement('main');
  main.append(heading, currentPage);

  root.replaceChildren(header, main);
}

export function startApp(root: HTMLElement, options: AppOptions = {}): () => void {
  const render = () => renderShell(root, parseHashRoute(location.hash), options);
  addEventListener('hashchange', render);
  render();
  return () => removeEventListener('hashchange', render);
}
