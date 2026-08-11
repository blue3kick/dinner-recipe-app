// 簡易ハッシュルーター
const routes = [];

export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

function parseHash() {
  const hash = location.hash.slice(1) || '/list';
  const [path, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');
  return { path, params };
}

async function render() {
  const { path, params } = parseHash();
  const match = routes.find((r) => r.pattern === path) || routes.find((r) => r.pattern === '/list');
  document.querySelectorAll('.nav-link').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === `#${path}`);
  });
  await match.handler(params);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);
  if (document.readyState === 'complete') render();
}

export function navigate(path) {
  location.hash = path;
}
