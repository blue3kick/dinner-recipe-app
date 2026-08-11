import { route, startRouter } from './router.js';
import { renderListView } from './views/list.js';
import { renderFormView } from './views/form.js';
import { renderDetailView } from './views/detail.js';
import { renderTagsView } from './views/tags.js';
import { renderSettingsView } from './views/settings.js';
import { renderImportView } from './views/import.js';
import { renderCalendarView } from './views/calendar.js';

route('/list', renderListView);
route('/form', renderFormView);
route('/detail', renderDetailView);
route('/tags', renderTagsView);
route('/settings', renderSettingsView);
route('/import', renderImportView);
route('/calendar', renderCalendarView);

// Web Share Target（GET）で共有されたURLを受け取り、登録フォームへ引き継ぐ
const shareParams = new URLSearchParams(location.search);
if (shareParams.has('url') || shareParams.has('text') || shareParams.has('title')) {
  const sharedUrl = shareParams.get('url') || (shareParams.get('text') || '').match(/https?:\/\/\S+/)?.[0] || '';
  const sharedTitle = shareParams.get('title') || '';
  history.replaceState(null, '', location.pathname);
  const q = new URLSearchParams();
  if (sharedUrl) q.set('prefill_url', sharedUrl);
  if (sharedTitle) q.set('prefill_title', sharedTitle);
  location.hash = `/form?${q.toString()}`;
}

startRouter();

// クラウド同期は任意機能。CDNへ到達できない(オフライン等)場合もアプリ本体は動作し続ける。
// リダイレクトログインは戻り先が/settingsとは限らないため、結果の確認はページ側ではなく
// ここで一度だけ行い、どの画面に着地しても必ず結果を表示する。
import('./sync.js')
  .then(async (sync) => {
    const { error, user } = await sync.waitForRedirectResult();
    const { showAlert } = await import('./ui.js');
    if (error) {
      await showAlert('Googleログインに失敗しました: ' + (error.message || error.code));
    } else if (user) {
      await showAlert(`${user.displayName || user.email} としてログインしました。クラウド同期がオンになりました。`);
    }
  })
  .catch(() => {
    // ネットワーク不通時などはローカル(IndexedDB)のみで動作する
  });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // オフライン用キャッシュが使えなくてもアプリ自体は動作する
    });
  });
}
