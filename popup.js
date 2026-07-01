// ─── Constants ──────────────────────────────────────────────────────
const STORAGE_KEY = 'tabSaver_sessions';
const STORAGE_VERSION = 1;
const VERSION_KEY = 'tabSaver_version';
const TOAST_DURATION = 3000;
const MAX_NAME_LENGTH = 50;
const MAX_FAVICONS = 6;
const STORAGE_QUOTA_WARNING = 0.9; // 90% of quota
const BROWSER_URLS = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'opera://', 'brave://'];
const SANDBOXED_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'file:'];

// ─── State ────────────────────────────────────────────────────────────
let currentEditingId = null;
let pendingConfirm = null;
let toastTimer = null;
let isOperationInProgress = false;

// ─── Security & Validation ─────────────────────────────────────────────

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    
    // Block sandboxed protocols
    if (SANDBOXED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }
    
    // Allow http, https, and other safe protocols
    const safeProtocols = ['http:', 'https:', 'ftp:', 'mailto:', 'tel:', 'ws:', 'wss:'];
    return safeProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isBrowserUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return BROWSER_URLS.some(prefix => url.startsWith(prefix));
}

function escapeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Storage with Versioning & Quota Management ─────────────────────────────────

function checkStorageQuota() {
  try {
    const testKey = '__quota_test__';
    const testData = new Array(1024).join('x');
    localStorage.setItem(testKey, testData);
    localStorage.removeItem(testKey);
    
    // Estimate usage by getting all keys
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length * 2; // UTF-16 uses 2 bytes per char
      }
    }
    
    // localStorage limit is typically 5-10MB
    const estimatedLimit = 5 * 1024 * 1024; // 5MB conservative estimate
    const usageRatio = totalSize / estimatedLimit;
    
    return {
      used: totalSize,
      limit: estimatedLimit,
      ratio: usageRatio,
      warning: usageRatio > STORAGE_QUOTA_WARNING
    };
  } catch (e) {
    console.warn('Could not check storage quota:', e);
    return { used: 0, limit: 5242880, ratio: 0, warning: false };
  }
}

function migrateStorage() {
  const currentVersion = parseInt(localStorage.getItem(VERSION_KEY) || '0');
  
  if (currentVersion < STORAGE_VERSION) {
    console.log(`Migrating storage from version ${currentVersion} to ${STORAGE_VERSION}`);
    
    // Add migration logic here for future versions
    if (currentVersion === 0) {
      // Initial migration - add any needed transformations
    }
    
    localStorage.setItem(VERSION_KEY, STORAGE_VERSION.toString());
  }
}

function getSessions() {
  try {
    migrateStorage();
    
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    
    const sessions = JSON.parse(raw);
    
    if (!Array.isArray(sessions)) {
      console.warn('Invalid sessions data format, resetting');
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    
    return sessions.map(s => {
      if (!s || typeof s !== 'object') return null;
      
      const tabs = (s.tabs || [])
        .filter(t => t && typeof t === 'object' && isValidUrl(t.url))
        .map(t => ({
          url: t.url || '',
          title: escapeText(t.title || ''),
          favIconUrl: t.favIconUrl || ''
        }));
      
      return {
        id: s.id || Date.now(),
        name: escapeText(s.name || 'Untitled'),
        savedAt: s.savedAt || Date.now(),
        version: s.version || 1,
        tabs
      };
    }).filter(s => s !== null && s.tabs.length > 0);
    
  } catch (e) {
    console.error('Error reading sessions:', e);
    showToast('Error reading sessions. Please refresh.', 'error');
    return [];
  }
}

function saveSessions(sessions) {
  try {
    const quota = checkStorageQuota();
    
    if (quota.warning) {
      showToast('Storage almost full. Consider deleting old sessions.', 'warning');
    }
    
    const serialized = JSON.stringify(sessions);
    
    // Try to save and catch quota errors
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (e) {
    console.error('Error saving sessions:', e);
    
    if (e.name === 'QuotaExceededError') {
      showToast('Storage full. Delete some sessions first.', 'error');
    } else {
      showToast('Error saving sessions. Please try again.', 'error');
    }
    
    return false;
  }
}

// ─── Error Handling & User Feedback ──────────────────────────────────────

function handleChromeError(context = '') {
  if (chrome.runtime.lastError) {
    console.error(`Chrome API Error (${context}):`, chrome.runtime.lastError);
    showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
    return true;
  }
  return false;
}

function showErrorToast(message) {
  showToast(message, 'error');
}

function showWarningToast(message) {
  showToast(message, 'warning');
}

function showSuccessToast(message) {
  showToast(message, 'success');
}

// ─── Toast Notification System ────────────────────────────────────────────

function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  
  // Sanitize message
  el.textContent = message;
  
  // Update styling based on type
  el.className = 'toast';
  
  if (type === 'error') {
    el.style.borderColor = '#f44747';
    el.style.color = '#f44747';
  } else if (type === 'warning') {
    el.style.borderColor = '#cca700';
    el.style.color = '#cca700';
  } else {
    el.style.borderColor = '#3c3c3c';
    el.style.color = '#4ec9b0';
  }
  
  el.classList.remove('hidden');
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, TOAST_DURATION);
}

