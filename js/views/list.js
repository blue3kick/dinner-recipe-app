import { RecipeStore, TagStore, CookingLogStore } from '../db.js';
import { navigate } from '../router.js';
import { COURSE_TYPES, escapeHtml } from '../constants.js';

export async function renderListView(params) {
  const app = document.getElementById('app');
  const [recipes, tags, logs] = await Promise.all([RecipeStore.getAll(), TagStore.getAll(), CookingLogStore.getAll()]);
  const tagMap = new Map(tags.map((t) => [t.tag_id, t.name]));

  const lastCookedMap = new Map();
  for (const log of logs) {
    const cur = lastCookedMap.get(log.recipe_id);
    if (!cur || log.cooked_date > cur) lastCookedMap.set(log.recipe_id, log.cooked_date);
  }

  const state = {
    keyword: params.get('q') || '',
    course: params.get('course') || '',
    tags: new Set((params.get('tags') || '').split(',').filter(Boolean)),
    sort: params.get('sort') || 'updated',
  };

  app.innerHTML = `
    <section class="view">
      <div class="toolbar">
        <input type="search" id="search-keyword" class="input" placeholder="タイトルで検索" value="${escapeHtml(state.keyword)}" />
        <button id="btn-new" class="btn btn-primary">＋ レシピ登録</button>
      </div>

      <div class="filter-panel">
        <div class="filter-group">
          <span class="filter-label">料理区分</span>
          <div class="chip-row" id="course-filter">
            <button class="chip ${state.course === '' ? 'chip-active' : ''}" data-course="">すべて</button>
            ${COURSE_TYPES.map(
              (c) => `<button class="chip ${state.course === c ? 'chip-active' : ''}" data-course="${c}">${c}</button>`
            ).join('')}
          </div>
        </div>
        <div class="filter-group">
          <span class="filter-label">食材タグ</span>
          <div class="chip-row" id="tag-filter">
            ${
              tags.length
                ? tags
                    .map(
                      (t) =>
                        `<button class="chip ${state.tags.has(t.tag_id) ? 'chip-active' : ''}" data-tag="${t.tag_id}">${escapeHtml(t.name)}</button>`
                    )
                    .join('')
                : '<span class="muted">タグがまだありません（タグ管理画面から追加できます）</span>'
            }
          </div>
        </div>
        <div class="filter-group">
          <span class="filter-label">並び替え</span>
          <div class="chip-row" id="sort-filter">
            <button class="chip ${state.sort === 'updated' ? 'chip-active' : ''}" data-sort="updated">更新が新しい順</button>
            <button class="chip ${state.sort === 'stale' ? 'chip-active' : ''}" data-sort="stale">しばらく作ってない順</button>
          </div>
        </div>
      </div>

      <div id="recipe-list" class="recipe-grid"></div>
    </section>
  `;

  const listEl = document.getElementById('recipe-list');

  function renderList() {
    const filtered = recipes.filter((r) => {
      if (state.course && r.course_type !== state.course) return false;
      if (state.tags.size && ![...state.tags].every((t) => (r.ingredient_tags || []).includes(t))) return false;
      if (state.keyword && !r.title.toLowerCase().includes(state.keyword.toLowerCase())) return false;
      return true;
    });

    if (state.sort === 'stale') {
      filtered.sort((a, b) => (lastCookedMap.get(a.recipe_id) || '').localeCompare(lastCookedMap.get(b.recipe_id) || ''));
    } else {
      filtered.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-state">${recipes.length ? '条件に一致するレシピがありません。' : 'まだレシピがありません。右上の「＋ レシピ登録」から追加しましょう。'}</p>`;
      return;
    }
    listEl.innerHTML = filtered
      .map((r) => {
        const tagNames = (r.ingredient_tags || []).map((id) => tagMap.get(id)).filter(Boolean);
        const lastCooked = lastCookedMap.get(r.recipe_id);
        return `
          <a class="recipe-card" href="#/detail?id=${r.recipe_id}">
            <div class="recipe-thumb">
              ${r.thumbnail_image ? `<img src="${r.thumbnail_image}" alt="" />` : '<div class="thumb-placeholder">🍽</div>'}
            </div>
            <div class="recipe-card-body">
              <span class="badge">${escapeHtml(r.course_type || 'その他')}</span>
              <h3>${escapeHtml(r.title)}</h3>
              <div class="tag-list">${tagNames.map((n) => `<span class="tag-pill">${escapeHtml(n)}</span>`).join('')}</div>
              <div class="cooked-hint">${lastCooked ? `最終調理: ${escapeHtml(lastCooked)}` : '未調理'}</div>
            </div>
          </a>
        `;
      })
      .join('');
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (state.keyword) next.set('q', state.keyword);
    if (state.course) next.set('course', state.course);
    if (state.tags.size) next.set('tags', [...state.tags].join(','));
    if (state.sort !== 'updated') next.set('sort', state.sort);
    const qs = next.toString();
    history.replaceState(null, '', `#/list${qs ? '?' + qs : ''}`);
  }

  renderList();

  document.getElementById('btn-new').addEventListener('click', () => navigate('/form'));

  document.getElementById('search-keyword').addEventListener('input', (e) => {
    state.keyword = e.target.value;
    syncUrl();
    renderList();
  });

  document.getElementById('course-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-course]');
    if (!btn) return;
    state.course = btn.dataset.course;
    document.querySelectorAll('#course-filter .chip').forEach((c) => c.classList.toggle('chip-active', c === btn));
    syncUrl();
    renderList();
  });

  document.getElementById('tag-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    const tagId = btn.dataset.tag;
    if (state.tags.has(tagId)) state.tags.delete(tagId);
    else state.tags.add(tagId);
    btn.classList.toggle('chip-active', state.tags.has(tagId));
    syncUrl();
    renderList();
  });

  document.getElementById('sort-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    state.sort = btn.dataset.sort;
    document.querySelectorAll('#sort-filter .chip').forEach((c) => c.classList.toggle('chip-active', c === btn));
    syncUrl();
    renderList();
  });
}
