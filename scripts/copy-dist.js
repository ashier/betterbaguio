#!/usr/bin/env node
/**
 * Cross-platform file copy with exclusions (rsync replacement).
 * Usage: node scripts/copy-dist.js <src> <dest>
 */

const fs = require('fs');
const path = require('path');

const EXCLUDED = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vscode',
  '.DS_Store',
  'react-app',
  'admin',
  'build.sh',
  'babel.config.json',
  'serve.py',
  'scripts',
  'docs',
  '.lighthouserc.json',
  '.github',
  '.gitignore',
  'validate-translations.js',
  // Keep in step with the rsync exclude list in build.sh.
  'tests',
  'playwright.config.js',
  'playwright-report',
  'test-results',
  '.prettierrc',
  '.prettierignore',
  '.editorconfig',
  'release',
]);

const EXCLUDED_EXT = new Set(['.backup', '.md', '.zip', '.log']);
const EXCLUDED_PREFIX = ['backup-restore-point-', 'package', '.env'];

function shouldExclude(name) {
  if (EXCLUDED.has(name)) return true;
  const ext = path.extname(name);
  if (EXCLUDED_EXT.has(ext)) return true;
  if (name.endsWith('.tar.gz')) return true;
  for (const p of EXCLUDED_PREFIX) {
    if (name.startsWith(p)) return true;
  }
  return false;
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldExclude(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const [, , src, dest] = process.argv;
if (!src || !dest) {
  console.error('Usage: node scripts/copy-dist.js <src> <dest>');
  process.exit(1);
}

copyDir(path.resolve(src), path.resolve(dest));
console.log(`Copied: ${src} → ${dest}`);
