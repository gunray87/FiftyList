#!/usr/bin/env node
/**
 * iOS App Store requires a 1024×1024 opaque app icon.
 * Composites assets/images/icon.png onto #D6B588 for the native AppIcon asset.
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconPath = join(root, 'assets/images/icon.png');
const outPath = join(
  root,
  'ios/FiftyList/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png'
);

if (!existsSync(iconPath)) {
  console.error('Missing', iconPath);
  process.exit(1);
}

const py = `
from pathlib import Path
from PIL import Image
icon_path = Path(${JSON.stringify(iconPath)})
out_path = Path(${JSON.stringify(outPath)})
bg_color = (214, 181, 136, 255)
size = 1024
canvas = Image.new('RGBA', (size, size), bg_color)
src = Image.open(icon_path).convert('RGBA')
max_w = int(size * 0.82)
max_h = int(size * 0.82)
src.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
x = (size - src.width) // 2
y = (size - src.height) // 2
canvas.paste(src, (x, y), src)
out_path.parent.mkdir(parents=True, exist_ok=True)
canvas.convert('RGB').save(out_path, format='PNG')
print('Wrote', out_path)
`;

const run = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
if (run.status !== 0) {
  console.error('prepare-ios-app-icon failed (install Pillow: pip3 install Pillow)');
  process.exit(run.status ?? 1);
}
