const SITE_PROFILES = [
  {
    key: 'plato',
    matches: (url) => /^https?:\/\/plato\.pusan\.ac\.kr\//i.test(url),
    selectors: {
      username: '#input-username',
      password: '#input-password',
      button: 'input[name="loginbutton"]'
    }
  },
  {
    key: 'onestop',
    matches: (url) =>
      /^https?:\/\/onestop\.pusan\.ac\.kr\//i.test(url) ||
      /^https?:\/\/login\.pusan\.ac\.kr\/onestop\/loginPage/i.test(url),
    selectors: {
      username: '#login_id',
      password: '#login_pw',
      button: '#btnLogin'
    }
  }
];

const MAX_ATTEMPTS_PER_SESSION = 2;
const CLICK_DELAY_MS = 180;
const WAIT_TIMEOUT_MS = 8000;

const currentSite = SITE_PROFILES.find((site) => site.matches(location.href));

if (currentSite) {
  void tryAutoLogin(currentSite);
}

async function tryAutoLogin(site) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAutofillPayload' });

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to get autofill payload.');
    }

    if (!response.enabled || !response.configured) {
      return;
    }

    const attemptKey = getAttemptKey(site.key, response.attemptNamespace);
    const currentAttempts = getAttemptCount(attemptKey);

    if (currentAttempts >= MAX_ATTEMPTS_PER_SESSION) {
      console.warn('[PNU Auto Login] Attempt limit reached for this session.');
      return;
    }

    const elements = await waitForElements(site.selectors, WAIT_TIMEOUT_MS);
    if (!elements) {
      return;
    }

    incrementAttemptCount(attemptKey);

    fillInput(elements.username, response.username);
    fillInput(elements.password, response.password);

    await sleep(CLICK_DELAY_MS);
    clickButton(elements.button);
  } catch (error) {
    console.warn('[PNU Auto Login]', error);
  }
}

function fillInput(element, value) {
  if (!element) return;

  element.focus({ preventScroll: true });

  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  dispatchInputEvents(element);
  element.blur();
}

function dispatchInputEvents(element) {
  ['input', 'change'].forEach((type) => {
    element.dispatchEvent(
      new Event(type, {
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
  });
}

function clickButton(button) {
  if (!button) return;

  if (typeof button.click === 'function') {
    button.click();
    return;
  }

  button.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );
}

function waitForElements(selectors, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const pick = () => {
      const username = document.querySelector(selectors.username);
      const password = document.querySelector(selectors.password);
      const button = document.querySelector(selectors.button);

      if (username && password && button) {
        observer.disconnect();
        resolve({ username, password, button });
        return true;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        observer.disconnect();
        resolve(null);
        return true;
      }

      return false;
    };

    const observer = new MutationObserver(() => {
      pick();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    pick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAttemptKey(siteKey, namespace = 'default') {
  return `pnu-auto-login:${siteKey}:${namespace}`;
}

function getAttemptCount(key) {
  try {
    return Number(sessionStorage.getItem(key) ?? '0');
  } catch {
    return 0;
  }
}

function incrementAttemptCount(key) {
  try {
    const next = getAttemptCount(key) + 1;
    sessionStorage.setItem(key, String(next));
  } catch {
    // sessionStorage 접근 실패 시 무시
  }
}