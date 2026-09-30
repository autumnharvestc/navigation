import { parseHashRoute } from './router';
import type { Route } from './router';

export type AppOptions = { title?: string };

export function renderShell(root: HTMLElement, route: Route, options: AppOptions = {}): void {
  root.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#/">${options.title ?? '中国大陆政府机构官网导航'}</a>
      <nav aria-label="主导航">
        <a href="#/national">国家级</a>
        <a href="#/">省级目录</a>
        <a href="#/search">全域搜索</a>
      </nav>
    </header>
    <main><h1>${options.title ?? '中国大陆政府机构官网导航'}</h1><p>当前页面：${route.kind}</p></main>
  `;
}

export function startApp(root: HTMLElement, options: AppOptions = {}): () => void {
  const render = () => renderShell(root, parseHashRoute(location.hash), options);
  addEventListener('hashchange', render);
  render();
  return () => removeEventListener('hashchange', render);
}