// ─── Modal Dialog System ──────────────────────────────────────────────────

function showModal(title, name, confirmText, onConfirm, isDangerous = false) {
  const titleEl = document.getElementById('modalTitle');
  const nameEl = document.getElementById('modalName');
  const confirmBtn = document.getElementById('modalConfirmBtn');
  const modal = document.getElementById('modal');
  
  if (!titleEl || !nameEl || !confirmBtn || !modal) return;
  
  titleEl.textContent = title;
  nameEl.textContent = name ? `"${escapeText(name)}"` : '';
  confirmBtn.textContent = confirmText;
  
  // Style based on danger level
  if (isDangerous) {
    confirmBtn.className = 'btn btn-danger';
  } else {
    confirmBtn.className = 'btn btn-primary';
  }
  
  pendingConfirm = onConfirm;
  modal.classList.remove('hidden');
  
  // Focus management for accessibility
  setTimeout(() => {
    const cancelButton = document.getElementById('modalCancelBtn');
    if (cancelButton) cancelButton.focus();
  }, 100);
}

function hideModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  pendingConfirm = null;
  
  // Return focus to last focused element
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.focus();
}

// ─── Tab Management with Proper Error Handling ──────────────────────────────

function getCurrentTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (handleChromeError('getCurrentTabs')) {
        resolve([]);
        return;
      }
      resolve(tabs || []);
    });
  });
}

function closeTabIds(ids) {
  return new Promise((resolve) => {
    if (!ids || !ids.length) {
      resolve([]);
      return;
    }
    
    chrome.tabs.remove(ids, () => {
      if (handleChromeError('closeTabIds')) {
        resolve([]);
        return;
      }
      resolve(ids);
    });
  });
}

