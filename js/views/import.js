import { RecipeStore, detectSourceSite } from '../db.js';
import { navigate } from '../router.js';
import { COURSE_TYPES, escapeHtml, guessTitleFromUrl } from '../constants.js';
import { showAlert } from '../ui.js';

function parseBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = [...doc.querySelectorAll('a[href]')];
  const seen = new Set();
  return anchors
    .map((a) => ({ title: a.textContent.trim() || a.getAttribute('href'), url: a.getAttribute('href') }))
    .filter((item) => {
      if (!/^https?:\/\//i.test(item.url)) return false;
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

function renderPreviewList(containerEl, items) {
  containerEl.innerHTML = `
    <ul class="import-preview-list">
      ${items
        .map(
          (item, i) => `
        <li data-index="${i}">
          <input type="checkbox" class="preview-check" checked />
          <input type="text" class="input preview-title" value="${escapeHtml(item.title)}" />
          <span class="import-preview-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function readPreviewItems(containerEl, items) {
  const rows = [...containerEl.querySelectorAll('li[data-index]')];
  return rows
    .filter((li) => li.querySelector('.preview-check').checked)
    .map((li) => {
      const i = Number(li.dataset.index);
      const title = li.querySelector('.preview-title').value.trim();
      return { title: title || items[i].url, url: items[i].url };
    });
}

async function registerItems(items) {
  let count = 0;
  for (const item of items) {
    await RecipeStore.put({
      recipe_id: null,
      title: item.title,
      source_url: item.url,
      source_site: await detectSourceSite(item.url),
      thumbnail_image: '',
      course_type: COURSE_TYPES[COURSE_TYPES.length - 1],
      ingredient_tags: [],
      ingredients: '',
      steps: '',
      memo: '',
    });
    count++;
  }
  return count;
}

export async function renderImportView() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="view">
      <h2>レシピをインポート</h2>
      <p class="muted">保存済みのリンクからレシピを一括登録します。タイトルはこの画面で編集できます。食材タグ・材料などは登録後に一覧から編集してください。</p>

      <div class="detail-section">
        <h3>共有シートからの登録について</h3>
        <p class="muted">
          ブラウザ等の共有メニューからこのアプリにURLを渡す機能は、ホーム画面にインストールした状態でのみ利用できます
          （このページを開いたまま共有メニューの「レシピ管理」を選ぶと、このフォームにURLが自動入力されます）。
        </p>
      </div>

      <div class="detail-section">
        <h3>複数URLを一括貼り付け</h3>
        <p class="muted">1行に1件、URLを貼り付けて「内容を確認」を押すと、タイトルを編集できるプレビューが表示されます。</p>
        <textarea id="url-bulk" class="input textarea" rows="6" placeholder="https://cookpad.com/recipe/111111&#10;https://www.kurashiru.com/recipes/xxxxx"></textarea>
        <div class="form-actions">
          <button id="btn-bulk-parse" type="button" class="btn btn-secondary">内容を確認</button>
        </div>
        <div id="bulk-preview"></div>
        <div class="form-actions" id="bulk-actions" style="display:none;">
          <button id="btn-bulk-import" type="button" class="btn btn-primary">選択した項目を登録</button>
        </div>
      </div>

      <div class="detail-section">
        <h3>ブックマークファイルから読み込む</h3>
        <p class="muted">ブラウザの「ブックマークをエクスポート」で書き出したHTMLファイルを選択すると、含まれるリンクを一覧表示します。タイトルを編集し、取り込みたい項目にチェックを入れて登録してください。</p>
        <input type="file" id="bookmark-file" accept=".html,.htm,text/html" />
        <div id="bookmark-list"></div>
        <div class="form-actions" id="bookmark-actions" style="display:none;">
          <button id="btn-select-all" type="button" class="btn btn-secondary">全て選択</button>
          <button id="btn-bookmark-import" type="button" class="btn btn-primary">選択した項目を登録</button>
        </div>
      </div>
    </section>
  `;

  let bulkItems = [];
  document.getElementById('btn-bulk-parse').addEventListener('click', () => {
    const lines = document
      .getElementById('url-bulk')
      .value.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l));
    if (!lines.length) {
      showAlert('有効なURLが見つかりませんでした。');
      return;
    }
    bulkItems = lines.map((url) => ({ url, title: guessTitleFromUrl(url) || url }));
    renderPreviewList(document.getElementById('bulk-preview'), bulkItems);
    document.getElementById('bulk-actions').style.display = 'flex';
  });

  document.getElementById('bulk-actions').addEventListener('click', async (e) => {
    if (e.target.id !== 'btn-bulk-import') return;
    const items = readPreviewItems(document.getElementById('bulk-preview'), bulkItems);
    if (!items.length) return;
    const count = await registerItems(items);
    await showAlert(`${count}件のレシピを登録しました。`);
    navigate('/list');
  });

  let bookmarkItems = [];
  document.getElementById('bookmark-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    bookmarkItems = parseBookmarksHtml(await file.text());
    const listEl = document.getElementById('bookmark-list');
    if (!bookmarkItems.length) {
      listEl.innerHTML = '<p class="empty-state">リンクが見つかりませんでした。</p>';
      document.getElementById('bookmark-actions').style.display = 'none';
      return;
    }
    renderPreviewList(listEl, bookmarkItems);
    listEl.querySelectorAll('li[data-index]').forEach((li) => li.classList.add('preview-check-wrap'));
    document.getElementById('bookmark-actions').style.display = 'flex';
  });

  document.getElementById('bookmark-actions').addEventListener('click', async (e) => {
    if (e.target.id === 'btn-select-all') {
      document.querySelectorAll('#bookmark-list .preview-check').forEach((cb) => (cb.checked = true));
      return;
    }
    if (e.target.id === 'btn-bookmark-import') {
      const items = readPreviewItems(document.getElementById('bookmark-list'), bookmarkItems);
      if (!items.length) return;
      const count = await registerItems(items);
      await showAlert(`${count}件のレシピを登録しました。`);
      navigate('/list');
    }
  });
}
