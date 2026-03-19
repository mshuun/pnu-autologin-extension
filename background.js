const STORAGE_KEYS = {
  ENABLED: 'enabled',
  CONFIGURED: 'configured',
  CREDENTIALS: 'credentials'
};

const DB_NAME = 'pnu-auto-login-secure-db';
const STORE_NAME = 'crypto-store';
const MASTER_KEY_ID = 'master-key';
const IV_LENGTH = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let masterKeyCache = null;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.local.get([
    STORAGE_KEYS.ENABLED,
    STORAGE_KEYS.CONFIGURED
  ]);

  const defaults = {};
  if (typeof current[STORAGE_KEYS.ENABLED] !== 'boolean') {
    defaults[STORAGE_KEYS.ENABLED] = false;
  }
  if (typeof current[STORAGE_KEYS.CONFIGURED] !== 'boolean') {
    defaults[STORAGE_KEYS.CONFIGURED] = false;
  }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }

  if (reason === 'install') {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'getState': {
        const state = await getState();
        sendResponse({ ok: true, ...state });
        break;
      }

      case 'setEnabled': {
        const state = await setEnabled(Boolean(message.enabled));
        sendResponse({ ok: true, ...state });
        break;
      }

      case 'saveCredentials': {
        await saveCredentials(message);
        const state = await getState();
        sendResponse({ ok: true, ...state });
        break;
      }

      case 'clearCredentials': {
        await clearCredentials();
        const state = await getState();
        sendResponse({ ok: true, ...state });
        break;
      }

      case 'getAutofillPayload': {
        const payload = await getAutofillPayload();
        sendResponse({ ok: true, ...payload });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type.' });
    }
  })().catch((error) => {
    console.error('[PNU Auto Login]', error);
    sendResponse({
      ok: false,
      error: error?.message || 'Unexpected error.'
    });
  });

  return true;
});

async function getState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.ENABLED,
    STORAGE_KEYS.CONFIGURED,
    STORAGE_KEYS.CREDENTIALS
  ]);

  const credentials = stored[STORAGE_KEYS.CREDENTIALS] ?? null;
  const configured = Boolean(stored[STORAGE_KEYS.CONFIGURED] && credentials);

  return {
    enabled: Boolean(stored[STORAGE_KEYS.ENABLED]) && configured,
    configured,
    lastSavedAt: credentials?.updatedAt ?? null
  };
}

async function setEnabled(enabled) {
  const state = await getState();
  const nextEnabled = state.configured ? enabled : false;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ENABLED]: nextEnabled
  });

  return getState();
}

async function saveCredentials({ username, password }) {
  const safeUsername = String(username ?? '').trim();
  const safePassword = String(password ?? '');

  if (!safeUsername || !safePassword) {
    throw new Error('ID와 비밀번호를 모두 입력하세요.');
  }

  await deleteMasterKey();
  const masterKey = await createAndStoreMasterKey();

  const credentials = {
    username: await encryptText(safeUsername, masterKey),
    password: await encryptText(safePassword, masterKey),
    updatedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.CREDENTIALS]: credentials,
    [STORAGE_KEYS.CONFIGURED]: true
  });
}

async function clearCredentials() {
  await chrome.storage.local.remove(STORAGE_KEYS.CREDENTIALS);
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIGURED]: false,
    [STORAGE_KEYS.ENABLED]: false
  });
  await deleteMasterKey();
}

async function invalidateCredentials() {
  await chrome.storage.local.remove(STORAGE_KEYS.CREDENTIALS);
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIGURED]: false,
    [STORAGE_KEYS.ENABLED]: false
  });
}

async function getAutofillPayload() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.ENABLED,
    STORAGE_KEYS.CONFIGURED,
    STORAGE_KEYS.CREDENTIALS
  ]);

  const enabled = Boolean(stored[STORAGE_KEYS.ENABLED]);
  const configured = Boolean(stored[STORAGE_KEYS.CONFIGURED]);
  const credentials = stored[STORAGE_KEYS.CREDENTIALS];

  if (!enabled || !configured || !credentials) {
    return {
      enabled: false,
      configured: Boolean(configured && credentials),
      needsResave: false
    };
  }

  const masterKey = await getStoredMasterKey();

  if (!masterKey) {
    await invalidateCredentials();
    return {
      enabled: false,
      configured: false,
      needsResave: true
    };
  }

  try {
    const [username, password] = await Promise.all([
      decryptText(credentials.username, masterKey),
      decryptText(credentials.password, masterKey)
    ]);

    return {
      enabled: true,
      configured: true,
      username,
      password,
      attemptNamespace: credentials.updatedAt ?? 'default',
      needsResave: false
    };
  } catch (error) {
    console.warn('[PNU Auto Login] Credential decryption failed:', error);
    await invalidateCredentials();

    return {
      enabled: false,
      configured: false,
      needsResave: true
    };
  }
}

async function encryptText(plainText, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );

  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipherBuffer))
  };
}

async function decryptText(payload, key) {
  if (!payload?.iv || !payload?.data) {
    throw new Error('Invalid encrypted payload.');
  }

  const iv = base64ToBytes(payload.iv);
  const data = base64ToBytes(payload.data);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return decoder.decode(plainBuffer);
}

async function createAndStoreMasterKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  await idbSet(MASTER_KEY_ID, key);
  masterKeyCache = key;
  return key;
}

async function getStoredMasterKey() {
  if (masterKeyCache) {
    return masterKeyCache;
  }

  const key = await idbGet(MASTER_KEY_ID);
  if (key) {
    masterKeyCache = key;
  }
  return key ?? null;
}

async function deleteMasterKey() {
  masterKeyCache = null;
  await idbDelete(MASTER_KEY_ID);
}

function openKeyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

async function idbGet(key) {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    const result = await requestResult(request);
    await transactionDone(tx);
    return result;
  } finally {
    db.close();
  }
}

async function idbSet(key, value) {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function idbDelete(key) {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}