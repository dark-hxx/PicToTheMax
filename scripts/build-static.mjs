import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

copyRequired('index.html');
copyDirectoryIfExists('img');
copyOptional('_headers');
copyOptional('_redirects');
copyOptional('favicon.ico');

const config = {
  S3_UPLOAD_ENDPOINT: process.env.S3_UPLOAD_ENDPOINT || '',
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL || ''
};

writeFileSync(
  resolve(distDir, 'config.js'),
  `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
  'utf8'
);

const safePreview = {
  S3_UPLOAD_ENDPOINT: config.S3_UPLOAD_ENDPOINT ? '[SET]' : '[EMPTY]',
  S3_PUBLIC_BASE_URL: config.S3_PUBLIC_BASE_URL ? '[SET]' : '[EMPTY]'
};

console.log('[build-static] dist ready:', distDir);
console.log('[build-static] config:', safePreview);

function copyRequired(fileName) {
  const src = resolve(projectRoot, fileName);
  if (!existsSync(src)) {
    throw new Error(`Required file missing: ${fileName}`);
  }
  copyFileSync(src, resolve(distDir, fileName));
}

function copyOptional(fileName) {
  const src = resolve(projectRoot, fileName);
  if (!existsSync(src)) {
    return;
  }
  copyFileSync(src, resolve(distDir, fileName));
}

function copyDirectoryIfExists(dirName) {
  const src = resolve(projectRoot, dirName);
  if (!existsSync(src)) {
    return;
  }
  cpSync(src, resolve(distDir, dirName), { recursive: true });
}
