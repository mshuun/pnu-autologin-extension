const formEl = document.querySelector('#credentialsForm');
const usernameEl = document.querySelector('#username');
const passwordEl = document.querySelector('#password');
const toggleVisibilityBtn = document.querySelector('#toggleVisibility');
const statusEl = document.querySelector('#status');
const saveButton = document.querySelector('#saveButton');
const refreshButton = document.querySelector('#refreshButton');
const clearButton = document.querySelector('#clearButton');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await refreshState();
}

function bindEvents() {
  formEl.addEventListener('submit', handleSave);
  refreshButton.addEventListener('click', refreshState);
  clearButton.addEventListener('click', handleClear);
  toggleVisibilityBtn.addEventListener('click', togglePasswordVisibility);
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'getState' });

  if (!response?.ok) {
    setStatus(response?.error || '상태를 불러오지 못했습니다.', 'error');
    return;
  }

  if (response.configured) {
    const savedText = response.lastSavedAt
      ? `로그인 정보가 저장되어 있습니다. 최근 저장 시각: ${formatDate(response.lastSavedAt)}`
      : '이미 저장된 로그인 정보가 있습니다.';
    setStatus(savedText, 'success');
  } else {
    setStatus('아직 저장된 로그인 정보가 없습니다.', '');
  }
}

async function handleSave(event) {
  event.preventDefault();

  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  if (!username || !password) {
    setStatus('ID와 비밀번호를 모두 입력하세요.', 'error');
    return;
  }

  setBusy(true);
  setStatus('정보를 안전하게 보관하는 중입니다...', '');

  const response = await chrome.runtime.sendMessage({
    type: 'saveCredentials',
    username,
    password
  });

  setBusy(false);

  if (!response?.ok) {
    setStatus(response?.error || '저장에 실패했습니다.', 'error');
    return;
  }

  formEl.reset();
  passwordEl.type = 'password';
  toggleVisibilityBtn.textContent = '표시';
  setStatus('성공적으로 저장되었습니다! 이제 팝업에서 자동 로그인을 켜고 사용하시면 됩니다.', 'success');
}

async function handleClear() {
  const confirmed = window.confirm('저장된 정보를 모두 삭제할까요?');
  if (!confirmed) return;

  setBusy(true);
  const response = await chrome.runtime.sendMessage({ type: 'clearCredentials' });
  setBusy(false);

  if (!response?.ok) {
    setStatus(response?.error || '삭제에 실패했습니다.', 'error');
    return;
  }

  formEl.reset();
  passwordEl.type = 'password';
  toggleVisibilityBtn.textContent = '표시';
  setStatus('저장된 정보를 모두 삭제했습니다. 자동 로그인도 함께 꺼졌습니다.', 'success');
}

function togglePasswordVisibility() {
  const isPassword = passwordEl.type === 'password';
  passwordEl.type = isPassword ? 'text' : 'password';
  toggleVisibilityBtn.textContent = isPassword ? '숨김' : '표시';
}

function setBusy(busy) {
  saveButton.disabled = busy;
  refreshButton.disabled = busy;
  clearButton.disabled = busy;
  usernameEl.disabled = busy;
  passwordEl.disabled = busy;
  toggleVisibilityBtn.disabled = busy;
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = 'status';
  if (type) {
    statusEl.classList.add(type);
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}