const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request, env)
      });
    }

    if (pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'pic-to-the-max-worker' }, 200, request, env);
    }

    if (pathname === '/upload' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    if (pathname === '/upload-url' && request.method === 'POST') {
      return handleUploadUrl(request, env);
    }

    if (pathname.startsWith('/files/') && request.method === 'GET') {
      return handleGetFile(request, env, pathname);
    }

    return serveAssetOr404(request, env);
  }
};

async function serveAssetOr404(request, env) {
  if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD')) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }
  }
  return new Response('Not found', { status: 404 });
}

async function handleUpload(request, env) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse({ error: 'Content-Type must be multipart/form-data' }, 400, request, env);
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return jsonResponse({ error: 'Missing file field' }, 400, request, env);
  }

  if (!file.type || !file.type.startsWith('image/')) {
    return jsonResponse({ error: 'Only image files are allowed' }, 400, request, env);
  }

  const uploadLimit = getUploadLimit(env);

  if (file.size > uploadLimit) {
    return jsonResponse({ error: `File too large. Max: ${uploadLimit} bytes` }, 400, request, env);
  }

  const body = await file.arrayBuffer();
  return saveImageToR2(request, env, {
    body,
    contentType: file.type,
    fileName: file.name
  });
}

async function handleUploadUrl(request, env) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400, request, env);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request, env);
  }

  const rawUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!rawUrl) {
    return jsonResponse({ error: 'Missing url field' }, 400, request, env);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return jsonResponse({ error: 'Invalid URL' }, 400, request, env);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return jsonResponse({ error: 'Only http/https URL is allowed' }, 400, request, env);
  }

  const uploadLimit = getUploadLimit(env);
  let remoteResponse;
  try {
    remoteResponse = await fetch(parsedUrl.toString(), { redirect: 'follow' });
  } catch {
    return jsonResponse({ error: 'Failed to fetch remote image URL' }, 400, request, env);
  }
  if (!remoteResponse.ok) {
    return jsonResponse(
      { error: `Failed to fetch remote image: HTTP ${remoteResponse.status}` },
      400,
      request,
      env
    );
  }

  const remoteType = (remoteResponse.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!remoteType.startsWith('image/')) {
    return jsonResponse({ error: 'Remote URL is not an image' }, 400, request, env);
  }

  const contentLength = Number.parseInt(remoteResponse.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > uploadLimit) {
    return jsonResponse(
      { error: `Remote image is too large. Max: ${uploadLimit} bytes` },
      400,
      request,
      env
    );
  }

  const body = await remoteResponse.arrayBuffer();
  if (body.byteLength > uploadLimit) {
    return jsonResponse({ error: `Remote image is too large. Max: ${uploadLimit} bytes` }, 400, request, env);
  }

  return saveImageToR2(request, env, {
    body,
    contentType: remoteType,
    fileName: parsedUrl.pathname
  });
}

async function handleGetFile(request, env, pathname) {
  if (!env.R2_BUCKET) {
    return jsonResponse({ error: 'R2 bucket binding missing' }, 500, request, env);
  }

  const key = decodeURIComponent(pathname.slice('/files/'.length));
  if (!key) {
    return jsonResponse({ error: 'Missing file key' }, 400, request, env);
  }

  const object = await env.R2_BUCKET.get(key);
  if (!object) {
    return jsonResponse({ error: 'File not found' }, 404, request, env);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  const corsHeaders = buildCorsHeaders(request, env);
  Object.keys(corsHeaders).forEach((name) => headers.set(name, corsHeaders[name]));

  return new Response(object.body, {
    status: 200,
    headers
  });
}

function getUploadLimit(env) {
  const maxUploadBytes = Number.parseInt(env.MAX_UPLOAD_BYTES || '', 10);
  return Number.isFinite(maxUploadBytes) && maxUploadBytes > 0
    ? maxUploadBytes
    : DEFAULT_MAX_UPLOAD_BYTES;
}

async function saveImageToR2(request, env, options) {
  if (!env.R2_BUCKET) {
    return jsonResponse({ error: 'R2 bucket binding missing' }, 500, request, env);
  }

  const key = buildObjectKey(
    {
      type: options.contentType,
      name: options.fileName || ''
    },
    env
  );

  await env.R2_BUCKET.put(key, options.body, {
    httpMetadata: {
      contentType: options.contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  return jsonResponse(
    {
      ok: true,
      key,
      size: options.body.byteLength,
      contentType: options.contentType,
      url: buildFileUrl(request, env, key)
    },
    200,
    request,
    env
  );
}

function buildObjectKey(file, env) {
  const prefix = (env.R2_KEY_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const id = crypto.randomUUID();
  return `${prefix}/${yyyy}/${mm}/${dd}/${id}.${pickExtension(file)}`;
}

function pickExtension(file) {
  const byType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif'
  };

  if (byType[file.type]) {
    return byType[file.type];
  }

  const name = file.name || '';
  const idx = name.lastIndexOf('.');
  if (idx > 0 && idx < name.length - 1) {
    return name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }

  return 'bin';
}

function buildFileUrl(request, env, key) {
  const base = (env.PUBLIC_BASE_URL || '').trim();
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (base) {
    return `${base.replace(/\/$/, '')}/${encodedKey}`;
  }
  const origin = new URL(request.url).origin;
  return `${origin}/files/${encodedKey}`;
}

function jsonResponse(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(request, env)
    }
  });
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const raw = (env.ALLOWED_ORIGIN || '*').trim();

  let allowOrigin = '*';
  if (raw !== '*') {
    const allowed = raw.split(',').map((item) => item.trim()).filter(Boolean);
    allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null');
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
