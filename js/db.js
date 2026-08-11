// IndexedDBラッパー（ネイティブAPIのみ使用、外部ライブラリ不要でオフライン完結）
const DB_NAME = 'dinner-recipe-db';
const DB_VERSION = 2;
const STORE_RECIPES = 'recipes';
const STORE_TAGS = 'tags';
const STORE_LOGS = 'cookinglogs';
const STORE_SITES = 'sites';

const DEFAULT_SITES = [
  { name: 'クックパッド', host_match: 'cookpad.com' },
  { name: 'Nadia', host_match: 'oceans-nadia.com' },
  { name: 'クラシル', host_match: 'kurashiru.com' },
  { name: 'デリッシュキッチン', host_match: 'delishkitchen.tv' },
];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_RECIPES)) {
        const store = db.createObjectStore(STORE_RECIPES, { keyPath: 'recipe_id' });
        store.createIndex('course_type', 'course_type', { unique: false });
        store.createIndex('ingredient_tags', 'ingredient_tags', { unique: false, multiEntry: true });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_TAGS)) {
        db.createObjectStore(STORE_TAGS, { keyPath: 'tag_id' });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const store = db.createObjectStore(STORE_LOGS, { keyPath: 'log_id' });
        store.createIndex('recipe_id', 'recipe_id', { unique: false });
        store.createIndex('cooked_date', 'cooked_date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SITES)) {
        const store = db.createObjectStore(STORE_SITES, { keyPath: 'site_id' });
        for (const s of DEFAULT_SITES) {
          store.put({ site_id: uuid(), name: s.name, host_match: s.host_match });
        }
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const RecipeStore = {
  async getAll() {
    const store = await tx(STORE_RECIPES, 'readonly');
    return reqToPromise(store.getAll());
  },
  async get(id) {
    const store = await tx(STORE_RECIPES, 'readonly');
    return reqToPromise(store.get(id));
  },
  async put(recipe) {
    const now = new Date().toISOString();
    if (!recipe.recipe_id) {
      recipe.recipe_id = uuid();
      recipe.created_at = now;
    }
    recipe.updated_at = now;
    const store = await tx(STORE_RECIPES, 'readwrite');
    await reqToPromise(store.put(recipe));
    return recipe;
  },
  async remove(id) {
    const store = await tx(STORE_RECIPES, 'readwrite');
    return reqToPromise(store.delete(id));
  },
};

export const TagStore = {
  async getAll() {
    const store = await tx(STORE_TAGS, 'readonly');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  },
  async get(id) {
    const store = await tx(STORE_TAGS, 'readonly');
    return reqToPromise(store.get(id));
  },
  async add(name) {
    const tag = { tag_id: uuid(), name: name.trim() };
    const store = await tx(STORE_TAGS, 'readwrite');
    await reqToPromise(store.put(tag));
    return tag;
  },
  async rename(id, name) {
    const store = await tx(STORE_TAGS, 'readwrite');
    const tag = await reqToPromise(store.get(id));
    if (!tag) return null;
    tag.name = name.trim();
    await reqToPromise(store.put(tag));
    return tag;
  },
  async remove(id) {
    const store = await tx(STORE_TAGS, 'readwrite');
    return reqToPromise(store.delete(id));
  },
};

export const CookingLogStore = {
  async getByRecipe(recipeId) {
    const store = await tx(STORE_LOGS, 'readonly');
    const idx = store.index('recipe_id');
    const all = await reqToPromise(idx.getAll(recipeId));
    return all.sort((a, b) => (b.cooked_date || '').localeCompare(a.cooked_date || ''));
  },
  async getAll() {
    const store = await tx(STORE_LOGS, 'readonly');
    return reqToPromise(store.getAll());
  },
  async add(entry) {
    const log = { log_id: uuid(), ...entry };
    const store = await tx(STORE_LOGS, 'readwrite');
    await reqToPromise(store.put(log));
    return log;
  },
  async remove(id) {
    const store = await tx(STORE_LOGS, 'readwrite');
    return reqToPromise(store.delete(id));
  },
  async removeByRecipe(recipeId) {
    const logs = await this.getByRecipe(recipeId);
    const store = await tx(STORE_LOGS, 'readwrite');
    for (const l of logs) await reqToPromise(store.delete(l.log_id));
  },
};

export const SiteStore = {
  async getAll() {
    const store = await tx(STORE_SITES, 'readonly');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  },
  async add(name, hostMatch) {
    const site = { site_id: uuid(), name: name.trim(), host_match: hostMatch.trim() };
    const store = await tx(STORE_SITES, 'readwrite');
    await reqToPromise(store.put(site));
    return site;
  },
  async update(id, name, hostMatch) {
    const store = await tx(STORE_SITES, 'readwrite');
    const site = await reqToPromise(store.get(id));
    if (!site) return null;
    site.name = name.trim();
    site.host_match = hostMatch.trim();
    await reqToPromise(store.put(site));
    return site;
  },
  async remove(id) {
    const store = await tx(STORE_SITES, 'readwrite');
    return reqToPromise(store.delete(id));
  },
};

export async function detectSourceSite(url) {
  if (!url) return 'その他';
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'その他';
  }
  const sites = await SiteStore.getAll();
  const found = sites.find((s) => s.host_match && host.includes(s.host_match));
  return found ? found.name : 'その他';
}

export async function exportAllData() {
  const [recipes, tags, logs, sites] = await Promise.all([
    RecipeStore.getAll(),
    TagStore.getAll(),
    CookingLogStore.getAll(),
    SiteStore.getAll(),
  ]);
  return { version: DB_VERSION, exported_at: new Date().toISOString(), recipes, tags, cookinglogs: logs, sites };
}

export async function importAllData(data) {
  if (!data || !Array.isArray(data.recipes) || !Array.isArray(data.tags)) {
    throw new Error('不正なデータ形式です');
  }
  const recipeStore = await tx(STORE_RECIPES, 'readwrite');
  for (const r of data.recipes) await reqToPromise(recipeStore.put(r));
  const tagStore = await tx(STORE_TAGS, 'readwrite');
  for (const t of data.tags) await reqToPromise(tagStore.put(t));
  if (Array.isArray(data.cookinglogs)) {
    const logStore = await tx(STORE_LOGS, 'readwrite');
    for (const l of data.cookinglogs) await reqToPromise(logStore.put(l));
  }
  if (Array.isArray(data.sites)) {
    const siteStore = await tx(STORE_SITES, 'readwrite');
    for (const s of data.sites) await reqToPromise(siteStore.put(s));
  }
}

export { uuid };
