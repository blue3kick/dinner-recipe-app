import { RecipeStore, TagStore, CookingLogStore, detectSourceSite } from '../db.js';
import { navigate } from '../router.js';
import { COURSE_TYPES, escapeHtml, readFileAsDataUrl, guessTitleFromUrl } from '../constants.js';
import { showConfirm } from '../ui.js';

export async function renderFormView(params) {
  const app = document.getElementById('app');
  const id = params.get('id');
  const existing = id ? await RecipeStore.get(id) : null;
  if (id && !existing) {
    app.innerHTML = '<p class="empty-state">レシピが見つかりませんでした。</p>';
    return;
  }
  let tags = await TagStore.getAll();

  const prefillUrl = params.get('prefill_url') || '';
  const prefillTitle = params.get('prefill_title') || (prefillUrl ? guessTitleFromUrl(prefillUrl) : '');

  const recipe = existing
    ? { ...existing }
    : {
        recipe_id: null,
        title: prefillTitle,
        source_url: prefillUrl,
        thumbnail_image: '',
        course_type: COURSE_TYPES[0],
        ingredient_tags: [],
        ingredients: '',
        steps: '',
        memo: '',
      };
  const selectedTags = new Set(recipe.ingredient_tags || []);

  app.innerHTML = `
    <section class="view">
      <h2>${existing ? 'レシピを編集' : 'レシピを登録'}</h2>
      <form id="recipe-form" class="form">
        <label class="field">
          <span>タイトル <span class="required">*</span></span>
          <input type="text" id="f-title" class="input" required value="${escapeHtml(recipe.title)}" />
        </label>

        <label class="field">
          <span>出典URL</span>
          <input type="url" id="f-url" class="input" placeholder="https://..." value="${escapeHtml(recipe.source_url)}" />
        </label>
        <p class="field-note">※ プライバシー保護のためURL先のページ内容は自動取得しません。タイトル等は手動で入力してください。</p>

        <label class="field">
          <span>料理区分</span>
          <select id="f-course" class="input">
            ${COURSE_TYPES.map((c) => `<option value="${c}" ${recipe.course_type === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>

        <div class="field">
          <span>食材タグ</span>
          <div class="chip-row" id="tag-picker">
            ${tags
              .map(
                (t) =>
                  `<button type="button" class="chip ${selectedTags.has(t.tag_id) ? 'chip-active' : ''}" data-tag="${t.tag_id}">${escapeHtml(t.name)}</button>`
              )
              .join('')}
          </div>
          <div class="inline-add">
            <input type="text" id="f-new-tag" class="input" placeholder="新しいタグを追加" />
            <button type="button" id="btn-add-tag" class="btn btn-secondary">追加</button>
          </div>
        </div>

        <label class="field">
          <span>画像</span>
          <input type="file" id="f-image" accept="image/*" />
          <div id="image-preview">${recipe.thumbnail_image ? `<img src="${recipe.thumbnail_image}" alt="" />` : ''}</div>
        </label>

        <label class="field">
          <span>材料（分量含む）</span>
          <textarea id="f-ingredients" class="input textarea" rows="6" placeholder="例）\n・鶏もも肉 300g\n・玉ねぎ 1個">${escapeHtml(recipe.ingredients)}</textarea>
        </label>

        <label class="field">
          <span>作り方</span>
          <textarea id="f-steps" class="input textarea" rows="8" placeholder="例）\n1. 鶏肉を一口大に切る\n2. ...">${escapeHtml(recipe.steps)}</textarea>
        </label>

        <label class="field">
          <span>メモ</span>
          <textarea id="f-memo" class="input textarea" rows="3">${escapeHtml(recipe.memo)}</textarea>
        </label>

        <div class="form-actions">
          <button type="button" id="btn-cancel" class="btn btn-secondary">キャンセル</button>
          ${existing ? '<button type="button" id="btn-delete" class="btn btn-danger">削除</button>' : ''}
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </section>
  `;

  let imageData = recipe.thumbnail_image;

  document.getElementById('tag-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    const tagId = btn.dataset.tag;
    if (selectedTags.has(tagId)) selectedTags.delete(tagId);
    else selectedTags.add(tagId);
    btn.classList.toggle('chip-active', selectedTags.has(tagId));
  });

  document.getElementById('btn-add-tag').addEventListener('click', async () => {
    const input = document.getElementById('f-new-tag');
    const name = input.value.trim();
    if (!name) return;
    const dup = tags.find((t) => t.name === name);
    if (dup) {
      selectedTags.add(dup.tag_id);
    } else {
      const created = await TagStore.add(name);
      tags = await TagStore.getAll();
      selectedTags.add(created.tag_id);
    }
    input.value = '';
    rerenderTagPicker();
  });

  function rerenderTagPicker() {
    const el = document.getElementById('tag-picker');
    el.innerHTML = tags
      .map(
        (t) =>
          `<button type="button" class="chip ${selectedTags.has(t.tag_id) ? 'chip-active' : ''}" data-tag="${t.tag_id}">${escapeHtml(t.name)}</button>`
      )
      .join('');
  }

  document.getElementById('f-image').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    imageData = await readFileAsDataUrl(file);
    document.getElementById('image-preview').innerHTML = `<img src="${imageData}" alt="" />`;
  });

  document.getElementById('btn-cancel').addEventListener('click', () => history.back());

  const deleteBtn = document.getElementById('btn-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!(await showConfirm('このレシピを削除しますか？関連する調理記録も削除され、この操作は取り消せません。'))) return;
      await CookingLogStore.removeByRecipe(existing.recipe_id);
      await RecipeStore.remove(existing.recipe_id);
      navigate('/list');
    });
  }

  document.getElementById('recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('f-title').value.trim();
    if (!title) return;
    const sourceUrl = document.getElementById('f-url').value.trim();
    const toSave = {
      ...recipe,
      title,
      source_url: sourceUrl,
      source_site: await detectSourceSite(sourceUrl),
      course_type: document.getElementById('f-course').value,
      ingredient_tags: [...selectedTags],
      thumbnail_image: imageData,
      ingredients: document.getElementById('f-ingredients').value,
      steps: document.getElementById('f-steps').value,
      memo: document.getElementById('f-memo').value,
    };
    const saved = await RecipeStore.put(toSave);
    navigate(`/detail?id=${saved.recipe_id}`);
  });
}
