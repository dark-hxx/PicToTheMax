# PicToTheMax

一个基于 `KoalasToTheMax` 思路改造的纯前端图片揭示小游戏。

## 已实现功能

- 鼠标悬停圆点逐步揭示图片
- 图片来源支持：URL、本地上传、拖拽上传、粘贴上传
- 自动揭示 / 全部揭示 / 滚轮缩放 / 全屏查看
- 导出当前揭示结果为 PNG
- 分享链接：`?img=<url>`
- 可选 S3/R2 上传分享（环境变量配置）

## 项目结构

- `index.html`：主页面（纯静态）
- `config.js`：运行时配置（构建时生成）
- `scripts/generate-config.mjs`：从环境变量生成 `config.js`
- `cloudflare-worker/`：R2 上传 Worker 示例
- `vercel.json`：Vercel 构建配置

## 前端环境变量（Vercel / Cloudflare Pages）

前端读取以下变量并注入到 `config.js`：

- `S3_UPLOAD_ENDPOINT`：上传接口地址（POST `multipart/form-data`，字段名 `file`）
- `S3_PUBLIC_BASE_URL`：可选；仅当接口返回 `key` 而非 `url` 时才需要

本地模拟构建：

```bash
# PowerShell
$env:S3_UPLOAD_ENDPOINT="https://upload.example.com/upload"
$env:S3_PUBLIC_BASE_URL="https://upload.example.com/files"
npm run build
```

## Cloudflare R2 上传（推荐：Worker + R2 Binding）

### 1. 创建 R2 Bucket

Cloudflare Dashboard -> R2 -> Create bucket，记下 bucket 名称。

### 2. 配置 Worker

在 `cloudflare-worker/wrangler.toml` 修改：

- `[[r2_buckets]].bucket_name`：你的 bucket 名称
- `PUBLIC_BASE_URL`：可选
  - 留空：返回 `https://<worker域名>/files/<key>`
  - 填写：例如 `https://upload.example.com/files`
- `ALLOWED_ORIGIN`：建议改成你的前端域名，多个用英文逗号分隔
- `MAX_UPLOAD_BYTES`：最大上传大小（字节）
- `R2_KEY_PREFIX`：对象前缀

### 3. 部署 Worker

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
```

部署后会得到 Worker 域名，例如：`https://pic-to-the-max-upload.<subdomain>.workers.dev`。

### 4. 得到前端要填的地址

- `S3_UPLOAD_ENDPOINT`：`https://<worker域名>/upload`
- `S3_PUBLIC_BASE_URL`：
  - 如果 Worker 返回 `url`（本示例默认会返回），可以留空
  - 如果你的上传接口只返回 `key`，则填 `https://<worker域名>/files` 或你的 CDN 域名

### 5. 在前端平台配置变量并重新部署

- Vercel：Project Settings -> Environment Variables
- Cloudflare Pages：Settings -> Variables and Secrets

设置完执行重新部署。

## Worker 接口约定（本仓库已实现）

- `POST /upload`
  - 入参：`multipart/form-data`，字段 `file`
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

- `GET /files/:key`：读取 R2 文件
- `GET /health`：健康检查


## 部署前端

### Vercel

1. 导入仓库
2. 环境变量配置 `S3_UPLOAD_ENDPOINT`、`S3_PUBLIC_BASE_URL`（可选）
3. Build Command: `npm run build`
4. Output Directory: `.`

### Cloudflare Pages

1. 新建 Pages 项目并连接仓库
2. Build command: `npm run build`
3. Build output directory: `.`
4. 环境变量配置 `S3_UPLOAD_ENDPOINT`、`S3_PUBLIC_BASE_URL`（可选）并重新部署

## 常见问题

1. URL 图片加载失败：多为 CORS 限制，换支持跨域的地址。
2. 上传失败：检查 Worker 路由、`ALLOWED_ORIGIN`、请求体字段是否为 `file`。
3. 分享链接失效：本地 `blob:` 图不可跨设备分享，先上传到 R2。
