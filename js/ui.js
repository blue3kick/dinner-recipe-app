// window.alert/confirm/prompt はサンドボックス環境（埋め込みiframe等）でブロックされることがあるため、
// 常に自作モーダルを使う。処理はここに一本化する。

function showModal({ message, input, defaultValue, buttons }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <p class="modal-message"></p>
        ${input ? '<input type="text" class="input modal-input" />' : ''}
        <div class="modal-actions">
          ${buttons.map((b, i) => `<button type="button" class="btn ${b.primary ? 'btn-primary' : 'btn-secondary'}" data-idx="${i}">${b.label}</button>`).join('')}
        </div>
      </div>
    `;
    overlay.querySelector('.modal-message').textContent = message;
    const inputEl = overlay.querySelector('.modal-input');
    if (inputEl) inputEl.value = defaultValue || '';
    document.body.appendChild(overlay);
    (inputEl || overlay.querySelector('[data-idx]'))?.focus();
    if (inputEl) inputEl.select();

    function cleanup(value) {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', onKeydown);
      resolve(value);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') cleanup(input ? null : false);
      if (e.key === 'Enter' && input) {
        e.preventDefault();
        cleanup(inputEl.value);
      }
    }
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) cleanup(input ? null : false);
    });
    overlay.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = buttons[Number(btn.dataset.idx)];
        cleanup(b.value === 'SUBMIT' ? inputEl.value : b.value);
      });
    });
  });
}

export function showAlert(message) {
  return showModal({ message, buttons: [{ label: 'OK', value: true, primary: true }] });
}

export function showConfirm(message) {
  return showModal({
    message,
    buttons: [
      { label: 'キャンセル', value: false },
      { label: 'OK', value: true, primary: true },
    ],
  });
}

export function showPrompt(message, defaultValue = '') {
  return showModal({
    message,
    input: true,
    defaultValue,
    buttons: [
      { label: 'キャンセル', value: null },
      { label: 'OK', value: 'SUBMIT', primary: true },
    ],
  });
}
