import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('--- Step 1: Prepare index.html with /src/main.jsx for Vite build ---');
let html = fs.readFileSync('index.html', 'utf8');
// Ensure it points to source
html = html.replace(/<link rel="stylesheet"[^>]*assets\/[^>]*>/g, '');
html = html.replace(/<script type="module"[^>]*assets\/[^>]*><\/script>/g, '<script type="module" src="/src/main.jsx"></script>');
if (!html.includes('/src/main.jsx')) {
  html = html.replace('<div id="root"></div>', '<div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>');
}
fs.writeFileSync('index.html', html);

console.log('--- Step 2: Running Vite Build ---');
execSync('npx vite build', { stdio: 'inherit' });

console.log('--- Step 3: Syncing dist to docs and root assets ---');
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach((file) => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

// Clean and copy dist to docs
if (fs.existsSync('docs/assets')) fs.rmSync('docs/assets', { recursive: true, force: true });
copyDir('dist', 'docs');

// Clean and copy dist/assets to root assets
if (fs.existsSync('assets')) fs.rmSync('assets', { recursive: true, force: true });
copyDir('dist/assets', 'assets');

// Copy public/sw.js to root sw.js and docs/sw.js
fs.copyFileSync('public/sw.js', 'sw.js');
fs.copyFileSync('public/sw.js', 'docs/sw.js');

// Update root index.html and docs/index.html to use relative assets for direct branch serving
const distHtml = fs.readFileSync('dist/index.html', 'utf8');
const staticHtml = distHtml
  .replace(/href="\/debit\/assets\//g, 'href="./assets/')
  .replace(/src="\/debit\/assets\//g, 'src="./assets/');

fs.writeFileSync('index.html', staticHtml);
fs.writeFileSync('docs/index.html', staticHtml);

console.log('--- Step 4: Build & Sync Completed Successfully! ---');
