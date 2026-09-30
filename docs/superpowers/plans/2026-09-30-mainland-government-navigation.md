# Mainland Government Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可部署到 GitHub Pages 的中国大陆政府机构官网静态导航站，支持国家级与省、市、县分级浏览、全局搜索、数据校验和链接巡检。

**Architecture:** 使用 Vite + TypeScript 构建无后端单页应用，采用 hash 路由。人工维护的数据保存在 `data/`，构建前由脚本校验、复制并生成分片搜索索引；GitHub Actions 负责测试、部署和每周链接检查。

**Tech Stack:** Node.js 24、npm 11、Vite、TypeScript、Zod、MiniSearch、Vitest、happy-dom、Playwright、GitHub Actions、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-30-mainland-government-navigation-design.md`

## Global Constraints

- 仅覆盖中国大陆，不包含香港、澳门和台湾。
- 行政区层级固定为 `country | province | city | county`。
- 国家级稳定标识固定为 `CN`。
- 省级及以下使用国家标准行政区划代码字符串，例如 `110000`。
- 前端必须使用 hash 路由，不能依赖服务器 rewrite。
- 页面运行时不得从第三方 API 获取数据。
- 首屏 JS gzip 后不得超过 250 KB。
- `404`、`410` 才标记为 `invalid`；`403`、429、超时、DNS 和 TLS 异常标记为 `unknown`。
- 自动链接检查不得直接改写人工维护的数据文件。
- 所有新增行为先写失败测试，再写最小实现，测试通过后提交。
- 使用 Node.js 24 与 npm 11；锁定依赖版本并提交 `package-lock.json`。
- 所有命令均在仓库根目录 `D:\workspace260609\project-3\gov-nav` 执行。

---

### Task 1: 初始化 Vite、TypeScript、测试与 hash 路由

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/app.ts`
- Create: `src/router.ts`
- Create: `src/styles.css`
- Create: `tests/router.test.ts`
- Create: `tests/app.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `parseHashRoute(hash: string): Route`、`toHash(route: Route): string`、`startApp(root: HTMLElement, options?: AppOptions): () => void`。
- Produces route union：`{ kind: 'home' } | { kind: 'national' } | { kind: 'region'; regionCode: string } | { kind: 'search'; query: string }`。

- [ ] **Step 1: 写入项目配置与依赖**

`package.json`:

```json
{
  "name": "gov-nav",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24", "npm": ">=11" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

运行：

```powershell
npm install zod minisearch
npm install -D vite typescript vitest happy-dom eslint @eslint/js typescript-eslint globals prettier tsx @types/node
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "eslint.config.js"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = process.env.GITHUB_ACTIONS && repositoryName
  ? `/${repositoryName}/`
  : '/';

export default defineConfig({
  base: githubPagesBase,
  build: { target: 'es2022' },
  test: { environment: 'happy-dom', coverage: { reporter: ['text', 'html'] } }
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'public/data', 'public/search-index'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], languageOptions: { globals: { ...globals.browser, ...globals.node } } }
);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "semi": true, "printWidth": 100 }
```

`.gitignore`:

```gitignore
node_modules/
dist/
coverage/
playwright-report/
test-results/
public/data/
public/search-index/
```

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="中国大陆政府机构官网导航" />
    <title>中国大陆政府机构官网导航</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写入失败的 router 测试**

`tests/router.test.ts`:

```ts
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
```

- [ ] **Step 3: 写入失败的 app 测试**

`tests/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderShell } from '../src/app';

describe('renderShell', () => {
  it('renders the global navigation and current title', () => {
    const root = document.createElement('div');
    renderShell(root, { kind: 'home' });
    expect(root.querySelector('header')?.textContent).toContain('国家级');
    expect(root.querySelector('h1')?.textContent).toContain('中国大陆政府机构官网导航');
  });
});
```

- [ ] **Step 4: 运行测试并确认失败**

```powershell
npm test -- --run tests/router.test.ts tests/app.test.ts
```

预期：失败，提示找不到 `src/router.ts` 和 `src/app.ts`。

- [ ] **Step 5: 实现路由与应用壳**

`src/router.ts`:

```ts
export type Route =
  | { kind: 'home' }
  | { kind: 'national' }
  | { kind: 'region'; regionCode: string }
  | { kind: 'search'; query: string };

export function parseHashRoute(hash: string): Route {
  const value = hash.replace(/^#/, '') || '/';
  if (value === '/') return { kind: 'home' };
  if (value === '/national') return { kind: 'national' };
  const region = value.match(/^\/region\/([^/?#]+)$/);
  if (region?.[1]) return { kind: 'region', regionCode: decodeURIComponent(region[1]) };
  const search = value.match(/^\/search(?:\?q=([^&]*))?$/);
  if (search) return { kind: 'search', query: decodeURIComponent(search[1] ?? '') };
  return { kind: 'home' };
}

export function toHash(route: Route): string {
  if (route.kind === 'home') return '#/';
  if (route.kind === 'national') return '#/national';
  if (route.kind === 'region') return `#/region/${encodeURIComponent(route.regionCode)}`;
  return `#/search?q=${encodeURIComponent(route.query)}`;
}
```

`src/app.ts`:

```ts
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
```

在 `src/app.ts` 顶部同时导入 `parseHashRoute`。`src/main.ts`:

```ts
import './styles.css';
import { startApp } from './app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app');
startApp(root);
```

`src/styles.css` 先提供可读基础样式、响应式容器、可见焦点和基础颜色变量。

- [ ] **Step 6: 运行测试、类型检查和构建**

```powershell
npm test -- --run tests/router.test.ts tests/app.test.ts
npm run typecheck
npm run lint
npm run build
```

预期：全部通过，`dist/` 生成。

- [ ] **Step 7: 提交**

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts eslint.config.js .prettierrc.json .gitignore index.html src tests
git commit -m "chore: scaffold static navigation app"
```

---

### Task 2: 定义数据契约与完整性校验

**Files:**
- Create: `src/domain/schema.ts`
- Create: `src/domain/validate.ts`
- Create: `scripts/validate-data.ts`
- Create: `tests/validate-data.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 的 TypeScript 构建配置。
- Produces: `Region`、`AgencyRecord`、`LinkStatus`、`AgencyCategory` 类型。
- Produces: `validateDataset(dataset: Dataset): ValidationResult`。
- Produces npm script：`validate:data`。

- [ ] **Step 1: 写入失败的校验测试**

`tests/validate-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/domain/validate';

