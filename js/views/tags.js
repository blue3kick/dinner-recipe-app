import { TagStore, RecipeStore } from '../db.js';
import { escapeHtml } from '../constants.js';
import { showAlert, showConfirm, showPrompt } from '../ui.js';

export async function renderTagsView() {
  const app = document.getElementById('app');
  const [tags, recipes] = await Promise.all([TagStore.getAll(), RecipeStore.getAll()]);

  function usageCount(tagId) {
    return recipes.filter((r) => (r.ingredient_tags || []).includes(tagId)).length;
  }

  app.innerHTML = `
    <section class="view">
      <h2>食材タグ管理</h2>
      <div class="inline-add">
        <input type="text" id="new-tag-name" class="input" placeholder="新しいタグ名" />
        <button id="btn-add" class="btn btn-primary">追加</button>
      </div>
      <ul class="tag-manage-list" id="tag-manage-list">
        ${
          tags.length
            ? tags
                .map(
                  (t) => `
              <li data-id="${t.tag_id}">
                <span class="tag-name">${escapeHtml(t.name)}</span>
                <span class="muted">使用中: ${usageCount(t.tag_id)}件</span>
                <button class="btn btn-secondary btn-small" data-action="rename">編集</button>
                <button class="btn btn-danger btn-small" data-action="delete">削除</button>
              </li>`
                )
                .join('')
            : '<li class="empty-state">タグがまだありません。</li>'
        }
      </ul>
    </section>
  `;

  document.getElementById('btn-add').addEventListener('click', async () => {
    const input = document.getElementById('new-tag-name');
    const name = input.value.trim();
    if (!name) return;
    if (tags.some((t) => t.name === name)) {
      await showAlert('同じ名前のタグが既にあります。');
      return;
    }
    await TagStore.add(name);
    renderTagsView();
  });

  document.getElementById('tag-manage-list').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const tagId = li.dataset.id;
    const action = e.target.dataset.action;
    if (action === 'rename') {
      const tag = tags.find((t) => t.tag_id === tagId);
      const name = await showPrompt('タグ名を変更', tag.name);
      if (name && name.trim()) {
        await TagStore.rename(tagId, name.trim());
        renderTagsView();
      }
    } else if (action === 'delete') {
      const count = usageCount(tagId);
      const msg = count > 0 ? `${count}件のレシピで使用中です。削除すると各レシピからこのタグが外れます。削除しますか？` : 'このタグを削除しますか？';
      if (!(await showConfirm(msg))) return;
      if (count > 0) {
        const affected = recipes.filter((r) => (r.ingredient_tags || []).includes(tagId));
        for (const r of affected) {
          r.ingredient_tags = r.ingredient_tags.filter((id) => id !== tagId);
          await RecipeStore.put(r);
        }
      }
      await TagStore.remove(tagId);
      renderTagsView();
    }
  });
}
