const toggleEl = document.querySelector('#toggle');
const noticeEl = document.querySelector('#notice');
const statusBadgeEl = document.querySelector('#statusBadge');
const openOptionsBtn = document.querySelector('#openOptions');
const refreshStateBtn = document.querySelector('#refreshState');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await refreshState();
}

function bindEvents() {
  toggleEl.addEventListener('change', handleToggle);
  openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  refreshStateBtn.addEventListener('click', refreshState);
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'getState' });

  if (!response?.ok) {
    renderError(response?.error || '상태를 불러오지 못했습니다.');
    return;
  }

  renderState(response);
}

async function handleToggle(event) {
  const wantsEnabled = event.currentTarget.checked;

  const stateResponse = await chrome.runtime.sendMessage({ type: 'getState' });
  if (!stateResponse?.ok) {
    renderError(stateResponse?.error || '상태 확인에 실패했습니다.');
    return;
  }

  if (wantsEnabled && !stateResponse.configured) {
    toggleEl.checked = false;
    renderNotice('먼저 Options 페이지에서 ID/PW를 저장하세요.', true);
    await chrome.runtime.openOptionsPage();
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'setEnabled',
    enabled: wantsEnabled
  });

  if (!response?.ok) {
    renderError(response?.error || '토글 상태 변경에 실패했습니다.');
    return;
  }

  renderState(response);
}

function renderState(state) {
  const active = Boolean(state.enabled && state.configured);

  toggleEl.checked = active;
  statusBadgeEl.textContent = active ? 'ON' : 'OFF';
  statusBadgeEl.classList.toggle('on', active);
  statusBadgeEl.classList.toggle('off', !active);

  if (!state.configured) {
    renderNotice('저장된 계정 정보가 없습니다. 먼저 계정 설정을 저장한 뒤 토글을 켜세요.', true);
    return;
  }

  if (active) {
    renderNotice('자동 로그인이 활성화되었습니다.');
  } else {
    renderNotice('계정은 저장되어 있지만 자동 로그인은 현재 꺼져 있습니다.');
  }
}

function renderNotice(message, warn = false) {
  noticeEl.textContent = message;
  noticeEl.classList.toggle('warn', warn);
}

function renderError(message) {
  toggleEl.checked = false;
  statusBadgeEl.textContent = 'ERR';
  statusBadgeEl.classList.remove('on');
  statusBadgeEl.classList.add('off');
  renderNotice(message, true);
}