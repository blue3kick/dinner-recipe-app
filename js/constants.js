export const COURSE_TYPES = ['主食', '副菜1', '副菜2', 'その他'];

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ページ本文を取得せず（外部送信なし）URLのパス末尾からタイトルを推測するベストエフォート処理
export function guessTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last)
      .replace(/\.(html?|php)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function starString(rating) {
  const n = Number(rating) || 0;
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}
