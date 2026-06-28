const STORAGE_KEY = 'tabSaver_sessions';
const RAM_PER_TAB = 150;
const TOAST_DURATION = 3000;

let currentEditingId = null;
let pendingConfirm = null;

// ─── Storage ─────────────────────────────────────────

function getSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(s => {
      const tabs = (s.tabs || []).map(t => ({
        url: t.url || '',
        title: t.title || '',
        favIconUrl: t.favIconUrl || ''
      }));
      return { id: s.id, name: s.name || 'Untitled', savedAt: s.savedAt || s.id, tabs };
    });
  } catch { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

// ─── Toast ───────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), TOAST_DURATION);
}

// ─── Modal ───────────────────────────────────────────

function showModal(title, name, confirmText, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalName').textContent = name ? `"${name}"` : '';
  document.getElementById('modalConfirmBtn').textContent = confirmText;
  pendingConfirm = onConfirm;
  document.getElementById('modal').classList.remove('hidden');
}

function hideModal() {
  pendingConfirm = null;
  document.getElementById('modal').classList.add('hidden');
}

// ─── Tab Helpers ─────────────────────────────────────

function getCurrentTabs(cb) {
  chrome.tabs.query({ currentWindow: true }, cb);
}

function closeTabIds(ids, done) {
  if (!ids.length) { if (done) done(); return; }
  chrome.tabs.remove(ids, () => {
    if (chrome.runtime.lastError) { /* ignore */ }
    if (done) done();
  });
}

// ─── Close All Tabs ──────────────────────────────────

function handleCloseAll() {
  showModal(
    'Close all tabs in this window?',
    'A new blank tab will open.',
    'Close',
    () => {
      chrome.tabs.create({}, newTab => {
        const newTabId = newTab ? newTab.id : null;
        getCurrentTabs(tabs => {
          if (!tabs || !tabs.length) return;
          const newTabUrls = new Set(['chrome://newtab/', '', 'about:newtab']);
          const ids = tabs
            .filter(t => t.id !== newTabId && t.id !== chrome.tabs.TAB_ID_NONE && !newTabUrls.has(t.url))
            .map(t => t.id);
          const count = tabs.length;
          closeTabIds(ids, () => {
            const mb = ids.length * RAM_PER_TAB;
            showToast(`${ids.length} tab${ids.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`);
          });
        });
      });
    }
  );
}

// ─── Save Flow ───────────────────────────────────────

function showSaveFlow() {
  document.getElementById('saveFlow').classList.remove('hidden');
  document.getElementById('saveChecklistStep').classList.add('hidden');
  document.getElementById('saveNameStep').classList.remove('hidden');
  document.getElementById('saveNameInput').value = '';
  setTimeout(() => document.getElementById('saveNameInput').focus(), 50);
}

function hideSaveFlow() {
  document.getElementById('saveFlow').classList.add('hidden');
}

function confirmSaveName() {
  const input = document.getElementById('saveNameInput');
  let name = input.value.trim();
  if (!name) {
    const now = new Date();
    name = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  getCurrentTabs(tabs => {
    if (!tabs || !tabs.length) return;
    renderChecklist(tabs);
    document.getElementById('saveNameStep').classList.add('hidden');
    document.getElementById('saveChecklistStep').classList.remove('hidden');
    document.getElementById('saveChecklistStep').dataset.name = name;
  });
}

function renderChecklist(tabs) {
  const container = document.getElementById('tabChecklist');
  container.innerHTML = '';
  tabs.forEach((tab, i) => {
    const label = document.createElement('label');
    label.className = 'check-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.i = i;
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = tab.favIconUrl || '';
    img.alt = '';
    img.onerror = function () { this.style.display = 'none'; };
    const span = document.createElement('span');
    span.className = 'item-title';
    span.textContent = tab.title || tab.url || 'Untitled';
    label.append(cb, img, span);
    container.appendChild(label);
  });
}

function confirmSaveChecklist() {
  const name = document.getElementById('saveChecklistStep').dataset.name || 'Untitled';
  const checkboxes = document.querySelectorAll('#tabChecklist .check-item input[type="checkbox"]:checked');
  if (!checkboxes.length) return;

  getCurrentTabs(tabs => {
    const tabData = [];
    const closeIds = [];
    const currentId = tabs.find(t => t.active)?.id;

    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.i);
      const tab = tabs[idx];
      if (tab && tab.url) {
        tabData.push({ url: tab.url, title: tab.title || '', favIconUrl: tab.favIconUrl || '' });
      }
      if (tab && tab.id !== chrome.tabs.TAB_ID_NONE && tab.id !== currentId) {
        closeIds.push(tab.id);
      }
    });

    if (!tabData.length) return;

    const sessions = getSessions();
    sessions.push({ id: Date.now(), name, savedAt: Date.now(), tabs: tabData });
    saveSessions(sessions);

    const mb = closeIds.length * RAM_PER_TAB;
    hideSaveFlow();
    renderSessionList();

    if (closeIds.length) {
      closeTabIds(closeIds, () => showToast(`${closeIds.length} tab${closeIds.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`));
    }
  });
}

