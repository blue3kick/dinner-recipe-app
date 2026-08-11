import { RecipeStore, TagStore, CookingLogStore } from '../db.js';
import { escapeHtml, readFileAsDataUrl, todayStr, starString } from '../constants.js';
import { showConfirm } from '../ui.js';

function linesToHtml(text) {
  return escapeHtml(text || '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `<p>${l}</p>`)
    .join('');
}

export async function renderDetailView(params) {
  const app = document.getElementById('app');
  const id = params.get('id');
  const recipe = id ? await RecipeStore.get(id) : null;
  if (!recipe) {
    app.innerHTML = '<p class="empty-state">レシピが見つかりませんでした。</p>';
    return;
  }
  const allTags = await TagStore.getAll();
  const tagMap = new Map(allTags.map((t) => [t.tag_id, t.name]));
  const tagNames = (recipe.ingredient_tags || []).map((tid) => tagMap.get(tid)).filter(Boolean);
  const logs = await CookingLogStore.getByRecipe(recipe.recipe_id);

  app.innerHTML = `
    <section class="view">
      <div class="detail-header">
        <span class="badge">${escapeHtml(recipe.course_type || 'その他')}</span>
        <h2>${escapeHtml(recipe.title)}</h2>
        <div class="tag-list">${tagNames.map((n) => `<span class="tag-pill">${escapeHtml(n)}</span>`).join('')}</div>
      </div>

      ${recipe.thumbnail_image ? `<img class="detail-image" src="${recipe.thumbnail_image}" alt="" />` : ''}

      ${
        recipe.source_url
          ? `<a class="source-link" href="${escapeHtml(recipe.source_url)}" target="_blank" rel="noopener noreferrer">
              🔗 元記事を開く（${escapeHtml(recipe.source_site || 'その他')}）
            </a>
            <p class="field-note">元記事をそのままPDF保存したい場合は、上のリンクでページを開いてから、開いた先のブラウザの印刷/共有メニューで「PDFとして保存」を選んでください（外部ページの内容は自動取得しないため、ここから直接印刷することはできません）。</p>`
          : ''
      }

      <div class="detail-actions">
        <a class="btn btn-secondary" href="#/form?id=${recipe.recipe_id}">編集</a>
        <button id="btn-print" class="btn btn-primary">🖨 登録内容を印刷</button>
        <a class="btn btn-secondary" href="#/list">一覧へ戻る</a>
      </div>

      <div class="detail-section">
        <h3>材料</h3>
        <div class="detail-text">${linesToHtml(recipe.ingredients) || '<p class="muted">未入力</p>'}</div>
      </div>

      <div class="detail-section">
        <h3>作り方</h3>
        <div class="detail-text">${linesToHtml(recipe.steps) || '<p class="muted">未入力</p>'}</div>
      </div>

      ${
        recipe.memo
          ? `<div class="detail-section"><h3>メモ</h3><div class="detail-text">${linesToHtml(recipe.memo)}</div></div>`
          : ''
      }

      <div class="detail-section">
        <h3>調理記録</h3>
        ${
          logs.length
            ? `<p class="muted">最終調理日: ${escapeHtml(logs[0].cooked_date)}（全${logs.length}回）</p>`
            : '<p class="muted">まだ調理記録がありません。</p>'
        }

        <form id="log-form" class="form" style="max-width:420px;">
          <label class="field"><span>作った日</span>
            <input type="date" id="log-date" class="input" value="${todayStr()}" />
          </label>
          <label class="field"><span>評価</span>
            <select id="log-rating" class="input">
              <option value="0">評価なし</option>
              <option value="5">★★★★★</option>
              <option value="4">★★★★☆</option>
              <option value="3">★★★☆☆</option>
              <option value="2">★★☆☆☆</option>
              <option value="1">★☆☆☆☆</option>
            </select>
          </label>
          <label class="field"><span>メモ</span>
            <textarea id="log-memo" class="input textarea" rows="2" placeholder="味付けメモ、次回への改善点など"></textarea>
          </label>
          <label class="field"><span>写真</span>
            <input type="file" id="log-photo" accept="image/*" />
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">記録を追加</button>
          </div>
        </form>

        <ul class="log-list" id="log-list">
          ${logs
            .map(
              (l) => `
            <li data-id="${l.log_id}">
              ${l.photo ? `<img class="log-photo" src="${l.photo}" alt="" />` : ''}
              <div class="log-body">
                <div class="log-meta">
                  <span class="log-date">${escapeHtml(l.cooked_date)}</span>
                  ${l.rating ? `<span class="log-stars">${starString(l.rating)}</span>` : ''}
                </div>
                ${l.memo ? `<p class="log-memo">${escapeHtml(l.memo)}</p>` : ''}
              </div>
              <button type="button" class="btn btn-danger btn-small" data-action="delete-log">削除</button>
            </li>`
            )
            .join('')}
        </ul>
      </div>
    </section>

    <div id="print-sheet" class="print-only">
      <h1>${escapeHtml(recipe.title)}</h1>
      <div class="print-meta">
        <span>料理区分: ${escapeHtml(recipe.course_type || 'その他')}</span>
        ${tagNames.length ? `<span>食材タグ: ${tagNames.map(escapeHtml).join('、')}</span>` : ''}
        ${recipe.source_url ? `<span>出典: ${escapeHtml(recipe.source_url)}</span>` : ''}
      </div>
      <div class="print-columns">
        <div class="print-col">
          <h2>材料</h2>
          <div>${linesToHtml(recipe.ingredients)}</div>
        </div>
        <div class="print-col print-col-wide">
          <h2>作り方</h2>
          <div>${linesToHtml(recipe.steps)}</div>
        </div>
      </div>
      ${recipe.memo ? `<div class="print-memo"><h2>メモ</h2><div>${linesToHtml(recipe.memo)}</div></div>` : ''}
    </div>
  `;

  document.getElementById('btn-print').addEventListener('click', () => window.print());

  let photoData = '';
  document.getElementById('log-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    photoData = await readFileAsDataUrl(file);
  });

  document.getElementById('log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cooked_date = document.getElementById('log-date').value || todayStr();
    const rating = Number(document.getElementById('log-rating').value) || 0;
    const memo = document.getElementById('log-memo').value.trim();
    await CookingLogStore.add({ recipe_id: recipe.recipe_id, cooked_date, rating, memo, photo: photoData });
    renderDetailView(params);
  });

  document.getElementById('log-list').addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'delete-log') return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    if (!(await showConfirm('この調理記録を削除しますか？'))) return;
    await CookingLogStore.remove(li.dataset.id);
    renderDetailView(params);
  });
}
