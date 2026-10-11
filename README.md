# 中国大陆政府机构官网导航

一个面向中国大陆政府机构官网的静态导航站，覆盖国家级、省级、地市级和县区级机关官网入口，支持全局搜索与链接状态展示。站点为纯静态构建，可通过 GitHub Pages 免费部署。

## 项目范围

- 收录中国大陆各级国家机关的官方网站入口。
- 提供国家级、省级、地市级、县区级逐级浏览。
- 提供按机关名称、网站名称、地区和域名检索的全局搜索。
- 展示每条官网链接的来源、链接核验状态与最近核验时间。
- 通过自动化工作流校验数据、检查链接并部署。

## 功能

- 首页：国家级目录入口、省级行政区入口、数据覆盖统计。
- 国家级页：按类别分组的全国性机关目录。
- 地方页：省、市、县逐级浏览，附面包屑导航与下级行政区入口。
- 全域搜索：按关键词检索，并支持层级与类别过滤；支持复制网址或在新标签页打开。
- 链接状态：搜索结果中展示链接的核验状态（有效 / 待核验 / 失效）。
- 数据纠错：每条记录均带来源链接，便于追溯与纠错。

## 技术栈

- [Vite](https://vitejs.dev/) + TypeScript 构建纯静态站点。
- [MiniSearch](https://github.com/lucaong/minisearch) 提供客户端全文搜索。
- [Zod](https://zod.dev/) 校验数据模型。
- [Vitest](https://vitest.dev/) + happy-dom 运行单元测试。
- [Playwright](https://playwright.dev/) 运行 Chromium 端到端测试。
- GitHub Actions 负责 CI、GitHub Pages 部署与每周链接巡检。

## 本地开发命令

```bash
npm ci                # 安装依赖
npm run dev           # 启动开发服务器（自动准备公开数据）
npm run test          # 运行单元测试
npm run test:e2e      # 运行 Playwright 端到端测试（需先 npx playwright install chromium）
npm run lint          # ESLint 检查
npm run format:check  # Prettier 格式检查
npm run typecheck     # TypeScript 类型检查
npm run validate:data # 校验人工维护数据
npm run build         # 生产构建（自动准备公开数据）
npm run preview       # 预览生产构建
npm run check:bundle  # 构建体积门禁（gzip 后总大小不超过 250 KiB）
npm run import:regions # 从民政公开接口重新生成行政区划快照（仅维护时手动执行）
npm run check:links   # 执行链接巡检并生成报告
npm run ci            # 本地运行完整 CI 校验
```

## 数据目录

人工维护的数据全部位于 `data/`，提交时只提交这些文件：

- data/regions.json：行政区划树（六位标准行政区划代码；国家级为 CN）。
- data/regions.meta.json：行政区划快照的来源、抓取时间、覆盖范围与数量统计。
- `data/national.json`：国家级机关记录（`regionCode` 必须为 `CN`）。
- `data/provinces/<省级代码>.json`：省级分片，只包含该省及其下辖市、县、区的机关记录。
- `data/generated/`：脚本生成的派生数据（如链接状态），不手工编辑。

`public/data/` 与 `public/search-index/` 是 `prepare:data` 生成的发布数据，不入库。每条记录必须提供 `sourceUrl` 作为来源与纠错依据，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 行政区划数据来源与更新

完整行政区划树来自[民政一体化政务服务平台（中国国家地名信息库）](https://dmfw.mca.gov.cn/)的公开接口：

```text
GET https://dmfw.mca.gov.cn/9095/xzqh/getList
GET https://dmfw.mca.gov.cn/9095/xzqh/getList?code=<12位地级代码>&level=3
```

- 维护者在联网环境下执行 `npm run import:regions`，脚本会抓取官方数据、过滤乡镇街道、把 12 位代码转换为六位代码，并以带备份回滚的双文件写入流程更新 `data/regions.json` 与 `data/regions.meta.json`。该流程不承诺跨文件原子性。
- 静态快照提交到仓库，运行中的站点和 CI 均不访问民政接口。接口或数据校验失败时脚本非零退出，不会更新目标文件；写入阶段发生错误时会删除已发布文件并从备份恢复原文件，同时清理临时和备份文件；若回滚本身失败，会抛出聚合错误。
- 直辖市使用 `110100`、`120100`、`310100`、`500100` 作为稳定的“市辖区”分组；河南、湖北、海南、新疆的省直辖县级单位分别使用 `419000`、`429000`、`469000`、`659000`。
- 东莞、中山、儋州、嘉峪关等“直筒子市”在官方接口中只返回 level=4 的街道或镇，没有 level=3 县级节点。项目保留地级节点并允许县级子节点为空，不为这类城市伪造县级代码。

## 部署地址填写方法

- 首次启用 GitHub Pages 后，站点地址为 `https://<owner>.github.io/<repository>/`，例如 `https://example.github.io/gov-nav/`。
- 站点使用 hash 路由，所有页面路径都以 `#/` 开头，部署到子路径下无需任何服务端重写规则。
- 仓库根目录 `README.md` 中的链接、文档以及外部引用，应使用完整部署地址 `https://<owner>.github.io/<repository>/` 填写，避免使用仅本地可用的相对地址。
- Vite 构建时会根据 `GITHUB_REPOSITORY` 自动设置 `base`，因此无需手工修改构建配置；本地 `npm run dev` 使用根路径。

## 每周巡检说明

- GitHub Actions 工作流 `.github/workflows/link-check.yml` 每周日 18:00（UTC）自动运行，对应北京时间每周一 02:00。
- 巡检只读取人工维护数据并生成 `data/generated/link-status.json` 与 `reports/link-check.md`，不会修改人工维护的官网地址。
- 巡检发现失效链接（HTTP 404 / 410）时，工作流会自动创建或更新标题为“政务官网链接巡检发现失效链接”的 Issue，并带有 `link-check` 标签。
- 403、429、超时或 TLS 错误会被归类为“待核验”，不会直接判为失效；需要人工确认后再修正数据。
- 可随时在 Actions 页面手动触发 `Link Check` 工作流（`workflow_dispatch`）。

## GitHub Pages 首次启用步骤

1. 将仓库推送到 GitHub（默认分支为 `master` 或 `main`）。
2. 进入仓库 **Settings → Pages**。
3. 在 “Build and deployment” 中把 **Source** 选为 **GitHub Actions**。
4. 工作流 `.github/workflows/deploy-pages.yml` 会在推送 `master` / `main` 分支时自动构建并部署 `dist/`；也可在 Actions 页面手动触发 `Deploy GitHub Pages`。
5. 部署完成后，页面顶部会显示部署地址 `https://<owner>.github.io/<repository>/`，同时工作流输出中会给出 `page_url`。
6. 首次部署可能需要几分钟；之后每次推送 `master` / `main` 都会自动更新。
7. 站点包含 `public/.nojekyll`（构建后位于 `dist/.nojekyll`），确保 GitHub Pages 不会按 Jekyll 处理站点资源。

## 维护与贡献

数据新增、来源与纠错流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。
