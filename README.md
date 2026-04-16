# PicToTheMax

[![Linux.do](https://img.shields.io/badge/Linux.do-社区-blue.svg)](https://linux.do)

基于 `KoalasToTheMax` 思路改造的图片揭示小游戏。

## 当前部署方式

 **Cloudflare**：

- 静态站点资源（`dist`）
- 上传 API（`POST /upload`）
- 图片访问 API（`GET /files/:key`）


## 核心功能

- 悬停圆点逐步揭示图片
- URL / 本地文件 / 拖拽 / 粘贴图片加载
- 上传到 R2 并生成可分享链接
- 自动揭示、全部揭示、缩放、全屏、导出

## 目录说明

- `index.html`：前端页面
- `scripts/build-static.mjs`：构建 `dist`
- `src/index.js`：单 Worker 入口（静态 + API）
- `wrangler.toml`：Worker + R2 + assets 配置

## 一次性配置

### 1. 创建 R2 Bucket

Cloudflare Dashboard -> R2 -> Create bucket。

### 2. 修改 `wrangler.toml`

重点字段：

- `[[r2_buckets]].bucket_name`：你的 bucket 名称
- `ALLOWED_ORIGIN`：建议设置为你的站点域名（多个用逗号分隔）
- `PUBLIC_BASE_URL`：可选。留空时返回 `https://<worker域名>/files/<key>`

## 本地开发

```bash
npm install
npm run cf:dev
```

## 部署

```bash
npm install
npm run cf:deploy
```

`cf:deploy` 会先执行前端构建，再执行 `wrangler deploy`。

## 通过 Cloudflare 页面方式部署

1. 进入 `Workers & Pages`，创建或选择 **Worker 项目**。
2. 在 Worker 的 `Settings -> Builds` 中连接 Git 仓库。
3. `Root directory` 设为仓库根目录（留空或 `/`）。
4. `Build command` 设为 `npm run build`。
5. 不需要单独填写 `Build output directory`，静态产物目录由 `wrangler.toml` 中的 `assets.directory = "./dist"` 决定。
6. 在 Worker 的绑定配置中添加 R2 Bucket，绑定名必须是 `R2_BUCKET`。
7. 在变量配置中按需设置：`ALLOWED_ORIGIN`、`PUBLIC_BASE_URL`、`MAX_UPLOAD_BYTES`、`R2_KEY_PREFIX`。
8. 触发部署（手动 Deploy 或推送新提交）。

说明：
- 当前是单 Worker 架构，静态页面和 `/upload` 接口在同一个 Worker 中提供。
- 如果你使用的是 Pages 流程，会看到不同配置项，容易出现目录配置错误。

## API 约定

### POST `/upload`

- Content-Type: `multipart/form-data`
- 文件字段名：`file`
- 返回示例：

```json
{
  "ok": true,
  "key": "uploads/2026/04/16/uuid.jpg",
  "size": 12345,
  "contentType": "image/jpeg",
  "url": "https://<worker域名>/files/uploads/2026/04/16/uuid.jpg"
}
```

### GET `/files/:key`

返回 R2 图片文件。

### GET `/health`

健康检查。

## 前端配置说明

前端默认上传地址是同源 `/upload`，所以单 Worker 场景下无需额外配置 `S3_UPLOAD_ENDPOINT`。

如果你仍想覆盖上传地址，可在构建前设置：

- `S3_UPLOAD_ENDPOINT`
- `S3_PUBLIC_BASE_URL`（可选）

## 常见问题

1. 上传失败：检查 `bucket_name`、R2 绑定、`ALLOWED_ORIGIN`。
2. 图片无法分享：本地 `blob:` 地址不可跨设备，需先上传到 R2。
3. 404：确认已执行 `npm run cf:deploy`，且 `assets.directory = "./dist"`。