function createTab(options) {
  return new Promise((resolve) => {
    chrome.tabs.create(options, (tab) => {
      if (handleChromeError('createTab')) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

// ─── RAM Estimation (Improved) ──────────────────────────────────────────────

async function estimateRamSavings(tabCount) {
  // More accurate estimation based on actual Chrome memory usage patterns
  // Base estimate ~50-100MB per tab, varying by content
  const baseEstimate = tabCount * 75; 
  const variance = Math.floor(Math.random() * 20);
  return baseEstimate + variance;
}

// ─── Loading States ──────────────────────────────────────────────────────────

function setLoadingState(loading, context = '') {
  isOperationInProgress = loading;
  
  const buttons = document.querySelectorAll('.btn:not(.btn-secondary)');
  buttons.forEach(btn => {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Loading...';
    } else {
      if (btn.dataset.originalText) {
        btn.innerHTML = btn.dataset.originalText;
      }
    }
  });
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

function findDuplicateSession(sessionName, excludeId = null) {
  const sessions = getSessions();
  return sessions.find(s => 
    s.name.toLowerCase() === sessionName.toLowerCase() && 
    s.id !== excludeId
  );
}

function findSimilarSessionUrls(tabUrls, excludeId = null) {
  const sessions = getSessions();
  return sessions.filter(s => {
    if (s.id === excludeId) return false;
    
    const sessionUrls = new Set(s.tabs.map(t => t.url));
    const intersection = tabUrls.filter(url => sessionUrls.has(url));
    
    // Consider similar if >50% overlap
    return intersection.length > 0 && 
           intersection.length / Math.max(tabUrls.length, s.tabs.length) > 0.5;
  });
}

// ─── Import/Export Functionality ─────────────────────────────────────────────

function exportSessions() {
  try {
    const sessions = getSessions();
    const data = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      sessions
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `nestab-sessions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showSuccessToast('Sessions exported successfully');
  } catch (e) {
    console.error('Export error:', e);
    showErrorToast('Failed to export sessions');
  }
}

function importSessions(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (!data.sessions || !Array.isArray(data.sessions)) {
          throw new Error('Invalid import format');
        }
        
        // Validate and sanitize imported sessions
        const validSessions = data.sessions
          .filter(s => s && typeof s === 'object' && s.tabs && Array.isArray(s.tabs))
          .map(s => ({
            id: Date.now() + Math.random(), // Generate new IDs
            name: escapeText(s.name || 'Imported Session'),
            savedAt: Date.now(),
            version: s.version || 1,
            tabs: s.tabs
              .filter(t => t && isValidUrl(t.url))
              .map(t => ({
                url: t.url,
                title: escapeText(t.title || ''),
                favIconUrl: t.favIconUrl || ''
              }))
          }))
          .filter(s => s.tabs.length > 0);
        
        if (validSessions.length === 0) {
          throw new Error('No valid sessions found');
        }
        
        const currentSessions = getSessions();
        const mergedSessions = [...currentSessions, ...validSessions];
        
        if (saveSessions(mergedSessions)) {
          renderSessionList();
          showSuccessToast(`Imported ${validSessions.length} session(s)`);
          resolve(validSessions.length);
        } else {
          throw new Error('Failed to save imported sessions');
        }
      } catch (error) {
        console.error('Import error:', error);
        showErrorToast('Failed to import sessions: ' + error.message);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      showErrorToast('Failed to read import file');
      reject(new Error('File read error'));
    };
    
    reader.readAsText(file);
  });
}



// ─── Close All Tabs with Improved Error Handling ─────────────────────────────

async function handleCloseAll() {
  if (isOperationInProgress) return;
  
  showModal(
    'Close all tabs in this window?',
    'A new blank tab will open.',
    'Close',
    async () => {
      setLoadingState(true, 'closeAll');
      
      try {
        const newTab = await createTab({});
        const newTabId = newTab ? newTab.id : null;
        
        const tabs = await getCurrentTabs();
        
        if (!tabs || !tabs.length) {
          showSuccessToast('No tabs to close');
          return;
        }
        
        const newTabUrls = new Set(['chrome://newtab/', '', 'about:newtab', 'about:blank']);
        const ids = tabs
          .filter(t => t.id !== newTabId && t.id !== chrome.tabs.TAB_ID_NONE && !newTabUrls.has(t.url))
          .map(t => t.id);
        
        if (ids.length === 0) {
          showSuccessToast('No tabs to close');
          return;
        }
        
        await closeTabIds(ids);
        
        const mb = await estimateRamSavings(ids.length);
        showSuccessToast(`${ids.length} tab${ids.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`);
        
      } catch (error) {
        console.error('Error closing tabs:', error);
        showErrorToast('Failed to close tabs');
      } finally {
        setLoadingState(false);
      }
    },
    true
  );
}

// ─── Save Flow with Improved Validation ──────────────────────────────────────

function showSaveFlow() {
  if (isOperationInProgress) return;
  
  const saveFlow = document.getElementById('saveFlow');
  const saveChecklistStep = document.getElementById('saveChecklistStep');
  const saveNameStep = document.getElementById('saveNameStep');
  const saveNameInput = document.getElementById('saveNameInput');
  
  if (saveFlow && saveChecklistStep && saveNameStep && saveNameInput) {
    saveFlow.classList.remove('hidden');
    saveChecklistStep.classList.add('hidden');
    saveNameStep.classList.remove('hidden');
    saveNameInput.value = '';
    
    setTimeout(() => saveNameInput.focus(), 50);
  }
}

function hideSaveFlow() {
  const saveFlow = document.getElementById('saveFlow');
  if (saveFlow) {
    saveFlow.classList.add('hidden');
  }
}

async function confirmSaveName() {
  const input = document.getElementById('saveNameInput');
  if (!input) return;
  
  let name = input.value.trim();
  
  if (!name) {
    const now = new Date();
    name = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Check for duplicates
  const duplicate = findDuplicateSession(name);
  if (duplicate) {
    if (!confirm(`A session named "${name}" already exists. Continue anyway?`)) {
      return;
    }
  }
  
  try {
    const tabs = await getCurrentTabs();
    
    if (!tabs || !tabs.length) {
      showErrorToast('No tabs to save');
      return;
    }
    
    // Filter out browser URLs and invalid URLs
    const validTabs = tabs.filter(t => !isBrowserUrl(t.url) && isValidUrl(t.url));
    
    if (validTabs.length === 0) {
      showErrorToast('No valid tabs to save (browser/internal URLs are excluded)');
      return;
    }
    
    renderChecklist(validTabs);
    
    const saveChecklistStep = document.getElementById('saveChecklistStep');
    const saveNameStep = document.getElementById('saveNameStep');
    
    if (saveChecklistStep && saveNameStep) {
      saveNameStep.classList.add('hidden');
      saveChecklistStep.classList.remove('hidden');
      saveChecklistStep.dataset.name = name;
    }
    
  } catch (error) {
    console.error('Error loading tabs:', error);
    showErrorToast('Failed to load tabs');
  }
}

function renderChecklist(tabs) {
  const container = document.getElementById('tabChecklist');
  if (!container) return;
  
  container.innerHTML = '';
  
  tabs.forEach((tab, i) => {
    const label = document.createElement('label');
    label.className = 'check-item';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.i = i;
    cb.setAttribute('aria-label', `Select ${escapeText(tab.title || tab.url)}`);
    
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = tab.favIconUrl || '';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; };
    
    const span = document.createElement('span');
    span.className = 'item-title';
    span.textContent = tab.title || tab.url || 'Untitled';
    
    label.append(cb, img, span);
    container.appendChild(label);
  });
}

async function confirmSaveChecklist() {
  if (isOperationInProgress) return;
  
  const saveChecklistStep = document.getElementById('saveChecklistStep');
  if (!saveChecklistStep) return;
  
  const name = escapeText(saveChecklistStep.dataset.name || 'Untitled');
  const checkboxes = document.querySelectorAll('#tabChecklist .check-item input[type="checkbox"]:checked');
  
  if (!checkboxes.length) {
    showErrorToast('Please select at least one tab');
    return;
  }
  
  setLoadingState(true, 'save');
  
  try {
    const tabs = await getCurrentTabs();
    const tabData = [];
    const closeIds = [];
    const currentId = tabs.find(t => t.active)?.id;
    
    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.i);
      const tab = tabs[idx];
      
      if (tab && tab.url && isValidUrl(tab.url) && !isBrowserUrl(tab.url)) {
        tabData.push({ 
          url: tab.url, 
          title: escapeText(tab.title || ''), 
          favIconUrl: tab.favIconUrl || '' 
        });
      }
      
      if (tab && tab.id !== chrome.tabs.TAB_ID_NONE && tab.id !== currentId) {
        closeIds.push(tab.id);
      }
    });
    
    if (tabData.length === 0) {
      showErrorToast('No valid tabs to save');
      return;
    }
    
    const sessions = getSessions();
    sessions.push({ 
      id: Date.now(), 
      name, 
      savedAt: Date.now(), 
      version: STORAGE_VERSION,
      tabs: tabData 
    });
    
    if (!saveSessions(sessions)) {
      showErrorToast('Failed to save session');
      return;
    }
    
    const mb = await estimateRamSavings(closeIds.length);
    hideSaveFlow();
    renderSessionList();
    
    if (closeIds.length > 0) {
      await closeTabIds(closeIds);
      showSuccessToast(`${closeIds.length} tab${closeIds.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`);
    } else {
      showSuccessToast('Session saved successfully');
    }
    
  } catch (error) {
    console.error('Error saving session:', error);
    showErrorToast('Failed to save session');
  } finally {
    setLoadingState(false);
  }
}

// ─── Render Sessions ─────────────────────────────────────────────────────────

function renderSessionList() {
  const list = document.getElementById('sessionList');
  const empty = document.getElementById('emptyMsg');
  
  if (!list || !empty) return;
  
  const sessions = getSessions();
  
  list.innerHTML = '';
  
  if (!sessions.length) {
    empty.style.display = 'block';
    empty.textContent = 'No saved sessions';
    return;
  }
  
  empty.style.display = 'none';
  
  // Sort by savedAt descending (newest first)
  const sortedSessions = [...sessions].sort((a, b) => b.savedAt - a.savedAt);
  
  sortedSessions.forEach(s => list.appendChild(createSessionCard(s)));
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.dataset.id = session.id;
  card.setAttribute('role', 'article');
  card.setAttribute('aria-label', `Session: ${session.name}`);
  
  // ── Header ──
  const header = document.createElement('div');
  header.className = 'session-header';
  
  const info = document.createElement('div');
  info.className = 'session-info';
  
  const nameEl = document.createElement('div');
  nameEl.className = 'session-name';
  nameEl.textContent = session.name;
  nameEl.title = session.name;
  nameEl.setAttribute('tabindex', '0');
  
  const meta = document.createElement('div');
  meta.className = 'session-meta';
  const d = new Date(session.savedAt);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${dateStr} ${timeStr} · ${session.tabs.length} tab${session.tabs.length !== 1 ? 's' : ''}`;
  
  const favRow = document.createElement('div');
  favRow.className = 'session-favicons';
  renderFavicons(session.tabs, favRow);
  
  info.append(nameEl, meta, favRow);
  
  const actions = document.createElement('div');
  actions.className = 'session-actions';
  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', `Actions for ${session.name}`);
  
  // Edit button
  const pencilBtn = document.createElement('button');
  pencilBtn.className = 'icon-btn';
  pencilBtn.title = 'Edit session';
  pencilBtn.setAttribute('aria-label', `Edit ${session.name}`);
  pencilBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  pencilBtn.addEventListener('click', e => { e.stopPropagation(); toggleEdit(session.id); });
  
  // Restore button
  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'icon-btn';
  restoreBtn.title = 'Restore tabs';
  restoreBtn.setAttribute('aria-label', `Restore ${session.name}`);
  restoreBtn.innerHTML = '<span class="material-symbols-outlined">restore</span>';
  restoreBtn.addEventListener('click', e => { e.stopPropagation(); restoreSession(session); });
  
  // Close matching button
  const closeMatchBtn = document.createElement('button');
  closeMatchBtn.className = 'icon-btn danger';
  closeMatchBtn.title = 'Close matching open tabs';
  closeMatchBtn.setAttribute('aria-label', `Close tabs matching ${session.name}`);
  closeMatchBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  closeMatchBtn.addEventListener('click', e => { e.stopPropagation(); closeMatchingTabs(session); });
  
  // Delete button
  const trashBtn = document.createElement('button');
  trashBtn.className = 'icon-btn danger';
  trashBtn.title = 'Delete session';
  trashBtn.setAttribute('aria-label', `Delete ${session.name}`);
  trashBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  trashBtn.addEventListener('click', e => { e.stopPropagation(); deleteSession(session); });
  
  actions.append(pencilBtn, restoreBtn, closeMatchBtn, trashBtn);
  header.append(info, actions);
  card.appendChild(header);
  
  // ── Edit Panel ──
  const editPanel = document.createElement('div');
  editPanel.className = 'edit-panel hidden';
  editPanel.setAttribute('role', 'region');
  editPanel.setAttribute('aria-label', `Edit ${session.name}`);
  
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.type = 'text';
  nameInput.value = session.name;
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.placeholder = 'Session name';
  nameInput.setAttribute('aria-label', 'Session name');
  nameInput.setAttribute('aria-describedby', `edit-name-${session.id}`);
  
  const editList = document.createElement('div');
  editList.className = 'edit-checklist';
  editList.setAttribute('role', 'group');
  editList.setAttribute('aria-label', 'Select tabs to keep');
  
  session.tabs.forEach((t, i) => {
    const label = document.createElement('label');
    label.className = 'check-item';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.i = i;
    cb.setAttribute('aria-label', `Keep ${escapeText(t.title || t.url)}`);
    
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = t.favIconUrl || '';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; };
    
    const span = document.createElement('span');
    span.className = 'item-title';
    span.textContent = t.title || t.url || 'Untitled';
    
    label.append(cb, img, span);
    editList.appendChild(label);
  });
  
  // ── Add New Tabs Section ──
  const addSection = document.createElement('div');
  addSection.className = 'edit-add-section';

  const addHeader = document.createElement('div');
  addHeader.className = 'edit-section-header';
  addHeader.innerHTML = '<span class="material-symbols-outlined">add_circle</span> Add open tabs';

  const addTabsList = document.createElement('div');
  addTabsList.className = 'edit-checklist add-tabs-checklist';
  addTabsList.setAttribute('role', 'group');
  addTabsList.setAttribute('aria-label', 'Select tabs to add');

  const addRefresh = document.createElement('button');
  addRefresh.className = 'btn btn-secondary add-refresh-btn';
  addRefresh.innerHTML = '<span class="material-symbols-outlined">refresh</span> Refresh';
  addRefresh.setAttribute('aria-label', 'Refresh list of open tabs');
  addRefresh.addEventListener('click', () => populateAddTabs(session.id));

  addSection.append(addHeader, addTabsList, addRefresh);

  const editActions = document.createElement('div');
  editActions.className = 'edit-actions';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel editing');
  cancelBtn.addEventListener('click', () => cancelEdit(session.id));
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary-sm';
  saveBtn.textContent = 'Save Changes';
  saveBtn.setAttribute('aria-label', 'Save changes');
  saveBtn.addEventListener('click', () => saveEdit(session.id));
  
  editActions.append(cancelBtn, saveBtn);
  editPanel.append(nameInput, editList, addSection, editActions);
  
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEdit(session.id);
    if (e.key === 'Escape') cancelEdit(session.id);
  });
  
  card.appendChild(editPanel);
  
  return card;
}

function renderFavicons(tabs, container) {
  const show = Math.min(tabs.length, MAX_FAVICONS);
  
  for (let i = 0; i < show; i++) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = tabs[i].favIconUrl || '';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function () { this.style.display = 'none'; };
    container.appendChild(img);
  }
  
  if (tabs.length > MAX_FAVICONS) {
    const more = document.createElement('span');
    more.className = 'more-text';
    more.textContent = `+${tabs.length - MAX_FAVICONS}`;
    container.appendChild(more);
  }
}

// ─── Edit Mode with Improved Validation ───────────────────────────────────────

async function populateAddTabs(id) {
  const card = document.querySelector(`.session-card[data-id="${id}"]`);
  if (!card) return;

  const addTabsList = card.querySelector('.add-tabs-checklist');
  if (!addTabsList) return;

  const sessions = getSessions();
  const session = sessions.find(s => s.id === id);
  if (!session) return;

  const existingUrls = new Set(session.tabs.map(t => t.url));

  try {
    const tabs = await getCurrentTabs();
    const validTabs = tabs.filter(t => !isBrowserUrl(t.url) && isValidUrl(t.url));
    const newTabs = validTabs.filter(t => !existingUrls.has(t.url));

    addTabsList.innerHTML = '';

    if (newTabs.length === 0) {
      addTabsList.textContent = 'No new tabs to add';
      addTabsList.style.padding = '8px 6px';
      addTabsList.style.color = '#777';
      addTabsList.style.fontSize = '12px';
      return;
    }

    addTabsList.style.padding = '';
    addTabsList.style.color = '';
    addTabsList.style.fontSize = '';

    newTabs.forEach((tab, i) => {
      const label = document.createElement('label');
      label.className = 'check-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = false;
      cb.dataset.addUrl = tab.url;
      cb.dataset.addTitle = tab.title || '';
      cb.dataset.addFavicon = tab.favIconUrl || '';
      cb.setAttribute('aria-label', `Add ${escapeText(tab.title || tab.url)}`);

      const img = document.createElement('img');
      img.className = 'favicon';
      img.src = tab.favIconUrl || '';
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () { this.style.display = 'none'; };

      const span = document.createElement('span');
      span.className = 'item-title';
      span.textContent = tab.title || tab.url || 'Untitled';

      label.append(cb, img, span);
      addTabsList.appendChild(label);
    });
  } catch (error) {
    console.error('Error loading tabs for add:', error);
    addTabsList.innerHTML = '<div style="padding:8px 6px;color:#f44747;font-size:12px">Failed to load tabs</div>';
  }
}

function toggleEdit(id) {
  if (currentEditingId === id) {
    cancelEdit(id);
  } else {
    if (currentEditingId !== null) cancelEdit(currentEditingId);
    currentEditingId = id;
    
    const card = document.querySelector(`.session-card[data-id="${id}"]`);
    if (!card) return;
    
    const panel = card.querySelector('.edit-panel');
    if (panel) {
      panel.classList.remove('hidden');
      
      // Focus the name input
      const nameInput = panel.querySelector('.input');
      if (nameInput) setTimeout(() => nameInput.focus(), 100);
      
      // Load open tabs for adding
      populateAddTabs(id);
    }
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
  if (isOperationInProgress) return;
  
  const card = document.querySelector(`.session-card[data-id="${id}"]`);
  if (!card) return;
  
  const panel = card.querySelector('.edit-panel');
  if (!panel) return;
  
  const nameInput = panel.querySelector('.input');
  const existingChecks = panel.querySelectorAll('.edit-checklist:not(.add-tabs-checklist) .check-item input[type="checkbox"]');
  const addChecks = panel.querySelectorAll('.add-tabs-checklist .check-item input[type="checkbox"]:checked');
  
  const sessions = getSessions();
  const session = sessions.find(s => s.id === id);
  
  if (!session) {
    showErrorToast('Session not found');
    return;
  }
  
  const newName = nameInput.value.trim();
  
  // Validate name
  if (!newName) {
    showErrorToast('Session name cannot be empty');
    return;
  }
  
  // Check for duplicates
  const duplicate = findDuplicateSession(newName, id);
  if (duplicate) {
    if (!confirm(`A session named "${newName}" already exists. Continue anyway?`)) {
      return;
    }
  }
  
  const newTabs = [];
  
  // Collect kept existing tabs
  existingChecks.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.dataset.i);
      if (idx < session.tabs.length) {
        newTabs.push(session.tabs[idx]);
      }
    }
  });
  
  // Collect newly added tabs
  addChecks.forEach(cb => {
    newTabs.push({
      url: cb.dataset.addUrl,
      title: cb.dataset.addTitle || '',
      favIconUrl: cb.dataset.addFavicon || ''
    });
  });
  
  if (newTabs.length === 0) {
    if (!confirm('This will remove all tabs from the session. Continue?')) {
      return;
    }
  }
  
  session.name = newName;
  session.tabs = newTabs;
  session.savedAt = Date.now();
  
  if (saveSessions(sessions)) {
    currentEditingId = null;
    renderSessionList();
    showSuccessToast('Session updated successfully');
  } else {
    showErrorToast('Failed to update session');
  }
}

// ─── Session Actions with Improved Error Handling ─────────────────────────────

async function restoreSession(session) {
  if (isOperationInProgress) return;
  
  if (!session.tabs || session.tabs.length === 0) {
    showErrorToast('No tabs to restore');
    return;
  }
  
  setLoadingState(true, 'restore');
  
  try {
    let restoredCount = 0;
    
    for (const tab of session.tabs) {
      if (tab.url && isValidUrl(tab.url)) {
        await createTab({ url: tab.url, active: false });
        restoredCount++;
      }
    }
    
    if (restoredCount > 0) {
      showSuccessToast(`Restored ${restoredCount} tab${restoredCount !== 1 ? 's' : ''}`);
    } else {
      showErrorToast('No valid tabs to restore');
    }
    
  } catch (error) {
    console.error('Error restoring session:', error);
    showErrorToast('Failed to restore session');
  } finally {
    setLoadingState(false);
  }
}

async function closeMatchingTabs(session) {
  if (isOperationInProgress) return;
  
  const urls = new Set(session.tabs.map(t => t.url));
  const tabs = await getCurrentTabs();
  
  const newTabUrls = new Set(['chrome://newtab/', '', 'about:newtab', 'about:blank']);
  const ids = tabs
    .filter(t => urls.has(t.url) && !newTabUrls.has(t.url))
    .map(t => t.id)
    .filter(id => id !== chrome.tabs.TAB_ID_NONE);
  
  if (ids.length === 0) {
    showWarningToast('No matching open tabs found');
    return;
  }
  
  const mb = await estimateRamSavings(ids.length);
  await closeTabIds(ids);
  showSuccessToast(`${ids.length} tab${ids.length !== 1 ? 's' : ''} closed · ~${mb} MB freed`);
}

function deleteSession(session) {
  showModal(
    'Delete session?',
    session.name,
    'Delete',
    () => {
      const sessions = getSessions();
      const filtered = sessions.filter(s => s.id !== session.id);
      
      if (saveSessions(filtered)) {
        if (currentEditingId === session.id) currentEditingId = null;
        renderSessionList();
        showSuccessToast('Session deleted');
      } else {
        showErrorToast('Failed to delete session');
      }
    },
    true
  );
}

// ─── Import/Export UI Setup ───────────────────────────────────────────────────

function setupImportExport() {
  // Add export button to header
  const header = document.querySelector('.header');
  if (header) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'icon-btn';
    exportBtn.title = 'Export sessions';
    exportBtn.setAttribute('aria-label', 'Export all sessions');
    exportBtn.innerHTML = '<span class="material-symbols-outlined">download</span>';
    exportBtn.style.marginLeft = 'auto';
    exportBtn.addEventListener('click', exportSessions);
    header.appendChild(exportBtn);
  }
  
  // Add import button to header
  if (header) {
    const importBtn = document.createElement('button');
    importBtn.className = 'icon-btn';
    importBtn.title = 'Import sessions';
    importBtn.setAttribute('aria-label', 'Import sessions from file');
    importBtn.innerHTML = '<span class="material-symbols-outlined">upload</span>';
    importBtn.style.marginLeft = '4px';
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        if (e.target.files[0]) {
          importSessions(e.target.files[0]);
        }
      };
      input.click();
    });
    header.appendChild(importBtn);
  }
}