// ─── Render Sessions ─────────────────────────────────

function renderSessionList() {
  const list = document.getElementById('sessionList');
  const empty = document.getElementById('emptyMsg');
  const sessions = getSessions();
  list.innerHTML = '';

  if (!sessions.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  [...sessions].reverse().forEach(s => list.appendChild(createSessionCard(s)));
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.dataset.id = session.id;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'session-header';

  const info = document.createElement('div');
  info.className = 'session-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'session-name';
  nameEl.textContent = session.name;

  const meta = document.createElement('div');
  meta.className = 'session-meta';
  const d = new Date(session.savedAt);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  meta.innerHTML = `<span>${dateStr} ${timeStr}</span><span class="dot">·</span><span>${session.tabs.length} tab${session.tabs.length !== 1 ? 's' : ''}</span>`;

  const favRow = document.createElement('div');
  favRow.className = 'session-favicons';
  renderFavicons(session.tabs, favRow);

  info.append(nameEl, meta, favRow);

  const actions = document.createElement('div');
  actions.className = 'session-actions';

  // Pencil
  const pencilBtn = document.createElement('button');
  pencilBtn.className = 'icon-btn';
  pencilBtn.title = 'Edit session';
  pencilBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  pencilBtn.addEventListener('click', e => { e.stopPropagation(); toggleEdit(session.id); });

  // Restore
  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'icon-btn';
  restoreBtn.title = 'Restore tabs';
  restoreBtn.innerHTML = '<span class="material-symbols-outlined">restore</span>';
  restoreBtn.addEventListener('click', e => { e.stopPropagation(); restoreSession(session); });

  // X (close matching)
  const closeMatchBtn = document.createElement('button');
  closeMatchBtn.className = 'icon-btn danger';
  closeMatchBtn.title = 'Close matching open tabs';
  closeMatchBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  closeMatchBtn.addEventListener('click', e => { e.stopPropagation(); closeMatchingTabs(session); });

  // Trash
  const trashBtn = document.createElement('button');
  trashBtn.className = 'icon-btn danger';
  trashBtn.title = 'Delete session';
  trashBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  trashBtn.addEventListener('click', e => { e.stopPropagation(); deleteSession(session); });

  actions.append(pencilBtn, restoreBtn, closeMatchBtn, trashBtn);
  header.append(info, actions);
  card.appendChild(header);

  // ── Edit Panel ──
  const editPanel = document.createElement('div');
  editPanel.className = 'edit-panel hidden';

  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.type = 'text';
  nameInput.value = session.name;
  nameInput.maxLength = 50;
  nameInput.placeholder = 'Session name';

  const editList = document.createElement('div');
  editList.className = 'edit-checklist';
  session.tabs.forEach((t, i) => {
    const label = document.createElement('label');
    label.className = 'check-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.i = i;
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = t.favIconUrl || '';
    img.alt = '';
    img.onerror = function () { this.style.display = 'none'; };
    const span = document.createElement('span');
    span.className = 'item-title';
    span.textContent = t.title || t.url || 'Untitled';
    label.append(cb, img, span);
    editList.appendChild(label);
  });

  const editActions = document.createElement('div');
  editActions.className = 'edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => cancelEdit(session.id));

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary-sm';
  saveBtn.textContent = 'Save Changes';
  saveBtn.addEventListener('click', () => saveEdit(session.id));

  editActions.append(cancelBtn, saveBtn);
  editPanel.append(nameInput, editList, editActions);

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEdit(session.id);
    if (e.key === 'Escape') cancelEdit(session.id);
  });

  card.appendChild(editPanel);

  return card;
}

