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
- `config.js`：本地直接打开时的默认配置
- `scripts/build-static.mjs`：构建 `dist`（含环境变量注入）
- `scripts/generate-config.mjs`：单独生成根目录 `config.js`（可选）
- `cloudflare-worker/`：R2 上传 Worker 示例
- `vercel.json`：Vercel 构建配置

## 你这次 Cloudflare 报错的根因

报错：`Cloudflare Workers supports assets with sizes of up to 25 MiB ... node_modules/workerd/bin/workerd 118 MiB`

根因：Pages 的输出目录如果是项目根目录 `.`，构建产生的 `node_modules` 会被当作静态资源上传，`workerd` 二进制超限。

本仓库已修复：

- 构建只输出到 `dist/`
- `dist/` 只包含前端必需文件，不包含 `node_modules`
- Vercel 输出目录已改为 `dist`

## 前端构建与环境变量

前端读取以下变量：

- `S3_UPLOAD_ENDPOINT`：上传接口地址（POST `multipart/form-data`，字段名 `file`）
- `S3_PUBLIC_BASE_URL`：可选；仅当接口返回 `key` 而非 `url` 时才需要

本地构建示例：

```bash
# PowerShell
$env:S3_UPLOAD_ENDPOINT="https://upload.example.com/upload"
$env:S3_PUBLIC_BASE_URL="https://upload.example.com/files"
npm run build
```

构建后产物在 `dist/`。

## Cloudflare R2 上传（推荐：Worker + R2 Binding）

### 1. 创建 R2 Bucket

Cloudflare Dashboard -> R2 -> Create bucket，记下 bucket 名称。

### 2. 配置 Worker

修改 `cloudflare-worker/wrangler.toml`：

- `[[r2_buckets]].bucket_name`：你的 bucket 名称
- `PUBLIC_BASE_URL`：可选，默认留空即可
- `ALLOWED_ORIGIN`：建议限制为你的前端域名
- `MAX_UPLOAD_BYTES`：最大上传大小（字节）
- `R2_KEY_PREFIX`：对象前缀

### 3. 部署 Worker

```bash
cd cloudflare-worker
npm install
npx wrangler deploy
```

得到 Worker 域名后：

- `S3_UPLOAD_ENDPOINT` = `https://<worker域名>/upload`
- `S3_PUBLIC_BASE_URL` 可留空（本示例返回 `url`）

## Worker 接口约定

- `POST /upload`
  - 入参：`multipart/form-data`，字段 `file`
  - 返回：`{ ok, key, size, contentType, url }`
- `GET /files/:key`：读取 R2 文件
- `GET /health`：健康检查

## 部署前端

### Vercel

1. 导入仓库
2. 配置环境变量 `S3_UPLOAD_ENDPOINT`、`S3_PUBLIC_BASE_URL`（可选）
3. Build Command: `npm run build`
4. Output Directory: `dist`

### Cloudflare Pages

1. 新建 Pages 项目并连接仓库
2. Build command: `npm run build`
3. Build output directory: `dist`
4. 环境变量配置 `S3_UPLOAD_ENDPOINT`、`S3_PUBLIC_BASE_URL`（可选）并重新部署

## 常见问题

1. URL 图片加载失败：多为 CORS 限制，换支持跨域的地址。
2. 上传失败：检查 Worker 路由、`ALLOWED_ORIGIN`、请求体字段是否为 `file`。
3. 分享链接失效：本地 `blob:` 图不可跨设备分享，先上传到 R2。

![Tux](https://raw.githubusercontent.com/garrett/Tux/ecd40de64250ea2b24c849e901c3297ad01e54f6/tux.svg)