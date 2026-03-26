import fs from "fs";
import path from "path";
import { deflateSync } from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(
	__dirname,
	"../com.dadstart.baseball.sdPlugin/imgs/actions/game-score",
);

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer) {
	let crc = 0xffffffff;
	for (let i = 0; i < buffer.length; i++) {
		crc ^= buffer[i];
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Fully transparent RGBA PNG at Stream Deck key sizes (no extra deps). */
function transparentPng(width, height) {
	const rowBytes = 1 + width * 4;
	const raw = Buffer.alloc(height * rowBytes);
	// filter 0 (None) + RGBA 0,0,0,0 per pixel — fully transparent
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter method
	ihdr[12] = 0; // interlace
	const idat = deflateSync(raw);
	return Buffer.concat([
		PNG_SIGNATURE,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", idat),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "key.png"), transparentPng(72, 72));
fs.writeFileSync(path.join(outDir, "key@2x.png"), transparentPng(144, 144));
