/**
 * Synthetic "oral photos" for seed data: simple drawings of teeth, never real
 * patients (CLAUDE.md rule 5). Encoded as PNG with Node's zlib, so no image
 * library is needed. The API serves them as image/png.
 */
import { crc32, deflateSync } from 'node:zlib';
import type { ViewType } from '@smilesync/shared';

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GUM: [number, number, number] = [196, 92, 104];
const MOUTH: [number, number, number] = [70, 24, 32];
const TOOTH: [number, number, number] = [242, 236, 220];
const DECAY: [number, number, number] = [92, 64, 40];

/** A drawing of the given view. `variant` moves a dark "decay" spot so cases differ. */
export function syntheticOralImage(view: ViewType, variant: number): Buffer {
  const W = 640;
  const H = 480;
  const cx = W / 2;
  const spot = { x: 160 + ((variant * 97) % 320), y: view === 'FRONT' ? 200 : 260 + ((variant * 37) % 80) };

  return encodePng(W, H, (x, y) => {
    if (Math.hypot(x - spot.x, y - spot.y) < 14) return DECAY;
    if (view === 'FRONT' || view === 'EXTRA') {
      // Two rows of front teeth meeting at the middle, inside an open mouth.
      if (Math.abs(x - cx) > 260 || Math.abs(y - H / 2) > 150) return GUM;
      const tooth = Math.floor((x - (cx - 240)) / 60);
      const inTooth = tooth >= 0 && tooth < 8 && (x - (cx - 240)) % 60 > 4;
      if (inTooth && y > H / 2 - 110 && y < H / 2 - 4) return TOOTH;
      if (inTooth && y > H / 2 + 4 && y < H / 2 + 100) return TOOTH;
      return MOUTH;
    }
    // Arch views: a U-shaped row of teeth seen from below or above.
    const dx = (x - cx) / 230;
    const dy = (view === 'UPPER_ARCH' ? y - 90 : H - 90 - y) / 300;
    const r = Math.hypot(dx, dy);
    if (r > 0.82 && r < 1.08 && dy >= -0.05) {
      const angle = Math.atan2(dy, dx);
      return Math.floor(angle / (Math.PI / 14)) % 2 === 0 ? TOOTH : [224, 216, 198];
    }
    return r < 0.82 ? MOUTH : GUM;
  });
}
