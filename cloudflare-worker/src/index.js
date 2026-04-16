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
      return jsonResponse({ ok: true, service: 'r2-upload-worker' }, 200, request, env);
    }

    if (pathname === '/upload' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    if (pathname.startsWith('/files/') && request.method === 'GET') {
      return handleGetFile(request, env, pathname);
    }

    return jsonResponse({ error: 'Not found' }, 404, request, env);
  }
};

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

  const maxUploadBytes = Number.parseInt(env.MAX_UPLOAD_BYTES || '', 10);
  const uploadLimit = Number.isFinite(maxUploadBytes) && maxUploadBytes > 0
    ? maxUploadBytes
    : DEFAULT_MAX_UPLOAD_BYTES;

  if (file.size > uploadLimit) {
    return jsonResponse({ error: `File too large. Max: ${uploadLimit} bytes` }, 400, request, env);
  }

  const key = buildObjectKey(file, env);
  const body = await file.arrayBuffer();

  await env.R2_BUCKET.put(key, body, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  const fileUrl = buildFileUrl(request, env, key);
  return jsonResponse(
    {
      ok: true,
      key,
      size: file.size,
      contentType: file.type,
      url: fileUrl
    },
    200,
    request,
    env
  );
}

async function handleGetFile(request, env, pathname) {
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
  Object.keys(corsHeaders).forEach((name) => {
    headers.set(name, corsHeaders[name]);
  });

  return new Response(object.body, {
    status: 200,
    headers
  });
}

function buildObjectKey(file, env) {
  const prefix = (env.R2_KEY_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const ext = pickExtension(file);
  const id = crypto.randomUUID();
  return `${prefix}/${yyyy}/${mm}/${dd}/${id}.${ext}`;
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
    const allowed = raw.split(',').map((v) => v.trim()).filter(Boolean);
    allowOrigin = allowed.includes(origin) ? origin : allowed[0] || 'null';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
