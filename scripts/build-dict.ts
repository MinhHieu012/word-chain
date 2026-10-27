// Tạo public/dict-v1.txt từ dữ liệu Wiktionary tiếng Việt của kaikki.org (CC BY-SA 4.0).
// Chạy: npm run build-dict   (tải lại dữ liệu: xóa data/kaikki-vi.jsonl)
// Đổi dữ liệu thì tăng DICT_VERSION trong src/shared/game.ts để client không dùng cache cũ.
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import type { ReadableStream } from 'node:stream/web';
import { DICT_VERSION as VERSION } from '../src/shared/game.ts';
import { normalize } from '../src/shared/normalize.ts';

const URL = 'https://kaikki.org/dictionary/Vietnamese/kaikki.org-dictionary-Vietnamese.jsonl';
const RAW = 'data/kaikki-vi.jsonl';

const letter = 'a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ';
const TWO_SYLLABLES = new RegExp(`^[${letter}]+ [${letter}]+$`);

async function download() {
  mkdirSync('data', { recursive: true });
  console.log(`Đang tải ${URL} ...`);
  const res = await fetch(URL);
  if (!res.ok || !res.body) throw new Error(`Tải thất bại: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(RAW));
  return res.headers.get('last-modified');
}

const lastModified = existsSync(RAW) ? null : await download();

let viEntries = 0;
const words = new Set<string>();
const lines = createInterface({ input: createReadStream(RAW), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const e = JSON.parse(line);
  if (e.lang_code !== 'vi') continue;
  viEntries++;
  // Bỏ tên riêng: pos "name", hoặc có chữ hoa trong dữ liệu gốc ("tiếng Nga").
  if (e.pos === 'name' || !e.word || e.word !== e.word.toLowerCase()) continue;
  const w = normalize(e.word);
  if (TWO_SYLLABLES.test(w)) words.add(w);
}

const sorted = [...words].sort((a, b) => a.localeCompare(b, 'vi'));
const firsts = new Set(sorted.map((w) => w.split(' ')[0]));
const deadEnds = sorted.filter((w) => !firsts.has(w.split(' ')[1]));

mkdirSync('public', { recursive: true });
writeFileSync(`public/dict-${VERSION}.txt`, sorted.join('\n') + '\n');
writeFileSync('public/dict-meta.json', JSON.stringify({
  version: VERSION,
  count: sorted.length,
  source: 'Wiktionary (via kaikki.org)',
  sourceUrl: URL,
  sourceLastModified: lastModified,
  license: 'CC BY-SA 4.0',
  generatedAt: new Date().toISOString(),
}, null, 2) + '\n');

console.log(`Mục tiếng Việt: ${viEntries}`);
console.log(`Cụm 2 tiếng sau lọc: ${sorted.length}`);
console.log(`Tiếng đứng đầu khác nhau: ${firsts.size}`);
console.log(`Từ cụt: ${deadEnds.length} (${(100 * deadEnds.length / sorted.length).toFixed(1)}%)`);
console.log(sorted.length >= 10000 ? 'ĐẠT ngưỡng 10.000.' : 'DƯỚI ngưỡng 10.000: cần đánh giá lại nguồn.');