const country = {
  code: 'CN', name: '中国大陆', level: 'country' as const, parentCode: null, sort: 0
};
const province = {
  code: '110000', name: '北京市', level: 'province' as const, parentCode: 'CN', sort: 1
};
const agency = {
  id: '110000-government-beijing-gov-cn',
  regionCode: '110000',
  name: '北京市人民政府',
  siteName: '北京市人民政府门户网站',
  url: 'https://www.beijing.gov.cn/',
  category: 'government' as const,
  sourceUrl: 'https://www.beijing.gov.cn/'
};

describe('validateDataset', () => {
  it('accepts a valid hierarchy and agency', () => {
    const result = validateDataset({ regions: [country, province], agencies: [agency] });
    expect(result.errors).toEqual([]);
  });

  it('rejects duplicate ids, duplicate urls and orphan regions', () => {
    const orphan = { ...province, code: '110100', name: '某市', level: 'city' as const, parentCode: '999999' };
    const result = validateDataset({
      regions: [country, province, orphan],
      agencies: [agency, { ...agency, id: 'duplicate-url' }, { ...agency, id: 'duplicate-id' }]
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate agency url'),
      expect.stringContaining('missing parent 999999')
    ]));
  });

  it('rejects invalid urls, unknown categories and wrong parent levels', () => {
    const wrongLevel = { ...province, code: '110100', name: '某市', level: 'city' as const, parentCode: '110000' };
    const result = validateDataset({
      regions: [country, province, wrongLevel],
      agencies: [{ ...agency, url: 'not-a-url', category: 'unknown' as never }]
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('url'),
      expect.stringContaining('category'),
      expect.stringContaining('parent 110000 must have level province')
    ]));
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
npm test -- --run tests/validate-data.test.ts
```

预期：失败，提示找不到 `src/domain/validate.ts`。

- [ ] **Step 3: 实现 Schema 与校验器**

`src/domain/schema.ts`:

```ts
import { z } from 'zod';

export const agencyCategorySchema = z.enum([
  'party', 'people_congress', 'government', 'cppcc', 'court',
  'procuratorate', 'mass_org', 'department', 'other'
]);

export const regionSchema = z.object({
  code: z.string().regex(/^(CN|\d{6})$/),
  name: z.string().min(1),
  level: z.enum(['country', 'province', 'city', 'county']),
  parentCode: z.string().regex(/^(CN|\d{6})$/).nullable(),
  sort: z.number().int().nonnegative()
});

export const agencyRecordSchema = z.object({
  id: z.string().min(1),
  regionCode: z.string().regex(/^(CN|\d{6})$/),
  name: z.string().min(1),
  siteName: z.string().min(1),
  url: z.string().url().refine((value) => /^https?:\/\//.test(value), 'url must use http or https'),
  category: agencyCategorySchema,
  subcategory: z.string().min(1).optional(),
  sourceUrl: z.string().url().refine((value) => /^https?:\/\//.test(value), 'sourceUrl must use http or https'),
  tags: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional()
});

export const linkStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['valid', 'invalid', 'unknown']),
  httpStatus: z.number().int().optional(),
  checkedAt: z.string().datetime(),
  detail: z.string().min(1).optional()
});

export type Region = z.infer<typeof regionSchema>;
export type AgencyRecord = z.infer<typeof agencyRecordSchema>;
export type LinkStatus = z.infer<typeof linkStatusSchema>;
export type AgencyCategory = z.infer<typeof agencyCategorySchema>;
```

`src/domain/validate.ts`:

```ts
import { agencyRecordSchema, regionSchema, type AgencyRecord, type Region } from './schema';

export type Dataset = { regions: Region[]; agencies: AgencyRecord[] };
export type ValidationResult = { errors: string[] };

export function validateDataset(dataset: Dataset): ValidationResult {
  const errors: string[] = [];
  const regions = new Map<string, Region>();
  const expectedParentLevel = {
    province: 'country', city: 'province', county: 'city'
  } as const;

  dataset.regions.forEach((region, index) => {
    const parsed = regionSchema.safeParse(region);
    if (!parsed.success) errors.push(`region[${index}]: ${parsed.error.message}`);
    if (regions.has(region.code)) errors.push(`duplicate region code ${region.code}`);
    regions.set(region.code, region);
  });

  dataset.regions.forEach((region) => {
    if (region.code === 'CN') {
      if (region.level !== 'country' || region.parentCode !== null) {
        errors.push('region CN must be the country root with no parent');
      }
      return;
    }
    if (!region.parentCode) {
      errors.push(`region ${region.code}: missing parent`);
      return;
    }
    const parent = regions.get(region.parentCode);
    if (!parent) {
      errors.push(`region ${region.code}: missing parent ${region.parentCode}`);
      return;
    }
    const expected = expectedParentLevel[region.level as keyof typeof expectedParentLevel];
    if (expected && parent.level !== expected) {
      errors.push(`region ${region.code}: parent ${parent.code} must have level ${expected}`);
    }
  });

  const agencyIds = new Set<string>();
  const agencyUrls = new Set<string>();
  dataset.agencies.forEach((agency, index) => {
    const parsed = agencyRecordSchema.safeParse(agency);
    if (!parsed.success) errors.push(`agency[${index}]: ${parsed.error.message}`);
    if (agencyIds.has(agency.id)) errors.push(`duplicate agency id ${agency.id}`);
    agencyIds.add(agency.id);
    const normalizedUrl = agency.url.replace(/\/$/, '').toLowerCase();
    if (agencyUrls.has(normalizedUrl)) errors.push(`duplicate agency url ${agency.url}`);
    agencyUrls.add(normalizedUrl);
    if (!regions.has(agency.regionCode)) {
      errors.push(`agency ${agency.id}: missing region ${agency.regionCode}`);
    }
  });

  return { errors };
}
```

`scripts/validate-data.ts` 使用 `node:fs/promises` 读取 `data/regions.json`、`data/national.json` 和 `data/provinces/*.json`，合并数据后调用 `validateDataset`。有错误时逐行输出到 `stderr` 并以退出码 1 结束；无错误时输出 `data validation passed`。

在 `package.json` 的 scripts 增加：

```json
"validate:data": "tsx scripts/validate-data.ts"
```

- [ ] **Step 4: 运行测试并确认通过**

```powershell
npm test -- --run tests/validate-data.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/domain scripts/validate-data.ts tests/validate-data.test.ts package.json package-lock.json
git commit -m "feat: add government data schema and validation"
```

---
### Task 3: 建立首批行政区与国家级数据，并生成静态发布数据

**Files:**
- Create: `data/regions.json`
- Create: `data/national.json`
- Create: `data/provinces/110000.json`
- Create: `data/provinces/README.md`
- Create: `src/data/build-index.ts`
- Create: `scripts/prepare-public-data.ts`
- Create: `tests/build-index.test.ts`
- Modify: `package.json`
- Modify: `scripts/validate-data.ts`

**Interfaces:**
- Consumes: Task 2 的 `validateDataset`、`Region`、`AgencyRecord`。
- Produces: `toSearchDocument(agency: AgencyRecord, region: Region): SearchDocument`。
- Produces: `preparePublicData(rootDir: string): Promise<PrepareResult>`。
- Produces npm scripts：`prepare:data`、`dev`、`build`。

- [ ] **Step 1: 写入失败的索引转换测试**

`tests/build-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toSearchDocument } from '../src/data/build-index';

describe('toSearchDocument', () => {
  it('creates a compact, searchable and serializable record', () => {
    const document = toSearchDocument(
      {
        id: '110000-government-beijing', regionCode: '110000', name: '北京市人民政府',
        siteName: '北京市人民政府门户网站', url: 'https://www.beijing.gov.cn/',
        category: 'government', sourceUrl: 'https://www.beijing.gov.cn/'
      },
      { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 }
    );

    expect(document).toEqual({
      id: '110000-government-beijing', name: '北京市人民政府', siteName: '北京市人民政府门户网站',
      regionCode: '110000', regionName: '北京市', level: 'province',
      category: 'government', domain: 'www.beijing.gov.cn', url: 'https://www.beijing.gov.cn/'
    });
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
npm test -- --run tests/build-index.test.ts
```

预期：失败，提示找不到 `src/data/build-index.ts`。

- [ ] **Step 3: 实现索引转换**

`src/data/build-index.ts`:

```ts
import type { AgencyRecord, Region } from '../domain/schema';

export type SearchDocument = {
  id: string; name: string; siteName: string; regionCode: string; regionName: string;
  level: Region['level']; category: AgencyRecord['category']; domain: string; url: string;
};

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

export function toSearchDocument(agency: AgencyRecord, region: Region): SearchDocument {
  return {
    id: agency.id,
    name: agency.name,
    siteName: agency.siteName,
    regionCode: agency.regionCode,
    regionName: region.name,
    level: region.level,
    category: agency.category,
    domain: new URL(agency.url).hostname,
    url: agency.url
  };
}
```

- [ ] **Step 4: 创建真实数据文件**

`data/regions.json` 必须至少包含以下 32 条记录。国家记录固定为：

```json
{ "code": "CN", "name": "中国大陆", "level": "country", "parentCode": null, "sort": 0 }
```

31 个省级记录按以下顺序设置 `sort`，`parentCode` 均为 `CN`：

```text
1  110000 北京市
2  120000 天津市
3  130000 河北省
4  140000 山西省
5  150000 内蒙古自治区
6  210000 辽宁省
7  220000 吉林省
8  230000 黑龙江省
9  310000 上海市
10 320000 江苏省
11 330000 浙江省
12 340000 安徽省
13 350000 福建省
14 360000 江西省
15 370000 山东省
16 410000 河南省
17 420000 湖北省
18 430000 湖南省
19 440000 广东省
20 450000 广西壮族自治区
21 460000 海南省
22 500000 重庆市
23 510000 四川省
24 520000 贵州省
25 530000 云南省
26 540000 西藏自治区
27 610000 陕西省
28 620000 甘肃省
29 630000 青海省
30 640000 宁夏回族自治区
31 650000 新疆维吾尔自治区
```

`data/national.json` 初始包含以下 5 条真实记录，URL 与 `sourceUrl` 使用该机关当前官网：

```json
[
  {
    "id": "CN-government-gov-cn", "regionCode": "CN", "name": "中华人民共和国中央人民政府",
    "siteName": "中国政府网", "url": "https://www.gov.cn/", "category": "government",
    "subcategory": "国务院", "sourceUrl": "https://www.gov.cn/"
  },
  {
    "id": "CN-people_congress-npc-gov-cn", "regionCode": "CN", "name": "全国人民代表大会",
    "siteName": "中国人大网", "url": "http://www.npc.gov.cn/", "category": "people_congress",
    "sourceUrl": "http://www.npc.gov.cn/"
  },
  {
    "id": "CN-cppcc-cppcc-gov-cn", "regionCode": "CN", "name": "中国人民政治协商会议全国委员会",
    "siteName": "中国政协网", "url": "http://www.cppcc.gov.cn/", "category": "cppcc",
    "sourceUrl": "http://www.cppcc.gov.cn/"
  },
  {
    "id": "CN-court-court-gov-cn", "regionCode": "CN", "name": "最高人民法院",
    "siteName": "中华人民共和国最高人民法院", "url": "https://www.court.gov.cn/",
    "category": "court", "sourceUrl": "https://www.court.gov.cn/"
  },
  {
    "id": "CN-procuratorate-spp-gov-cn", "regionCode": "CN", "name": "最高人民检察院",
    "siteName": "最高人民检察院", "url": "https://www.spp.gov.cn/", "category": "procuratorate",
    "sourceUrl": "https://www.spp.gov.cn/"
  }
]
```

`data/provinces/110000.json` 初始包含：

```json
[
  {
    "id": "110000-government-beijing-gov-cn", "regionCode": "110000",
    "name": "北京市人民政府", "siteName": "北京市人民政府门户网站",
    "url": "https://www.beijing.gov.cn/", "category": "government",
    "sourceUrl": "https://www.beijing.gov.cn/"
  }
]
```

`data/provinces/README.md` 必须说明：文件名使用省级六位行政区划代码；只保存 `regionCode` 属于该省的数据；新增官网必须填写可追溯的 `sourceUrl`；无法确认的记录不得入库。

- [ ] **Step 5: 实现发布数据准备脚本**

`scripts/prepare-public-data.ts` 必须：

1. 读取并合并 `data/regions.json`、`data/national.json` 和 `data/provinces/*.json`。
2. 调用 `validateDataset`；有错误时输出错误并以退出码 1 结束。
3. 使用 `node:fs/promises.rm(..., { recursive: true, force: true })` 清空 `public/data` 与 `public/search-index`。
4. 将原始数据复制为 `public/data/regions.json`、`public/data/national.json` 和 `public/data/provinces/<省级代码>.json`。
5. 按数据所在分片生成 `public/search-index/manifest.json` 和每个分片的文档数组。
6. manifest 固定格式：

```ts
type SearchManifest = {
  generatedAt: string;
  shards: Array<{ regionCode: 'CN' | string; path: string; count: number }>;
};
```

7. `prepare:data` npm script 固定为 `tsx scripts/prepare-public-data.ts`。
8. `dev` script 改为 `npm run prepare:data && vite`。
9. `build` script 改为 `npm run prepare:data && tsc --noEmit && vite build`。

- [ ] **Step 6: 运行索引测试、数据校验和构建**

```powershell
npm test -- --run tests/build-index.test.ts
npm run validate:data
npm run build
```

预期：测试通过；输出 `data validation passed`；`public/data/regions.json`、`public/search-index/manifest.json` 与 `dist/` 均存在。

- [ ] **Step 7: 提交**

```powershell
git add data src/data/build-index.ts scripts tests/build-index.test.ts package.json package-lock.json
git commit -m "feat: add initial government dataset and static data build"
```

---

### Task 4: 实现数据仓库与客户端搜索

**Files:**
- Create: `src/data/client.ts`
- Create: `src/data/search.ts`
- Create: `tests/data-client.test.ts`
- Create: `tests/search.test.ts`
- Modify: `src/data/build-index.ts`

**Interfaces:**
- Consumes: `SearchDocument`、`Region`、`AgencyRecord`、`LinkStatus`。
- Produces: `loadRegions(fetchImpl?): Promise<Region[]>`。
- Produces: `loadNationalAgencies(fetchImpl?): Promise<AgencyRecord[]>`。
- Produces: `loadProvinceAgencies(provinceCode: string, fetchImpl?): Promise<AgencyRecord[]>`。
- Produces: `loadLinkStatus(fetchImpl?): Promise<Map<string, LinkStatus>>`。
- Produces: `loadSearchDocuments(fetchImpl?): Promise<SearchDocument[]>`。
- Produces: `createSearchEngine(documents: SearchDocument[]): SearchEngine`。
- Produces: `searchDocuments(engine: SearchEngine, query: string, filters: SearchFilters): SearchDocument[]`。

- [ ] **Step 1: 写入失败的仓库测试**

`tests/data-client.test.ts` 使用 `vi.fn()` 模拟 `fetch`，覆盖：

```ts
expect(await loadRegions(fetchMock)).toEqual([region]);
expect(fetchMock).toHaveBeenCalledWith('/data/regions.json');
expect(await loadProvinceAgencies('110000', fetchMock)).toEqual([agency]);
expect(fetchMock).toHaveBeenCalledWith('/data/provinces/110000.json');
```

再断言：HTTP 非 2xx 时抛出 `DataLoadError`，错误消息包含请求路径；缺失的 `data/generated/link-status.json` 返回空 Map；成功时按 `id` 建 Map。

- [ ] **Step 2: 写入失败的搜索测试**

`tests/search.test.ts` 构造以下文档并断言搜索结果：

```ts
const documents = [
  { id: 'a', name: '北京市人民政府', siteName: '北京市人民政府门户网站', regionCode: '110000',
    regionName: '北京市', level: 'province', category: 'government', domain: 'www.beijing.gov.cn',
    url: 'https://www.beijing.gov.cn/' },
  { id: 'b', name: '北京市高级人民法院', siteName: '北京市高级人民法院', regionCode: '110000',
    regionName: '北京市', level: 'province', category: 'court', domain: 'bjgy.bjcourt.gov.cn',
    url: 'https://bjgy.bjcourt.gov.cn/' }
] satisfies SearchDocument[];
```

断言：

```ts
expect(searchDocuments(createSearchEngine(documents), '北京 法院', {})).toEqual([documents[1]]);
expect(searchDocuments(createSearchEngine(documents), '', { level: 'province', category: 'government' })).toEqual([documents[0]]);
expect(searchDocuments(createSearchEngine(documents), 'bjcourt', {})).toEqual([documents[1]]);
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- --run tests/data-client.test.ts tests/search.test.ts
```

预期：失败，提示找不到 `src/data/client.ts` 或 `src/data/search.ts`。

- [ ] **Step 4: 实现数据仓库**

`src/data/client.ts` 导出 `DataLoadError`，并使用 `import.meta.env.BASE_URL` 组合路径。路径去重斜杠后传给 `fetchImpl`。`loadProvinceAgencies` 遇到 `404` 返回空数组，以支持尚未补全的省级数据框架；其他非 2xx 响应抛出 `DataLoadError`。`loadSearchDocuments` 先读取 manifest，再通过 `Promise.all` 加载所有分片并合并；该函数只在搜索页调用，首页不得调用它。`loadLinkStatus` 遇到 `404` 返回空 Map，其他错误抛出 `DataLoadError`。

- [ ] **Step 5: 实现 MiniSearch 搜索**

`src/data/search.ts` 使用：

```ts
const engine = new MiniSearch<SearchDocument>({
  fields: ['name', 'siteName', 'regionName', 'domain'],
  storeFields: ['id'],
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3, siteName: 2, regionName: 1, domain: 1 } }
});
```

空查询返回全部文档；非空查询按 MiniSearch 排名返回。`SearchFilters` 类型固定为：

```ts
export type SearchFilters = {
  level?: Region['level'];
  category?: AgencyRecord['category'];
  regionCode?: string;
};
```

- [ ] **Step 6: 运行测试与类型检查**

```powershell
npm test -- --run tests/data-client.test.ts tests/search.test.ts
npm run typecheck
```

预期：全部 PASS。

- [ ] **Step 7: 提交**

```powershell
git add src/data tests/data-client.test.ts tests/search.test.ts
git commit -m "feat: add data client and client-side search"
```

---
### Task 5: 实现首页、国家级页与通用机关卡片

**Files:**
- Create: `src/ui/dom.ts`
- Create: `src/components/agency-card.ts`
- Create: `src/views/home.ts`
- Create: `src/views/national.ts`
- Create: `tests/home-view.test.ts`
- Create: `tests/national-view.test.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `Region`、`AgencyRecord`、`toHash`。
- Produces: `renderHomeView(root: HTMLElement, regions: Region[]): void`。
- Produces: `renderNationalView(root: HTMLElement, agencies: AgencyRecord[]): void`。
- Produces: `renderAgencyCard(agency: AgencyRecord): HTMLElement`。
- Produces: `escapeHtml(value: string): string`。

- [ ] **Step 1: 写入失败的首页测试**

`tests/home-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHomeView } from '../src/views/home';

describe('renderHomeView', () => {
  it('links to national and province directories and shows coverage', () => {
    const root = document.createElement('div');
    renderHomeView(root, [
      { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
      { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 }
    ]);

    expect(root.querySelector('a[href="#/national"]')?.textContent).toContain('国家级');
    expect(root.querySelector('a[href="#/region/110000"]')?.textContent).toContain('北京市');
    expect(root.querySelector('[data-testid="province-count"]')?.textContent).toBe('31');
  });
});
```

- [ ] **Step 2: 写入失败的国家级页测试**

`tests/national-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderNationalView } from '../src/views/national';

describe('renderNationalView', () => {
  it('groups agencies by category and safely opens official sites', () => {
    const root = document.createElement('div');
    renderNationalView(root, [{
      id: 'CN-government-gov-cn', regionCode: 'CN', name: '中华人民共和国中央人民政府',
      siteName: '中国政府网', url: 'https://www.gov.cn/', category: 'government',
      sourceUrl: 'https://www.gov.cn/'
    }]);

    expect(root.querySelector('h2[data-category="government"]')?.textContent).toContain('政府');
    const link = root.querySelector<HTMLAnchorElement>('a[href="https://www.gov.cn/"]');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
  });
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- --run tests/home-view.test.ts tests/national-view.test.ts
```

预期：失败，提示找不到视图模块。

- [ ] **Step 4: 实现安全 DOM 工具与机关卡片**

`src/ui/dom.ts`:

```ts
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]!);
}

export function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}
```

`src/components/agency-card.ts` 创建 `article`，显示机关名称、网站名称、域名、类别和“打开官网 / 复制网址”按钮。官网链接固定设置 `target="_blank"`、`rel="noopener noreferrer"`；复制按钮使用 `navigator.clipboard.writeText(agency.url)`，失败时将按钮文字改为“复制失败”。

- [ ] **Step 5: 实现首页和国家级页**

`renderHomeView`：

- 标题固定为“中国大陆政府机构官网导航”。
- 提供 `href="#/search"` 的全局搜索入口。
- 提供 `href="#/national"` 的国家级入口。
- 渲染 31 个省级链接；`province-count` 文本固定等于 `regions.filter((region) => region.level === 'province').length`。
- 数量不足 31 时在页面显示“数据框架已建立，数据待补全”，但仍渲染现有省份。

`renderNationalView`：

- 类别顺序固定为 `party`、`people_congress`、`government`、`cppcc`、`court`、`procuratorate`、`mass_org`、`department`、`other`。
- 中文标题映射固定为：党中央、全国人大、政府、全国政协、法院、检察院、群团、部门、其他。
- 空类别不渲染；所有类别为空时显示“数据框架已建立，数据待补全”。

- [ ] **Step 6: 接入异步路由**

修改 `src/app.ts`，使 `AppOptions` 接收：

```ts
export type AppDependencies = {
  loadRegions: typeof loadRegions;
  loadNationalAgencies: typeof loadNationalAgencies;
};
```

默认依赖使用真实数据客户端，测试可注入 mock。路由进入首页时加载并渲染 `regions`；进入国家级页时并行加载 `regions` 和 `national.json`。加载期间显示“正在加载”；异常时显示错误文本与“重新加载”按钮，点击按钮重新调用当前路由渲染函数。

- [ ] **Step 7: 运行测试、类型检查与浏览器冒烟测试**

```powershell
npm test -- --run tests/home-view.test.ts tests/national-view.test.ts
npm run typecheck
npm run dev
```

浏览器打开首页，确认 31 个省级入口与国家级入口可见；进入 `#/national`，确认中国政府网链接能打开且不接管当前页。

- [ ] **Step 8: 提交**

```powershell
git add src/components src/views src/ui src/app.ts src/styles.css tests/home-view.test.ts tests/national-view.test.ts
git commit -m "feat: add home and national directory views"
```

---

### Task 6: 实现省、市、县逐级浏览与面包屑

**Files:**
- Create: `src/domain/region-tree.ts`
- Create: `src/components/breadcrumbs.ts`
- Create: `src/views/region.ts`
- Create: `tests/region-tree.test.ts`
- Create: `tests/region-view.test.ts`
- Modify: `src/app.ts`
- Modify: `src/data/client.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `Region`、`AgencyRecord`、`renderAgencyCard`、`toHash`。
- Produces: `createRegionIndex(regions: Region[]): RegionIndex`。
- Produces `RegionIndex` 方法：`get(code: string): Region | undefined`、`children(code: string): Region[]`、`ancestors(code: string): Region[]`、`provinceOf(code: string): Region | undefined`。
- Produces: `renderRegionView(root, { region, ancestors, children, agencies, statusMap }): void`。

- [ ] **Step 1: 写入失败的行政区树测试**

`tests/region-tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRegionIndex } from '../src/domain/region-tree';

const regions = [
  { code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 },
  { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
  { code: '110100', name: '市辖区', level: 'city', parentCode: '110000', sort: 1 },
  { code: '110101', name: '东城区', level: 'county', parentCode: '110100', sort: 1 }
] as const;

describe('createRegionIndex', () => {
  it('finds children and ancestors in order', () => {
    const index = createRegionIndex([...regions]);
    expect(index.children('CN').map((item) => item.code)).toEqual(['110000']);
    expect(index.ancestors('110101').map((item) => item.code)).toEqual(['CN', '110000', '110100']);
  });

  it('finds the province owner for city and county codes', () => {
    const index = createRegionIndex([...regions]);
    expect(index.provinceOf('110101')?.code).toBe('110000');
    expect(index.provinceOf('110000')?.code).toBe('110000');
  });
});
```

- [ ] **Step 2: 写入失败的地区页测试**

`tests/region-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderRegionView } from '../src/views/region';

describe('renderRegionView', () => {
  it('shows breadcrumbs, child regions and agency links', () => {
    const root = document.createElement('div');
    renderRegionView(root, {
      region: { code: '110000', name: '北京市', level: 'province', parentCode: 'CN', sort: 1 },
      ancestors: [{ code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 }],
      children: [{ code: '110100', name: '市辖区', level: 'city', parentCode: '110000', sort: 1 }],
      agencies: [{
        id: '110000-government-beijing-gov-cn', regionCode: '110000', name: '北京市人民政府',
        siteName: '北京市人民政府门户网站', url: 'https://www.beijing.gov.cn/',
        category: 'government', sourceUrl: 'https://www.beijing.gov.cn/'
      }],
      statusMap: new Map()
    });

    expect(root.querySelector('nav[aria-label="面包屑"]')?.textContent).toContain('中国大陆');
    expect(root.querySelector('a[href="#/region/110100"]')?.textContent).toContain('市辖区');
    expect(root.querySelector('a[href="https://www.beijing.gov.cn/"]')).not.toBeNull();
  });

  it('explains that an empty directory is waiting for data', () => {
    const root = document.createElement('div');
    renderRegionView(root, {
      region: { code: '120000', name: '天津市', level: 'province', parentCode: 'CN', sort: 2 },
      ancestors: [{ code: 'CN', name: '中国大陆', level: 'country', parentCode: null, sort: 0 }],
      children: [], agencies: [], statusMap: new Map()
    });
    expect(root.textContent).toContain('数据框架已建立，数据待补全');
  });
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- --run tests/region-tree.test.ts tests/region-view.test.ts
```

预期：失败，提示模块不存在。

- [ ] **Step 4: 实现行政区索引**

`createRegionIndex` 在构造时建立 `Map<string, Region>`，并对子节点按 `sort`、再按 `code` 升序排序。`ancestors` 从当前节点的父级向上收集后反转，返回从国家级到直接父级的顺序。`provinceOf` 对 `province` 返回自身，对 `city`、`county` 沿父级上溯到 `level === 'province'`，找不到时返回 `undefined`。

- [ ] **Step 5: 实现面包屑和地区页**

`renderBreadcrumbs` 输出 `nav[aria-label="面包屑"]`；国家级链接到 `#/`，其他祖先链接到 `#/region/<code>`，当前地区为纯文本并带 `aria-current="page"`。

`renderRegionView` 显示：

- 面包屑。
- 当前地区名称与层级标签。
- 下一级行政区列表。
- 当前地区机关目录，按固定类别排序。
- 当前地区没有机关时显示“数据框架已建立，数据待补全”。
- 数据加载失败时由 `app.ts` 统一渲染错误与重试按钮。

- [ ] **Step 6: 接入地区路由**

`app.ts` 的地区路由执行：

1. 加载 `regions`。
2. 用 `createRegionIndex` 查找 `regionCode`；不存在时渲染“地区不存在”并提供返回首页链接。
3. 对 `110000` 直接加载 `data/provinces/110000.json`；对城市或县区通过 `provinceOf` 找到省级代码后加载对应省份分片。
4. 加载 `link-status.json`。
5. 将 `region`、祖先、子节点、机关记录和状态 Map 传给 `renderRegionView`。

- [ ] **Step 7: 运行测试与手动验证**

```powershell
npm test -- --run tests/region-tree.test.ts tests/region-view.test.ts
npm run typecheck
npm run dev
```

依次访问 `#/region/110000`，确认面包屑、北京市人民政府链接和空数据提示均正常。

- [ ] **Step 8: 提交**

```powershell
git add src/domain/region-tree.ts src/components/breadcrumbs.ts src/views/region.ts src/app.ts src/data/client.ts src/styles.css tests/region-tree.test.ts tests/region-view.test.ts
git commit -m "feat: add regional hierarchy navigation"
```

---
### Task 7: 实现全局搜索、筛选、链接状态与复制网址

**Files:**
- Create: `src/components/status-badge.ts`
- Create: `src/views/search.ts`
- Create: `tests/status-badge.test.ts`
- Create: `tests/search-view.test.ts`
- Modify: `src/components/agency-card.ts`
- Modify: `src/app.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `SearchDocument`、`LinkStatus`、`createSearchEngine`、`searchDocuments`、`renderAgencyCard`。
- Produces: `renderStatusBadge(status?: LinkStatus): HTMLElement`。
- Produces: `statusLabel(status?: LinkStatus): string`。
- Produces: `renderSearchView(root, options: SearchViewOptions): void`。
- Produces `SearchViewOptions`：

```ts
type SearchViewOptions = {
  documents: SearchDocument[];
  statusMap: Map<string, LinkStatus>;
  initialQuery: string;
};
```

- [ ] **Step 1: 写入失败的状态标签测试**

`tests/status-badge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { statusLabel } from '../src/components/status-badge';

describe('statusLabel', () => {
  it('never describes an unknown link as broken', () => {
    expect(statusLabel(undefined)).toBe('待核验');
    expect(statusLabel({ id: 'a', status: 'unknown', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe('待核验');
    expect(statusLabel({ id: 'a', status: 'valid', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe('正常');
    expect(statusLabel({ id: 'a', status: 'invalid', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe('失效');
  });
});
```

- [ ] **Step 2: 写入失败的搜索页测试**

`tests/search-view.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderSearchView } from '../src/views/search';

afterEach(() => vi.useRealTimers());

describe('renderSearchView', () => {
  it('filters by query and category, and updates the hash after debounce', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    renderSearchView(root, {
      documents: [
        { id: 'gov', name: '北京市人民政府', siteName: '北京市人民政府门户网站', regionCode: '110000',
          regionName: '北京市', level: 'province', category: 'government',
          domain: 'www.beijing.gov.cn', url: 'https://www.beijing.gov.cn/' },
        { id: 'court', name: '北京市高级人民法院', siteName: '北京市高级人民法院', regionCode: '110000',
          regionName: '北京市', level: 'province', category: 'court',
          domain: 'bjgy.bjcourt.gov.cn', url: 'https://bjgy.bjcourt.gov.cn/' }
      ],
      statusMap: new Map([['court', { id: 'court', status: 'valid', checkedAt: '2026-09-30T00:00:00.000Z' }]]),
      initialQuery: '法院'
    });

    expect(root.querySelectorAll('[data-testid="search-result"]')).toHaveLength(1);
    const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = '人民政府';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(location.hash).toBe('#/search?q=%E4%BA%BA%E6%B0%91%E6%94%BF%E5%BA%9C');
  });
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- --run tests/status-badge.test.ts tests/search-view.test.ts
```

预期：失败，提示模块不存在。

- [ ] **Step 4: 实现状态标签**

`statusLabel` 固定映射：

```ts
undefined -> 待核验
unknown -> 待核验
valid -> 正常
invalid -> 失效
```

`renderStatusBadge` 创建带 `data-status` 的 `span`，同时包含可读文字，不允许只用颜色表达状态。`agency-card.ts` 增加可选 `status?: LinkStatus` 参数并渲染状态标签。

- [ ] **Step 5: 实现搜索页**

`renderSearchView` 必须：

- 渲染 `input[type="search"]`，初始值为 `initialQuery`。
- 用 `createSearchEngine(documents)` 建立内存索引。
- 提供层级和类别两个 `select` 筛选器。
- 每个结果包裹 `article[data-testid="search-result"]`，并复用机关卡片。
- 输入后 200ms 更新 `location.hash = toHash({ kind: 'search', query: value })`。
- 无结果时显示“未找到匹配的官方网站”以及“尝试缩短关键词或清除筛选条件”。
- 搜索页加载失败时由 `app.ts` 统一显示错误与重试按钮。

- [ ] **Step 6: 接入搜索路由并保持首屏性能**

`app.ts` 仅在 `route.kind === 'search'` 时调用 `loadSearchDocuments` 和 `loadLinkStatus`。断言 `loadSearchDocuments` 不在首页或地区路由调用。搜索页构建完成后，首屏 JS 仍必须满足 Task 9 的 gzip 预算。

- [ ] **Step 7: 运行测试、类型检查和生产预览**

```powershell
npm test -- --run tests/status-badge.test.ts tests/search-view.test.ts
npm run typecheck
npm run build
npm run preview
```

访问 `#/search?q=人民法院`，确认结果、筛选、状态标签和复制按钮可用；无结果时确认显示空状态。

- [ ] **Step 8: 提交**

```powershell
git add src/components src/views/search.ts src/app.ts src/styles.css tests/status-badge.test.ts tests/search-view.test.ts
git commit -m "feat: add global search and link status UI"
```

---

### Task 8: 实现每周链接巡检脚本

**Files:**
- Create: `scripts/link-check-lib.ts`
- Create: `scripts/check-links.ts`
- Create: `tests/link-check.test.ts`
- Create: `data/generated/.gitkeep`
- Create: `reports/.gitkeep`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `AgencyRecord`。
- Produces: `mapHttpStatus(httpStatus: number): LinkStatus['status']`。
- Produces: `checkLink(agency: AgencyRecord, fetchImpl?: typeof fetch, now?: () => Date): Promise<LinkStatus>`。
- Produces: `checkLinks(agencies: AgencyRecord[], options: CheckOptions): Promise<LinkStatus[]>`。
- Produces: `renderLinkReport(statuses: LinkStatus[], agencies: AgencyRecord[]): string`。
- Produces npm script：`check:links`。

- [ ] **Step 1: 写入失败的链接状态测试**

`tests/link-check.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkLink, mapHttpStatus } from '../scripts/link-check-lib';

const agency = {
  id: 'a', regionCode: 'CN', name: '测试机关', siteName: '测试网站',
  url: 'https://example.gov.cn/', category: 'government' as const,
  sourceUrl: 'https://example.gov.cn/'
};
const now = () => new Date('2026-09-30T00:00:00.000Z');

describe('link checking', () => {
  it('maps only definitive missing responses to invalid', () => {
    expect(mapHttpStatus(200)).toBe('valid');
    expect(mapHttpStatus(301)).toBe('valid');
    expect(mapHttpStatus(403)).toBe('unknown');
    expect(mapHttpStatus(404)).toBe('invalid');
    expect(mapHttpStatus(410)).toBe('invalid');
    expect(mapHttpStatus(500)).toBe('unknown');
  });

  it('records a network failure as unknown', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(checkLink(agency, fetchMock, now)).resolves.toEqual({
      id: 'a', status: 'unknown', checkedAt: '2026-09-30T00:00:00.000Z', detail: 'timeout'
    });
  });

  it('retries with GET when HEAD is not supported', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(checkLink(agency, fetchMock, now)).resolves.toEqual({
      id: 'a', status: 'valid', httpStatus: 200, checkedAt: '2026-09-30T00:00:00.000Z'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, agency.url, expect.objectContaining({ method: 'GET' }));
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
npm test -- --run tests/link-check.test.ts
```

预期：失败，提示找不到 `scripts/link-check-lib.ts`。

- [ ] **Step 3: 实现链接检查库**

`mapHttpStatus`：

```ts
export function mapHttpStatus(httpStatus: number): LinkStatus['status'] {
  if (httpStatus >= 200 && httpStatus < 400) return 'valid';
  if (httpStatus === 404 || httpStatus === 410) return 'invalid';
  return 'unknown';
}
```

`checkLink` 使用 `fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) })`。收到 `405` 或 `501` 时，使用相同超时发起 `GET`，并设置 `Range: bytes=0-0`，随后立即取消响应体读取。网络、DNS、TLS 和超时异常统一返回 `unknown`，`detail` 使用异常的 `message`。

`checkLinks` 使用固定并发数 `5`，全量检查完成后按输入顺序返回结果。默认 `fetchImpl = fetch`，默认 `now = () => new Date()`。

- [ ] **Step 4: 实现 CLI 与维护报告**

`scripts/check-links.ts` 读取并合并所有官方数据文件，按 URL 去重后调用 `checkLinks`。输出：

- `data/generated/link-status.json`：`LinkStatus[]`。
- `reports/link-check.md`：包含生成时间、总数、正常、待核验、失效数量，以及逐条列出失效和待核验记录的 Markdown 表格。

CLI 在存在 `invalid` 记录时以退出码 1 结束；只有 `unknown` 时输出警告并以退出码 0 结束。脚本不得改写 `data/regions.json`、`data/national.json` 或 `data/provinces/*.json`。

`package.json` 增加：

```json
"check:links": "tsx scripts/check-links.ts"
```

`.gitignore` 增加：

```gitignore
data/generated/link-status.json
reports/link-check.md
```

- [ ] **Step 5: 运行单元测试和本地巡检**

```powershell
npm test -- --run tests/link-check.test.ts
npm run check:links
```

预期：单元测试通过；本地巡检生成两个产物。允许部分政务站点返回 `unknown`，但不得将它们标为 `invalid`。

- [ ] **Step 6: 提交**

```powershell
git add scripts/link-check-lib.ts scripts/check-links.ts tests/link-check.test.ts data/generated/.gitkeep reports/.gitkeep package.json package-lock.json .gitignore
git commit -m "feat: add scheduled link verification tooling"
```

---

### Task 9: 完成端到端测试、性能门禁、GitHub Pages 部署与维护文档

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/navigation.spec.ts`
- Create: `scripts/check-bundle-size.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `.github/workflows/link-check.yml`
- Create: `public/.nojekyll`
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Modify: `package.json`
- Modify: `scripts/prepare-public-data.ts`

**Interfaces:**
- Consumes: 全部前序任务。
- Produces: `npm run test:e2e`、`npm run check:bundle`、`npm run ci`。
- Produces: GitHub Pages 自动部署与每周链接巡检。
- Produces: 面向数据维护者的录入、来源和纠错流程。

- [ ] **Step 1: 写入端到端测试**

`playwright.config.ts` 使用 Chromium，`baseURL` 为 `http://127.0.0.1:5173`，`webServer` 命令为 `npm run dev -- --host 127.0.0.1`，CI 中禁止复用既有服务。

`tests/e2e/navigation.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('navigates from home to national and Beijing directories', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '中国大陆政府机构官网导航' })).toBeVisible();
  await page.getByRole('link', { name: '国家级' }).click();
  await expect(page.getByRole('link', { name: /中国政府网/ })).toBeVisible();
  await page.goto('/#/region/110000');
  await expect(page.getByRole('heading', { name: '北京市' })).toBeVisible();
  await expect(page.getByRole('link', { name: /北京市人民政府/ })).toBeVisible();
});
```

- [ ] **Step 2: 写入构建体积门禁**

`scripts/check-bundle-size.ts` 递归读取 `dist/assets/*.js`，对每个文件执行 `gzipSync` 并求和。超过 `250 * 1024` 字节时输出实际大小并退出 1；否则输出 `bundle size passed: <bytes> bytes`。

`package.json` 增加：

```json
"test:e2e": "playwright test",
"check:bundle": "tsx scripts/check-bundle-size.ts",
"ci": "npm run format:check && npm run lint && npm run typecheck && npm run validate:data && npm run test && npm run build && npm run check:bundle"
```

- [ ] **Step 3: 创建 GitHub Actions CI**

`.github/workflows/ci.yml` 在 `push` 和 `pull_request` 时运行。步骤固定为：

```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run validate:data
      - run: npm test
      - run: npm run build
      - run: npm run check:bundle
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 4: 创建 GitHub Pages 部署**

`.github/workflows/deploy-pages.yml` 在 `master` 和 `main` 分支 push 时运行，也支持 `workflow_dispatch`。权限固定为 `contents: read`、`pages: write`、`id-token: write`，并使用 `concurrency.group: pages`、`cancel-in-progress: false`。

构建任务执行 `npm ci` 与 `npm run build`；部署任务使用：

```yaml
- uses: actions/configure-pages@v5
- uses: actions/upload-pages-artifact@v3
  with:
    path: dist
- uses: actions/deploy-pages@v4
```

环境固定为 `github-pages`，输出使用 `page_url`。

- [ ] **Step 5: 创建定时链接检查工作流**

`.github/workflows/link-check.yml`：

- 触发条件：`schedule` 为 `0 18 * * 0`，并支持 `workflow_dispatch`。
- 权限：`contents: write`、`issues: write`。
- 执行 `npm ci` 与 `npm run check:links`，该步骤设置 `continue-on-error: true` 和 `id: link_check`。
- 无论成败都上传 `reports/link-check.md` 与 `data/generated/link-status.json` 作为 artifact。
- 当 `steps.link_check.outcome == 'failure'` 时，用 `actions/github-script@v7` 查找带 `link-check` 标签的开放 Issue；存在则更新正文，不存在则创建。Issue 标题固定为“政务官网链接巡检发现失效链接”。

- [ ] **Step 6: 创建维护文档**

`README.md` 必须列出：项目范围、功能、技术栈、本地开发命令、数据目录、部署地址填写方法、每周巡检说明、Github Pages 首次启用步骤。

`CONTRIBUTING.md` 必须规定：

- 数据修改只提交 `data/` 中的人工维护文件。
- 每条 URL 必须提供 `sourceUrl`。
- 行政区代码必须使用六位标准代码；国家级只允许 `CN`。
- 新增数据后必须运行 `npm run validate:data` 与 `npm test`。
- 不得把 `403`、429、超时或 TLS 错误改成失效。
- 大批量数据按省拆分 PR，单个 PR 只改一个省级分片及必要索引数据。

- [ ] **Step 7: 运行完整验证**

```powershell
npm ci
npm run ci
npx playwright install --with-deps chromium
npm run test:e2e
```

预期：格式、lint、类型、数据校验、单元测试、构建、bundle 门禁和 Chromium 端到端测试全部通过。

- [ ] **Step 8: 提交并检查工作区**

```powershell
git add .github playwright.config.ts tests/e2e scripts/check-bundle-size.ts public/.nojekyll README.md CONTRIBUTING.md package.json package-lock.json scripts/prepare-public-data.ts
git commit -m "ci: add pages deployment and maintenance workflows"
git status --short --branch
```

预期：工作区干净。

## Plan Self-Review

- Spec coverage：国家级、省/市/县逐级浏览、全局搜索、来源、状态、数据分片、GitHub Pages、每周巡检、错误状态、测试与性能门禁均有对应任务。
- Placeholder scan：计划不使用 TBD、TODO、later 或模糊的“适当处理”；每个行为均给出测试与预期命令。
- Type consistency：`Region`、`AgencyRecord`、`LinkStatus`、`SearchDocument`、`SearchFilters` 的字段和名称在任务间一致。
- Data safety：链接巡检只生成状态与报告，不修改人工维护数据；无效与未知状态分开处理。
- Delivery order：Task 1-4 先提供可构建数据层，Task 5-7 提供完整 UI，Task 8-9 提供自动化发布与巡检。