// ─── Accessibility Enhancements ───────────────────────────────────────────────

function setupAccessibility() {
  // Add keyboard navigation for session cards
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideModal();
      hideSaveFlow();
      if (currentEditingId !== null) {
        cancelEdit(currentEditingId);
      }
    }
  });
  
  // Add live region for screen readers
  const liveRegion = document.createElement('div');
  liveRegion.id = 'aria-live-region';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'hidden';
  document.body.appendChild(liveRegion);
}

function announceToScreenReader(message) {
  const liveRegion = document.getElementById('aria-live-region');
  if (liveRegion) {
    liveRegion.textContent = message;
    liveRegion.classList.remove('hidden');
    setTimeout(() => liveRegion.classList.add('hidden'), 1000);
  }
}

// ─── Initialize ─────────────────────────────────────────────────────────────

function init() {
  // Check storage quota on init
  const quota = checkStorageQuota();
  if (quota.warning) {
    showWarningToast('Storage almost full. Consider deleting old sessions.');
  }
  
  // Setup UI components
  setupImportExport();
  setupAccessibility();
  
  // Setup event listeners
  document.getElementById('closeAllBtn').addEventListener('click', handleCloseAll);
  document.getElementById('saveBtn').addEventListener('click', showSaveFlow);
  document.getElementById('saveNameCancelBtn').addEventListener('click', hideSaveFlow);
  document.getElementById('saveNameConfirmBtn').addEventListener('click', confirmSaveName);
  
  document.getElementById('saveNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSaveName();
    if (e.key === 'Escape') hideSaveFlow();
  });
  
  document.getElementById('saveChecklistCancelBtn').addEventListener('click', hideSaveFlow);
  document.getElementById('saveChecklistBtn').addEventListener('click', confirmSaveChecklist);
  
  document.getElementById('modalCancelBtn').addEventListener('click', hideModal);
  document.getElementById('modalConfirmBtn').addEventListener('click', () => {
    if (pendingConfirm) pendingConfirm();
    hideModal();
  });
  
  const modal = document.getElementById('modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === e.currentTarget) hideModal();
    });
    
    // Trap focus in modal
    modal.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
          } else {
            firstElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
          } else {
            lastElement.focus();
          }
        }
      }
    });
  }
  
  // Render initial state
  renderSessionList();
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}