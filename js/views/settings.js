import { exportAllData, importAllData, SiteStore } from '../db.js';
import { escapeHtml } from '../constants.js';
import { showAlert, showConfirm, showPrompt } from '../ui.js';

export async function renderSettingsView() {
  const app = document.getElementById('app');
  const sites = await SiteStore.getAll();

  app.innerHTML = `
    <section class="view">
      <h2>設定・バックアップ</h2>

      <div class="detail-section">
        <h3>クラウド同期（Googleアカウント）</h3>
        <div id="sync-section"><p class="muted">読み込み中…</p></div>
      </div>

      <div class="detail-section">
        <h3>外部レシピサイト連携</h3>
        <p class="muted">
          出典URLのホスト名が下記に一致する場合、サイト名を自動判定して表示します。
          対応アプリがインストールされている端末では、リンクをブラウザで開くとOS側の設定（ユニバーサルリンク/アプリリンク）に従って自動的にアプリが起動します。
          未インストールの場合や対象外サイトはブラウザで開きます。
        </p>
        <ul class="tag-manage-list" id="site-list">
          ${sites
            .map(
              (s) => `
            <li data-id="${s.site_id}">
              <span class="tag-name">${escapeHtml(s.name)}</span>
              <span class="muted">${escapeHtml(s.host_match)}</span>
              <button class="btn btn-secondary btn-small" data-action="edit">編集</button>
              <button class="btn btn-danger btn-small" data-action="delete">削除</button>
            </li>`
            )
            .join('')}
        </ul>
        <div class="inline-add">
          <input type="text" id="site-name" class="input" placeholder="サイト名（例: クックパッド）" />
          <input type="text" id="site-host" class="input" placeholder="ホスト名（例: cookpad.com）" />
          <button id="btn-add-site" class="btn btn-secondary">追加</button>
        </div>
      </div>

      <div class="detail-section">
        <h3>バックアップ・他の端末への移行</h3>
        <p class="muted">レシピ・食材タグ・調理記録のデータはこの端末のブラウザにのみ保存され、自動的には他の端末と連携しません。スマホとPCなど複数端末で同じデータを見たい場合は、ここでJSONファイルを書き出し、別端末の「データの復元」から読み込んでください。</p>
        <div class="form-actions">
          <button id="btn-export" class="btn btn-primary">📤 データをエクスポート</button>
        </div>
      </div>

      <div class="detail-section">
        <h3>データの復元・取り込み</h3>
        <p class="muted">他端末で書き出したJSONファイルを選択すると、この端末に取り込みます（既存データに追加・上書きされます）。</p>
        <input type="file" id="import-file" accept="application/json" />
      </div>
    </section>
  `;

  document.getElementById('site-list').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const action = e.target.dataset.action;
    if (action === 'edit') {
      const site = sites.find((s) => s.site_id === id);
      const name = await showPrompt('サイト名', site.name);
      if (name === null) return;
      const host = await showPrompt('ホスト名（例: cookpad.com）', site.host_match);
      if (host === null) return;
      await SiteStore.update(id, name, host);
      renderSettingsView();
    } else if (action === 'delete') {
      if (!(await showConfirm('このサイト設定を削除しますか？'))) return;
      await SiteStore.remove(id);
      renderSettingsView();
    }
  });

  document.getElementById('btn-add-site').addEventListener('click', async () => {
    const nameInput = document.getElementById('site-name');
    const hostInput = document.getElementById('site-host');
    const name = nameInput.value.trim();
    const host = hostInput.value.trim();
    if (!name || !host) return;
    await SiteStore.add(name, host);
    renderSettingsView();
  });

  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const filename = `dinner-recipe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (window.claude && window.claude.downloads) {
      // サンドボックス化されたページ（Artifact等）ではフレームコードから直接ダウンロードできないため専用APIを使う
      try {
        await window.claude.downloads.save({ filename, data: json });
      } catch (err) {
        if (err && err.code !== 'declined') {
          await showAlert('エクスポートに失敗しました: ' + (err.message || err.code));
        }
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAllData(data);
      await showAlert('データを復元しました。');
      location.hash = '/list';
    } catch (err) {
      await showAlert('復元に失敗しました: ' + err.message);
    }
  });

  initSyncSection();
}

function renderSyncStatus(el, sync, status) {
  if (!status.ready) {
    el.innerHTML = '<p class="muted">読み込み中…</p>';
    return;
  }
  if (status.signedIn) {
    el.innerHTML = `
      <div class="sync-account">
        ${status.photoURL ? `<img class="sync-avatar" src="${escapeHtml(status.photoURL)}" alt="" />` : ''}
        <div>
          <p style="margin:0;font-weight:600;">${escapeHtml(status.displayName || status.email)}</p>
          <p class="muted" style="margin:0;">同期オン — この端末を含め、サインインした端末間でレシピ・タグ・調理記録が自動的に反映されます。</p>
        </div>
      </div>
      <div class="form-actions"><button id="btn-sync-out" class="btn btn-secondary">ログアウト</button></div>
    `;
    document.getElementById('btn-sync-out').addEventListener('click', () => sync.signOutUser());
  } else {
    el.innerHTML = `
      <p class="muted">Googleアカウントでログインすると、同じアカウントでログインした端末間でレシピ・タグ・調理記録が自動的に同期されます。</p>
      <div class="form-actions"><button id="btn-sync-in" class="btn btn-primary">Googleでログイン</button></div>
    `;
    document.getElementById('btn-sync-in').addEventListener('click', async () => {
      try {
        await sync.signIn();
      } catch (err) {
        await showAlert('ログインに失敗しました: ' + (err.message || err.code));
      }
    });
  }
}

async function initSyncSection() {
  const el = document.getElementById('sync-section');
  let sync;
  try {
    sync = await import('../sync.js');
  } catch {
    el.innerHTML = '<p class="muted">クラウド同期は現在利用できません（ネットワーク接続をご確認ください）。オフラインでもレシピの登録・編集は引き続きご利用いただけます。</p>';
    return;
  }
  if (!document.getElementById('sync-section')) return; // 別画面へ遷移済み
  renderSyncStatus(el, sync, sync.getStatus());
  sync.onStatusChange((status) => {
    const liveEl = document.getElementById('sync-section');
    if (liveEl) renderSyncStatus(liveEl, sync, status);
  });
  const { error: redirectError } = await sync.waitForRedirectResult();
  if (redirectError) {
    await showAlert('ログインに失敗しました: ' + (redirectError.message || redirectError.code));
  }
}
