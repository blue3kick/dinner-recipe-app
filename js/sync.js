// Firebase Authentication(Googleログイン) + Firestoreによる端末間リアルタイム同期。
// db.jsはこのファイルの存在を知らない(setSyncHookで疎結合に接続する)。
// オフライン時やCDNに到達できない場合は呼び出し側でimport('./sync.js')ごとcatchされ、
// アプリ本体(IndexedDBのみ)は問題なく動作し続ける。

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import {
  setSyncHook,
  SyncBridge,
  STORE_RECIPES,
  STORE_TAGS,
  STORE_LOGS,
  STORE_SITES,
  RecipeStore,
  TagStore,
  CookingLogStore,
  SiteStore,
} from './db.js';
import { rerenderCurrent } from './router.js';

const KEY_FIELDS = {
  [STORE_RECIPES]: 'recipe_id',
  [STORE_TAGS]: 'tag_id',
  [STORE_LOGS]: 'log_id',
  [STORE_SITES]: 'site_id',
};
const LOCAL_STORES = {
  [STORE_RECIPES]: RecipeStore,
  [STORE_TAGS]: TagStore,
  [STORE_LOGS]: CookingLogStore,
  [STORE_SITES]: SiteStore,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbFs = getFirestore(app);

let unsubscribers = [];
let currentUid = null;
let statusListeners = [];
let ready = false;

function userCollection(storeName) {
  return collection(dbFs, 'users', currentUid, storeName);
}

async function pushToFirestore(storeName, action, record) {
  if (!currentUid) return;
  const id = record[KEY_FIELDS[storeName]];
  if (!id) return;
  const ref = doc(dbFs, 'users', currentUid, storeName, id);
  try {
    if (action === 'delete') await deleteDoc(ref);
    else await setDoc(ref, record);
  } catch (e) {
    console.error('firestore sync push failed', e);
  }
}

let applyTimer = null;
async function applyRemoteChanges(storeName, snapshot) {
  const changes = snapshot.docChanges();
  for (const change of changes) {
    if (change.type === 'removed') {
      await SyncBridge.applyDelete(storeName, change.doc.id);
    } else {
      await SyncBridge.applyPut(storeName, change.doc.data());
    }
  }
  if (changes.length) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => rerenderCurrent(), 150);
  }
}

async function startSync(uid) {
  currentUid = uid;

  // 初回サインイン時、クラウド側が空ならこの端末の既存データを初期データとしてアップロードする
  for (const storeName of Object.keys(LOCAL_STORES)) {
    const remoteSnap = await getDocs(userCollection(storeName));
    if (remoteSnap.empty) {
      const localRecords = await LOCAL_STORES[storeName].getAll();
      for (const record of localRecords) {
        await setDoc(doc(dbFs, 'users', currentUid, storeName, record[KEY_FIELDS[storeName]]), record);
      }
    }
  }

  setSyncHook(pushToFirestore);
  for (const storeName of Object.keys(LOCAL_STORES)) {
    const unsub = onSnapshot(userCollection(storeName), (snapshot) => applyRemoteChanges(storeName, snapshot));
    unsubscribers.push(unsub);
  }
}

function stopSync() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  setSyncHook(null);
  currentUid = null;
}

function notifyStatus() {
  const status = getStatus();
  statusListeners.forEach((fn) => fn(status));
}

// signInWithRedirectで戻ってきた際の結果/エラーを拾う(成功時はonAuthStateChangedも別途発火する)。
// getRedirectResult自体はPromiseなので、呼び出し側は必ずwaitForRedirectResult()でawaitしてから
// エラー有無を確認すること(そうしないと未解決のうちに読んでしまい常にnullに見える)。
let redirectError = null;
let redirectUser = null;
const redirectResultPromise = getRedirectResult(auth)
  .then((result) => {
    redirectUser = result?.user || null;
  })
  .catch((err) => {
    redirectError = err;
  });

export async function waitForRedirectResult() {
  await redirectResultPromise;
  return { error: redirectError, user: redirectUser };
}

onAuthStateChanged(auth, async (user) => {
  if (user) await startSync(user.uid);
  else stopSync();
  ready = true;
  notifyStatus();
});

export function onStatusChange(fn) {
  statusListeners.push(fn);
  return () => {
    statusListeners = statusListeners.filter((f) => f !== fn);
  };
}

export function getStatus() {
  const user = auth.currentUser;
  return {
    ready,
    signedIn: !!user,
    displayName: user?.displayName || '',
    email: user?.email || '',
    photoURL: user?.photoURL || '',
  };
}

export async function signIn() {
  // ポップアップ方式はブラウザ判定・ストレージ分離・「デスクトップサイトを表示」設定などの影響を受けやすく
  // 環境によって無反応のまま固まることがあるため、全端末で一貫してリダイレクト方式を使う。
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

export async function signOutUser() {
  await signOut(auth);
}
