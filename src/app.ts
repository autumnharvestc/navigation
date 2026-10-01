import { loadNationalAgencies, loadRegions } from './data/client';
import { parseHashRoute } from './router';
import type { Route } from './router';
import { renderHomeView } from './views/home';
import { renderNationalView } from './views/national';

export type AppDependencies = {
  loadRegions: typeof loadRegions;
  loadNationalAgencies: typeof loadNationalAgencies;
};

export type AppOptions = {
  title?: string;
  dependencies?: AppDependencies;
};

const defaultDependencies: AppDependencies = {
  loadRegions,
  loadNationalAgencies,
};

function createLink(href: string, text: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  return link;
}

function renderFrame(root: HTMLElement, title: string): HTMLElement {
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

  const main = document.createElement('main');
  root.replaceChildren(header, main);

  return main;
}

function renderPlaceholder(main: HTMLElement, route: Route, title: string): void {
  const heading = document.createElement('h1');
  heading.textContent = title;

  const currentPage = document.createElement('p');
  currentPage.textContent = `当前页面：${route.kind}`;

  main.replaceChildren(heading, currentPage);
}

function renderLoading(main: HTMLElement): void {
  const loading = document.createElement('p');
  loading.className = 'status-message';
  loading.dataset.state = 'loading';
  loading.textContent = '正在加载';
  main.replaceChildren(loading);
}

function renderError(main: HTMLElement, retry: () => void): void {
  const message = document.createElement('p');
  message.className = 'status-message status-message--error';
  message.dataset.state = 'error';
  message.textContent = '数据加载失败，请稍后重试';

  const retryButton = document.createElement('button');
  retryButton.className = 'button button--primary';
  retryButton.type = 'button';
  retryButton.textContent = '重新加载';
  retryButton.addEventListener('click', retry);

  const actions = document.createElement('div');
  actions.className = 'retry-actions';
  actions.append(retryButton);

  main.replaceChildren(message, actions);
}

export function renderShell(root: HTMLElement, route: Route, options: AppOptions = {}): void {
  const title = options.title ?? '中国大陆政府机构官网导航';
  const main = renderFrame(root, title);
  renderPlaceholder(main, route, title);
}

export function startApp(root: HTMLElement, options: AppOptions = {}): () => void {
  const title = options.title ?? '中国大陆政府机构官网导航';
  const dependencies = options.dependencies ?? defaultDependencies;
  let renderToken = 0;
  let active = true;

  const renderRoute = async (): Promise<void> => {
    const token = ++renderToken;
    const route = parseHashRoute(location.hash);
    const main = renderFrame(root, title);

    if (route.kind === 'region' || route.kind === 'search') {
      renderPlaceholder(main, route, title);
      return;
    }

    renderLoading(main);

    try {
      if (route.kind === 'home') {
        const regions = await dependencies.loadRegions();
        if (!active || token !== renderToken) return;
        renderHomeView(main, regions);
        return;
      }

      const [, agencies] = await Promise.all([
        dependencies.loadRegions(),
        dependencies.loadNationalAgencies(),
      ]);
      if (!active || token !== renderToken) return;
      renderNationalView(main, agencies);
    } catch {
      if (!active || token !== renderToken) return;
      renderError(main, () => {
        void renderRoute();
      });
    }
  };

  const handleHashChange = () => {
    void renderRoute();
  };

  addEventListener('hashchange', handleHashChange);
  void renderRoute();

  return () => {
    active = false;
    renderToken += 1;
    removeEventListener('hashchange', handleHashChange);
  };
}
