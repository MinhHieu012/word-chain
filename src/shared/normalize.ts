// Chuẩn hóa từ tiếng Việt: dùng chung cho build-dict, trình duyệt và test.
const TONES = /[̣̀́̃̉]/; // huyền, sắc, ngã, hỏi, nặng (dạng NFD)

// y ngay sau phụ âm đầu, không có âm cuối → i (QĐ 1989/QĐ-BGDĐT): sỹ → sĩ, lý → lí.
// Không đụng quy, thuý, ý, tay.
const CONSONANT_Y = /^(b|c|ch|d|đ|g|gh|h|k|kh|l|m|n|ng|ngh|nh|p|ph|r|s|t|th|tr|v|x)y$/;

// Đưa một tiếng về dạng chuẩn để hai kiểu gõ ra cùng một chuỗi:
// - vần oa/oe/uy không có phụ âm cuối: dấu đặt ở nguyên âm sau (hòa → hoà, thúy → thuý);
// - i/y theo CONSONANT_Y.
function canonical(syllable: string): string {
  const d = syllable.normalize('NFD');
  const tone = d.match(TONES)?.[0] ?? '';
  let bare = d.replace(TONES, '');
  if (CONSONANT_Y.test(bare)) bare = bare.slice(0, -1) + 'i';
  else if (!tone || !/(oa|oe|uy)$/.test(bare)) return syllable;
  return (bare + tone).normalize('NFC');
}

export const normalize = (s: string): string =>
  s.normalize('NFC').trim().toLowerCase().split(/\s+/).map(canonical).join(' ');