function renderFavicons(tabs, container) {
  const max = 6;
  const show = Math.min(tabs.length, max);

  for (let i = 0; i < show; i++) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = tabs[i].favIconUrl || '';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; };
    container.appendChild(img);
  }

  if (tabs.length > max) {
    const more = document.createElement('span');
    more.className = 'more-text';
    more.textContent = `+${tabs.length - max} more`;
    container.appendChild(more);
  }
}

// ─── Edit Mode ───────────────────────────────────────

function toggleEdit(id) {
  if (currentEditingId === id) {
    cancelEdit(id);
  } else {
    if (currentEditingId !== null) cancelEdit(currentEditingId);
    currentEditingId = id;
    const card = document.querySelector(`.session-card[data-id="${id}"]`);
    if (!card) return;
    const panel = card.querySelector('.edit-panel');
    if (panel) panel.classList.remove('hidden');
  }
}

function cancelEdit(id) {
  if (currentEditingId !== id) return;
  currentEditingId = null;
  const card = document.querySelector(`.session-card[data-id="${id}"]`);
  if (!card) return;
  const panel = card.querySelector('.edit-panel');
  if (panel) panel.classList.add('hidden');
}

function saveEdit(id) {
  const card = document.querySelector(`.session-card[data-id="${id}"]`);
  if (!card) return;
  const panel = card.querySelector('.edit-panel');
  if (!panel) return;

  const nameInput = panel.querySelector('.input');
  const checks = panel.querySelectorAll('.edit-checklist .check-item input[type="checkbox"]');

  const sessions = getSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;

  const newName = nameInput.value.trim();
  if (newName) session.name = newName;

  const newTabs = [];
  checks.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.dataset.i);
      if (idx < session.tabs.length) newTabs.push(session.tabs[idx]);
    }
  });
  session.tabs = newTabs;

  saveSessions(sessions);
  currentEditingId = null;
  renderSessionList();
}

// ─── Session Actions ─────────────────────────────────

function restoreSession(session) {
  session.tabs.forEach(t => {
    if (t.url) chrome.tabs.create({ url: t.url, active: false });
  });
}

function closeMatchingTabs(session) {
  const urls = new Set(session.tabs.map(t => t.url));
  const newTabUrls = new Set(['chrome://newtab/', '', 'about:newtab']);
  getCurrentTabs(tabs => {
    const ids = tabs
      .filter(t => urls.has(t.url) && !newTabUrls.has(t.url))
      .map(t => t.id)
      .filter(id => id !== chrome.tabs.TAB_ID_NONE);
    if (!ids.length) { showToast('No matching open tabs found'); return; }
    const mb = ids.length * RAM_PER_TAB;
    closeTabIds(ids, () => {
      showToast(`${ids.length} tab${ids.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`);
    });
  });
}

function deleteSession(session) {
  showModal(
    'Delete session?',
    session.name,
    'Delete',
    () => {
      let sessions = getSessions();
      sessions = sessions.filter(s => s.id !== session.id);
      saveSessions(sessions);
      if (currentEditingId === session.id) currentEditingId = null;
      renderSessionList();
    }
  );
}

// ─── Init ────────────────────────────────────────────

document.getElementById('closeAllBtn').addEventListener('click', handleCloseAll);
document.getElementById('saveBtn').addEventListener('click', showSaveFlow);
document.getElementById('saveNameCancelBtn').addEventListener('click', hideSaveFlow);
document.getElementById('saveNameConfirmBtn').addEventListener('click', confirmSaveName);
document.getElementById('saveNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmSaveName();
});
document.getElementById('saveChecklistCancelBtn').addEventListener('click', hideSaveFlow);
document.getElementById('saveChecklistBtn').addEventListener('click', confirmSaveChecklist);
document.getElementById('modalCancelBtn').addEventListener('click', hideModal);
document.getElementById('modalConfirmBtn').addEventListener('click', () => {
  if (pendingConfirm) pendingConfirm();
  hideModal();
});
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideModal();
});

renderSessionList();
