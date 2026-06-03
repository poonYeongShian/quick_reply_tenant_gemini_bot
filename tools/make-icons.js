/* Generates simple solid brand-colored PNG icons for the extension. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "extension", "icons");
fs.mkdirSync(outDir, { recursive: true });

const BRAND = [0xff, 0x5a, 0x5f]; // #FF5A5F

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  // rounded-corner radius for a softer icon
  const r = Math.floor(size * 0.22);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 4;
      // distance into nearest corner for rounding
      let inside = true;
      const cx = x < r ? r : x >= size - r ? size - 1 - r : x;
      const cy = y < r ? r : y >= size - r ? size - 1 - r : y;
      if ((x < r || x >= size - r) && (y < r || y >= size - r)) {
        const dx = x - cx;
        const dy = y - cy;
        inside = dx * dx + dy * dy <= r * r;
      }
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
      raw[o + 3] = inside ? 255 : 0;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

[16, 48, 128].forEach((s) => {
  const file = path.join(outDir, `icon${s}.png`);
  fs.writeFileSync(file, makePng(s, BRAND));
  console.log("wrote", file);
});
