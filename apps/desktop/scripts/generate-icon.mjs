// Generates assets/icon.ico (multi-resolution, required by the Windows
// Squirrel maker/packager) from the source assets/icon.png. Re-run this
// whenever the source icon changes: `node scripts/generate-icon.mjs`.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(import.meta.dirname, '..');
const sourcePng = path.join(root, 'assets', 'icon.png');
const outputIco = path.join(root, 'assets', 'icon.ico');
const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
  await mkdir(path.join(root, 'assets'), { recursive: true });

  const resizedBuffers = await Promise.all(
    sizes.map((size) => sharp(sourcePng).resize(size, size).png().toBuffer()),
  );

  const icoBuffer = await pngToIco(resizedBuffers);
  await writeFile(outputIco, icoBuffer);

  console.log(`Wrote ${outputIco} (${sizes.join(', ')}px)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
