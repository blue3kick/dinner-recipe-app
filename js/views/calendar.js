import { CookingLogStore, RecipeStore } from '../db.js';
import { escapeHtml, todayStr } from '../constants.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export async function renderCalendarView(params) {
  const app = document.getElementById('app');
  const [logs, recipes] = await Promise.all([CookingLogStore.getAll(), RecipeStore.getAll()]);
  const recipeMap = new Map(recipes.map((r) => [r.recipe_id, r]));

  const today = new Date();
  const y = Number(params.get('y')) || today.getFullYear();
  const m = Number(params.get('m')) || today.getMonth() + 1;

  const logsByDate = new Map();
  for (const log of logs) {
    if (!logsByDate.has(log.cooked_date)) logsByDate.set(log.cooked_date, []);
    logsByDate.get(log.cooked_date).push(log);
  }

  const firstOfMonth = new Date(y, m - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const fmtDate = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let pm = m - 1, py = y;
  if (pm < 1) { pm = 12; py--; }
  let nm = m + 1, ny = y;
  if (nm > 12) { nm = 1; ny++; }

  app.innerHTML = `
    <section class="view">
      <h2>調理記録カレンダー</h2>
      <div class="cal-toolbar">
        <a class="btn btn-secondary" href="#/calendar?y=${py}&m=${pm}">← 前月</a>
        <span class="cal-title">${y}年${m}月</span>
        <a class="btn btn-secondary" href="#/calendar?y=${ny}&m=${nm}">次月 →</a>
      </div>
      <div class="cal-grid">
        ${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join('')}
        ${cells
          .map((d) => {
            if (d === null) return '<div class="cal-cell cal-cell-empty"></div>';
            const dateStr = fmtDate(d);
            const dayLogs = logsByDate.get(dateStr) || [];
            const isToday = dateStr === todayStr();
            return `
              <div class="cal-cell ${isToday ? 'cal-cell-today' : ''}">
                <div class="cal-daynum">${d}</div>
                <div class="cal-entries">
                  ${dayLogs
                    .slice(0, 3)
                    .map((l) => {
                      const r = recipeMap.get(l.recipe_id);
                      return r ? `<a class="cal-entry" href="#/detail?id=${r.recipe_id}" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</a>` : '';
                    })
                    .join('')}
                  ${dayLogs.length > 3 ? `<span class="cal-more">+${dayLogs.length - 3}件</span>` : ''}
                </div>
              </div>`;
          })
          .join('')}
      </div>
    </section>
  `;
}
