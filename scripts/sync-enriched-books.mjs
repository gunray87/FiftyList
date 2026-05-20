#!/usr/bin/env node
/**
 * Copy a fresh enriched_books.json into the app bundle path.
 * Usage: node scripts/sync-enriched-books.mjs [path-to-enriched_books.json]
 * Default: ~/Downloads/enriched_books.json → data/enriched_books_catalog.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dest = path.join(root, 'data', 'enriched_books_catalog.json');
const home = process.env.HOME || '';
const defaultSrc = path.join(home, 'Downloads', 'enriched_books.json');
const src = path.resolve(process.argv[2] || defaultSrc);

if (!fs.existsSync(src)) {
  console.error(`Source not found: ${src}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${src} → ${dest} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB)`);
