# 贡献指南

感谢你参与维护中国大陆政府机构官网导航。本项目的数据由人工维护，自动化流程负责校验、检查链接与部署。请在修改前阅读本指南。

## 数据修改范围

- 数据修改只提交 `data/` 中的人工维护文件，包括 `data/regions.json`、`data/national.json` 与 `data/provinces/<省级代码>.json`。
- 不要提交 `public/data/`、`public/search-index/`、`data/generated/` 或 `reports/` 中的生成文件；这些文件由脚本生成，`.gitignore` 已排除。
- 脚本与工作流代码的修改不受此限制，但请一并运行完整校验。

## 每条 URL 必须提供来源

- 每条机关记录都必须提供 `sourceUrl`，作为官网地址的来源与纠错依据。
- 无法确认来源的官网地址不得入库。

## 行政区代码规则

- 行政区代码必须使用六位标准行政区划代码，例如北京市为 `110000`，市辖区为 `110100`。
- 国家级记录只允许使用 `CN`。
- `regionCode` 必须与所属分片一致：省级分片只保存该省及其下辖市、县、区的记录；国家级记录只能放入 `data/national.json`。

## 提交前必须运行校验

- 新增或修改数据后必须运行：

  ```bash
  npm run validate:data
  npm test
  ```

- 提交前建议再运行 `npm run ci`，确保格式、Lint、类型、数据校验、单元测试、构建与体积门禁全部通过。

## 链接状态的判定原则

- 不得把 `403`、429、超时或 TLS 错误改成“失效”。
- 只有确定性的失效响应（如 HTTP 404 / 410）才标记为失效；其余情况标记为“待核验”，由人工确认后再修正数据。
- 巡检结果写入 `data/generated/link-status.json` 与 `reports/link-check.md`，自动任务不直接修改人工维护的官网地址。

## 大批量数据按省拆分 PR

- 大批量数据按省拆分提交：单个 PR 只修改一个省级分片（`data/provinces/<省级代码>.json`）及必要的索引数据（如 `data/regions.json`）。
- 不要在一个 PR 中混入多个省份的大批量改动，以便逐省复核。
- 每个 PR 请描述数据来源、核验方式与影响范围。

## 常见流程

1. 在 `data/` 中按上述规则新增或修正记录。
2. 本地运行 `npm run validate:data` 与 `npm test`。
3. 运行 `npm run build && npm run check:bundle` 确认构建与体积门禁。
4. 提交并推送，创建 PR；CI 会在推送时自动运行全部校验。
