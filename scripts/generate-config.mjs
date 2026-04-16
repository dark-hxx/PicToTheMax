import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const targetPath = resolve(projectRoot, 'config.js');

const config = {
  S3_UPLOAD_ENDPOINT: process.env.S3_UPLOAD_ENDPOINT || '',
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL || ''
};

const content = `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
writeFileSync(targetPath, content, 'utf8');

const safePreview = {
  S3_UPLOAD_ENDPOINT: config.S3_UPLOAD_ENDPOINT ? '[SET]' : '[EMPTY]',
  S3_PUBLIC_BASE_URL: config.S3_PUBLIC_BASE_URL ? '[SET]' : '[EMPTY]'
};
console.log('[generate-config] done:', safePreview);
