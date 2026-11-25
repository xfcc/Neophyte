/* A display-only privacy switch for the public static site. */
(() => {
  const button = document.querySelector('#profit-unlock');
  const dialog = document.querySelector('#profit-dialog');
  const form = dialog.querySelector('form');
  const input = form.elements.password;
  const error = document.querySelector('#profit-error');
  const submit = form.querySelector('[type="submit"]');
  const root = document.documentElement;
  const passwordDigest = 'a55f3ae610c93b6ee2c9d783bd9e26521d035600dd206d2339f8e4969f78bb0c';

  function clearError() {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  button.addEventListener('click', () => {
    if (!root.classList.contains('profit-locked')) {
      root.classList.add('profit-locked');
      button.setAttribute('aria-label', '解锁持仓盈亏');
      button.title = '解锁持仓盈亏';
      button.setAttribute('aria-pressed', 'false');
      return;
    }
    form.reset();
    clearError();
    dialog.showModal();
    input.focus();
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    form.reset();
    clearError();
  });
  input.addEventListener('input', clearError);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value));
      const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== passwordDigest) {
        error.textContent = '密码错误，请重试';
        input.setAttribute('aria-invalid', 'true');
        input.select();
        return;
      }
      root.classList.remove('profit-locked');
      button.setAttribute('aria-label', '隐藏持仓盈亏');
      button.title = '隐藏持仓盈亏';
      button.setAttribute('aria-pressed', 'true');
      dialog.close();
    } catch {
      error.textContent = '暂时无法验证密码，请刷新后重试';
    } finally {
      submit.disabled = false;
    }
  });
})();
