(function () {
  'use strict';

  // ─────────────── State ───────────────
  let sidebar = null;
  let activeTab = 'templates';
  let templates = [];
  let folders = [];
  let isPro = false;
  let dailyRemaining = 10;
  let theme = 'dark'; // 'dark' | 'light'
  let chainState = null; // { chainId, nextIndex, templates }
  let slashMenu = null;
  let shortcutKey = 'shift+cmd+e'; // default shortcut
  let draftTimer = null;
  let draftRestored = false;
  let bulkSelectMode = false;
  let expandedCardIdx = -1;
  let _undoStack = [];

  // ─────────────── Platform Detection ───────────────
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('deepseek.com')) return 'deepseek';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('grok.com') || host.includes('x.com')) return 'grok';
    if (host.includes('perplexity.ai')) return 'perplexity';
    return 'chatgpt';
  }

  function getPlatformName() {
    const map = { chatgpt: 'ChatGPT', claude: 'Claude', deepseek: 'DeepSeek', gemini: 'Gemini', grok: 'Grok', perplexity: 'Perplexity' };
    return map[detectPlatform()] || 'ChatGPT';
  }

  function getDefaultTitle() {
    const map = { chatgpt: 'ChatGPT Conversation', claude: 'Claude Conversation', deepseek: 'DeepSeek Conversation', gemini: 'Gemini Conversation', grok: 'Grok Conversation', perplexity: 'Perplexity Conversation' };
    return map[detectPlatform()] || 'AI Chat Conversation';
  }

  // ─────────────── Init ───────────────
  function init() {
    if (!document.body) { setTimeout(init, 200); return; }
    loadState();
    injectUI();
    watchSlashTrigger();
    watchDraft();
    setTimeout(checkOnboarding, 800);
  }

  function checkOnboarding() {
    chrome.storage.local.get(['onboardingDone'], (data) => {
      if (data.onboardingDone) return;
      const steps = [
        '<strong>1. Save a template</strong><br>Type a prompt in the chat input, open the sidebar, click "+ Save Current Prompt".',
        '<strong>2. Quick insert with /</strong><br>Type <code>/</code> in any chat input to search and insert templates instantly.',
        '<strong>3. Toggle sidebar</strong><br>Use <code>' + shortcutKey.replace(/\+/g, ' + ').replace(/cmd/i, 'Cmd').replace(/ctrl/i, 'Ctrl').replace(/alt/i, 'Alt').replace(/shift/i, 'Shift').toUpperCase() + '</code> to open or close the sidebar.'
      ];
      showModal('Welcome to AI Chat Enhancer',
        '<div style="line-height:2;font-size:12px">' + steps.join('<br><br>') + '</div>',
        () => {
          chrome.storage.local.set({ onboardingDone: true });
          showToast('Enjoy!');
        }
      );
      setTimeout(() => {
        const saveBtn = document.getElementById('ce-modal-save');
        if (saveBtn) saveBtn.textContent = 'Got it';
      }, 10);
    });
  }

  function loadState() {
    chrome.storage.local.get(
      ['templates', 'folders', 'isPro', 'usageCount', 'usageDate', 'theme', 'shortcut', 'draft', 'draftPlatform'],
      (data) => {
        templates = data.templates || [];
        folders = data.folders || [];
        isPro = !!data.isPro;
        theme = data.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        shortcutKey = data.shortcut || 'shift+cmd+e';
        const today = new Date().toDateString();
        dailyRemaining = data.usageDate === today ? 10 - (data.usageCount || 0) : 10;
        if (dailyRemaining < 0) dailyRemaining = 0;
        if (isPro) dailyRemaining = Infinity;
        applyTheme();
        if (sidebar && sidebar._mounted) renderActiveTab();
        // Check for draft
        if (data.draft && data.draft.trim() && data.draftPlatform === detectPlatform()) {
          const input = findChatGPTInput();
          if (input && !getInputText(input)) {
            setInputText(input, data.draft);
            draftRestored = true;
            showToast('Draft restored');
          }
        }
      }
    );
  }

  // ─────────────── Usage Tracking ───────────────
  async function trackUsage() {
    if (isPro) return true;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_USAGE' }, (res) => {
        if (res) { isPro = res.isPro; dailyRemaining = res.remaining; }
        resolve(res ? res.allowed : true);
      });
    });
  }

  async function incrementUsage() {
    chrome.runtime.sendMessage({ type: 'INCREMENT_USAGE' });
    if (!isPro) {
      dailyRemaining = Math.max(0, dailyRemaining - 1);
      renderActiveTab();
    }
  }

  // ─────────────── UI Injection ───────────────
  function injectUI() {
    // Remove old if any
    const oldBtn = document.getElementById('ce-toggle-btn');
    const oldSidebar = document.getElementById('ce-sidebar');
    if (oldBtn) oldBtn.remove();
    if (oldSidebar) oldSidebar.remove();

    // Toggle button
    const btn = document.createElement('div');
    btn.id = 'ce-toggle-btn';
    btn.innerHTML = '<svg width="18" height="18" viewBox="-2 -8 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 0 C12 0, 18 2, 20 8 C22 14, 16 20, 10 22 C4 24, 0 20, 0 14 C0 10, 4 6, 8 6 C12 6, 14 10, 12 14 C10 18, 6 20, 4 18" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/><rect x="20" y="0" width="3" height="24" rx="1.5" fill="#fff"/></svg>';
    btn.title = 'AI Chat Enhancer';
    btn.addEventListener('click', () => toggleSidebar());
    document.body.appendChild(btn);

    // Sidebar
    sidebar = document.createElement('div');
    sidebar.id = 'ce-sidebar';
    sidebar.innerHTML = buildSidebarHTML();
    sidebar._mounted = true;
    document.body.appendChild(sidebar);

    // Toast
    const oldToast = document.getElementById('ce-toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.id = 'ce-toast';
    document.body.appendChild(toast);

    bindSidebarEvents();
  }

  function buildSidebarHTML() {
    return `
      <div class="ce-header">
        <h2><svg width="16" height="14" viewBox="-4 -9 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px;margin-right:6px"><path d="M8 1 C12 1, 18 3, 20 9 C22 15, 16 21, 10 23 C4 25, 0 21, 0 15 C0 11, 4 7, 8 7 C12 7, 14 11, 12 15 C10 19, 6 21, 4 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/><rect x="20" y="1" width="3" height="24" rx="1.5" fill="currentColor"/></svg>Enhancer</h2>
        <div class="ce-header-right">
          <span style="font-size:11px;color:#888;margin-right:4px" id="ce-pro-badge"></span>
          <button class="ce-theme-btn" id="ce-theme-btn" title="Toggle theme"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></button>
          <button class="ce-close-btn" id="ce-close-btn" title="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="ce-tabs">
        <button class="ce-tab active" data-tab="templates"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ce-tab-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Templates</button>
        <button class="ce-tab" data-tab="folders"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ce-tab-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Folders</button>
        <button class="ce-tab" data-tab="export"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ce-tab-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export</button>
        <button class="ce-tab" data-tab="search"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ce-tab-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search</button>
      </div>
      <div class="ce-tab-content active" data-content="templates"></div>
      <div class="ce-tab-content" data-content="folders"></div>
      <div class="ce-tab-content" data-content="export"></div>
      <div class="ce-tab-content" data-content="search"></div>
      <div class="ce-usage-info" id="ce-usage-info"></div>
      <div class="ce-upgrade-banner" id="ce-upgrade-banner" style="display:none">
        <h3>Go Pro</h3>
        <p>Unlimited usage · $5/month</p>
        <button class="ce-upgrade-btn" id="ce-upgrade-btn">Upgrade Now</button>
      </div>
    `;
  }

  function bindSidebarEvents() {
    document.getElementById('ce-close-btn').addEventListener('click', () => toggleSidebar(false));

    sidebar.querySelectorAll('.ce-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('ce-upgrade-btn').addEventListener('click', () => {
      window.open('https://payhip.com/b/WiVe1', '_blank');
    });

    document.getElementById('ce-theme-btn').addEventListener('click', toggleTheme);

    updateProUI();
  }

  function toggleSidebar(force) {
    const isOpen = sidebar.classList.contains('open');
    const shouldOpen = typeof force === 'boolean' ? force : !isOpen;
    if (shouldOpen) {
      sidebar.classList.add('open');
      document.getElementById('ce-toggle-btn').style.display = 'none';
      renderActiveTab();
    } else {
      sidebar.classList.remove('open');
      document.getElementById('ce-toggle-btn').style.display = 'flex';
    }
  }

  function switchTab(tabName) {
    activeTab = tabName;
    _undoStack = [];
    sidebar.querySelectorAll('.ce-tab').forEach((t) => t.classList.remove('active'));
    sidebar.querySelector(`.ce-tab[data-tab="${tabName}"]`).classList.add('active');
    sidebar.querySelectorAll('.ce-tab-content').forEach((c) => c.classList.remove('active'));
    sidebar.querySelector(`.ce-tab-content[data-content="${tabName}"]`).classList.add('active');
    renderActiveTab();
  }

  function updateProUI() {
    const badge = document.getElementById('ce-pro-badge');
    const banner = document.getElementById('ce-upgrade-banner');
    const usageInfo = document.getElementById('ce-usage-info');
    if (badge) badge.textContent = isPro ? 'PRO' : '';
    if (banner) banner.style.display = isPro ? 'none' : 'block';
    if (usageInfo && !isPro) {
      usageInfo.textContent = 'Free: ' + (dailyRemaining === Infinity ? 'unlimited' : dailyRemaining + ' uses today');
    } else if (usageInfo) {
      usageInfo.textContent = 'Pro - unlimited';
    }
  }

  // ─────────────── Theme ───────────────
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    chrome.storage.local.set({ theme });
    applyTheme();
  }

  function applyTheme() {
    const btn = document.getElementById('ce-theme-btn');
    const toggleBtn = document.getElementById('ce-toggle-btn');
    if (sidebar) {
      sidebar.classList.toggle('light', theme === 'light');
      sidebar.classList.toggle('dark', theme === 'dark');
    }
    if (toggleBtn) toggleBtn.classList.toggle('light', theme === 'light');
    if (slashMenu) slashMenu.classList.toggle('light', theme === 'light');
    if (btn) btn.innerHTML = theme === 'dark' ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // ─────────────── Slash Trigger ───────────────
  function watchSlashTrigger() {
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || (!el.matches('textarea') && !el.matches('[contenteditable="true"]') && !el.matches('[role="textbox"]'))) return;
      const text = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : (el.innerText || el.textContent || '');
      const cursorPos = getCursorPos(el);
      const beforeCursor = text.slice(0, cursorPos);
      const slashMatch = beforeCursor.match(/\/(\w*)$/);
      if (slashMatch) {
        const q = slashMatch[1].toLowerCase();
        const matches = templates.filter(t => t.title.toLowerCase().includes(q));
        if (matches.length > 0) showSlashMenu(matches, el);
        else hideSlashMenu();
      } else {
        hideSlashMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (!slashMenu) return;
      if (e.key === 'Escape') { e.preventDefault(); hideSlashMenu(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); navigateSlashMenu(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); selectSlashItem(); }
    });
    document.addEventListener('click', (e) => {
      if (slashMenu && !slashMenu.contains(e.target)) hideSlashMenu();
    });
  }

  function getCursorPos(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.selectionStart || 0;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.endContainer, range.endOffset);
      return preRange.toString().length;
    }
    return 0;
  }

  function showSlashMenu(matches, inputEl) {
    hideSlashMenu();
    slashMenu = document.createElement('div');
    slashMenu.id = 'ce-slash-menu';
    slashMenu.innerHTML = matches.slice(0, 8).map((t, i) => '<div class="ce-slash-item' + (i === 0 ? ' active' : '') + '" data-idx="' + templates.indexOf(t) + '"><span class="ce-slash-title">' + escHtml(t.title) + '</span><span class="ce-slash-preview">' + escHtml(t.content.slice(0, 40)) + '</span></div>').join('');
    slashMenu._inputEl = inputEl;
    slashMenu._matches = matches;
    slashMenu._activeIdx = 0;
    const rect = inputEl.getBoundingClientRect();
    slashMenu.style.position = 'fixed';
    slashMenu.style.left = rect.left + 'px';
    slashMenu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    slashMenu.style.zIndex = '99999';
    document.body.appendChild(slashMenu);
    slashMenu.querySelectorAll('.ce-slash-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(item.dataset.idx);
        selectSlashItem(idx);
      });
    });
  }

  function navigateSlashMenu(dir) {
    if (!slashMenu) return;
    const items = slashMenu.querySelectorAll('.ce-slash-item');
    items[slashMenu._activeIdx].classList.remove('active');
    slashMenu._activeIdx = (slashMenu._activeIdx + dir + items.length) % items.length;
    items[slashMenu._activeIdx].classList.add('active');
  }

  function selectSlashItem(idx) {
    if (!slashMenu) return;
    const tplIdx = idx !== undefined ? idx : parseInt(slashMenu.querySelectorAll('.ce-slash-item')[slashMenu._activeIdx].dataset.idx);
    const template = templates[tplIdx];
    const input = slashMenu._inputEl;
    const text = input.tagName === 'TEXTAREA' || input.tagName === 'INPUT' ? input.value : (input.innerText || input.textContent || '');
    const cursorPos = getCursorPos(input);
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');
    const newText = beforeCursor.slice(0, slashIdx) + template.content + afterCursor;
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.value = newText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.textContent = newText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    hideSlashMenu();
  }

  function hideSlashMenu() {
    if (slashMenu) { slashMenu.remove(); slashMenu = null; }
  }

  // ─────────────── Draft Auto-Save ───────────────
  function watchDraft() {
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || (!el.matches('textarea') && !el.matches('[contenteditable="true"]') && !el.matches('[role="textbox"]'))) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        const input = findChatGPTInput();
        if (!input) return;
        const text = getInputText(input);
        if (draftRestored && !text) { draftRestored = false; return; }
        chrome.storage.local.set({ draft: text, draftPlatform: detectPlatform() });
      }, 1500);
    });
  }

  // ─────────────── Tab Renderers ───────────────
  function renderActiveTab() {
    updateProUI();
    switch (activeTab) {
      case 'templates': renderTemplates(); break;
      case 'folders': renderFolders(); break;
      case 'export': renderExport(); break;
      case 'search': renderSearch(); break;
    }
  }

  // ─────────────── Templates ───────────────
  let templateFilter = null; // current tag filter
  let templateSort = 'recent'; // 'recent' | 'usage' | 'alpha'

  function getAllTags() {
    const s = new Set();
    templates.forEach(t => (t.tags || []).forEach(tag => s.add(tag)));
    return [...s].sort();
  }

  function renderTemplates() {
    const container = sidebar.querySelector('[data-content="templates"]');
    if (!container) return;
    const builtins = templates.filter(t => t.builtin);
    const userTemplates = templates.filter(t => !t.builtin);
    let html = '<button class="ce-save-btn" id="ce-save-template-btn">+ Save Current Prompt</button>';

    // Action bar: Select mode + Sort
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    html += '<button class="ce-select-toggle-btn" id="ce-select-toggle">' + (bulkSelectMode ? 'Done' : 'Select') + '</button>';
    html += '<select id="ce-sort-select" class="ce-sort-select">';
    html += '<option value="recent"' + (templateSort === 'recent' ? ' selected' : '') + '>Recent</option>';
    html += '<option value="usage"' + (templateSort === 'usage' ? ' selected' : '') + '>Most Used</option>';
    html += '<option value="alpha"' + (templateSort === 'alpha' ? ' selected' : '') + '>A-Z</option>';
    html += '</select></div>';

    // Tag filter bar
    const allTags = getAllTags();
    if (allTags.length > 0) {
      html += '<div class="ce-tag-filter">';
      html += '<button class="ce-tag-chip ' + (templateFilter === null ? 'active' : '') + '" data-tag="">All</button>';
      allTags.forEach(tag => {
        html += '<button class="ce-tag-chip ' + (templateFilter === tag ? 'active' : '') + '" data-tag="' + escHtml(tag) + '">' + escHtml(tag) + '</button>';
      });
      html += '</div>';
    }

    const sortFn = templateSort === 'usage' ? (a, b) => (b.useCount || 0) - (a.useCount || 0)
      : templateSort === 'alpha' ? (a, b) => a.title.localeCompare(b.title)
      : (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

    const filtered = templateFilter ? userTemplates.filter(t => (t.tags || []).includes(templateFilter)) : [...userTemplates];
    filtered.sort(sortFn);
    const pinned = filtered.filter(t => t.pinned);
    const recent = (!templateFilter && !bulkSelectMode) ? filtered.filter(t => !t.pinned && t.lastUsedAt).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 5) : [];
    const recentIds = new Set(recent.map(t => templates.indexOf(t)));
    const normal = filtered.filter(t => !t.pinned && !recentIds.has(templates.indexOf(t)));

    // Pinned section
    if (pinned.length > 0 && !bulkSelectMode) {
      html += '<div class="ce-section-label">Pinned</div>';
      pinned.forEach(t => { html += buildTemplateCard(t); });
    }

    // Recent section
    if (recent.length > 0) {
      html += '<div class="ce-section-label">Recent</div>';
      recent.forEach(t => { html += buildTemplateCard(t); });
    }

    // My Templates
    html += '<div class="ce-section-label">My Templates</div>';
    if (filtered.length === 0) {
      html += '<div class="ce-empty"><div class="ce-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>' + (templateFilter ? 'No templates with tag "' + escHtml(templateFilter) + '".' : 'No templates yet.<br>Type a prompt in ' + getPlatformName() + ',<br>then click "+ Save Current Prompt".') + '</div>';
    } else if (normal.length === 0 && pinned.length === 0 && recent.length === 0) {
      html += '<div class="ce-empty"><div class="ce-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>All templates are pinned or recent.</div>';
    } else {
      normal.forEach((t) => {
        html += buildTemplateCard(t);
      });
    }

    // Built-in templates
    if (builtins.length > 0) {
      builtins.sort(sortFn);
      html += '<div class="ce-section-label">Built-in</div>';
      builtins.forEach(t => { html += buildTemplateCard(t, true); });
    }

    // Bulk delete bar
    if (bulkSelectMode) {
      const selected = userTemplates.filter(t => t._selected);
      html += '<div class="ce-bulk-bar"><button class="ce-bulk-delete-btn" id="ce-bulk-delete" ' + (selected.length === 0 ? 'disabled' : '') + '>Delete Selected (' + selected.length + ')</button></div>';
    }

    container.innerHTML = html;
    bindTemplateEvents(container);
  }

  function renderMarkdownPreview(text) {
    const escaped = escHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<span class="ce-md-bold">$1</span>')
      .replace(/`([^`]+)`/g, '<span class="ce-md-code">$1</span>');
  }

  function buildTemplateCard(t, isBuiltin) {
    const origIdx = templates.indexOf(t);
    const fullContent = t.content;
    const preview = fullContent.length > 60 ? fullContent.slice(0, 60) + '...' : fullContent;
    const tagHtml = (t.tags || []).map(tag => '<span class="ce-tag-label">' + escHtml(tag) + '</span>').join('');
    const chainHtml = t.chainId ? '<span class="ce-chain-badge" title="Chain: ' + escHtml(t.chainId) + ' step ' + (t.chainOrder||0) + '"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>' : '';
    const builtinHtml = isBuiltin ? '<span class="ce-builtin-badge">Built-in</span>' : '';
    const useCountHtml = (!isBuiltin && t.useCount) ? '<span class="ce-use-count" title="Used ' + t.useCount + ' times">' + t.useCount + '</span>' : '';
    const pinHtml = !isBuiltin ? '<span class="ce-pin-btn" data-idx="' + origIdx + '" title="' + (t.pinned ? 'Unpin' : 'Pin to top') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="' + (t.pinned ? '#f1c40f' : 'none') + '" stroke="' + (t.pinned ? '#f1c40f' : 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>' : '';
    const bulkHtml = (!isBuiltin && bulkSelectMode) ? '<input type="checkbox" class="ce-bulk-check" data-idx="' + origIdx + '" ' + (t._selected ? 'checked' : '') + '>' : '';
    const isExpanded = expandedCardIdx === origIdx;
    const expandHtml = isExpanded ? '<div class="ce-template-expand">' + escHtml(fullContent) + '</div>' : '';

    let actionsHtml;
    if (isBuiltin) {
      actionsHtml = '<button class="ce-copy-btn" data-idx="' + origIdx + '">Copy to Mine</button>';
    } else {
      actionsHtml = '<button class="ce-insert-btn" data-idx="' + origIdx + '">Insert</button> <button class="ce-edit-template-btn" data-idx="' + origIdx + '">Edit</button> <button class="ce-delete-template-btn" data-idx="' + origIdx + '" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
    }
    return '<div class="ce-template-card" draggable="' + (!isBuiltin && !bulkSelectMode) + '" data-idx="' + origIdx + '"><div class="ce-template-title">' + bulkHtml + chainHtml + escHtml(t.title) + pinHtml + builtinHtml + useCountHtml + '</div><div class="ce-template-preview" data-idx="' + origIdx + '">' + (isExpanded ? '' : renderMarkdownPreview(preview)) + '</div>' + expandHtml + (tagHtml ? '<div class="ce-template-tags">' + tagHtml + '</div>' : '') + '<div class="ce-template-actions">' + actionsHtml + '</div></div>';
  }

  function bindTemplateEvents(container) {
    const saveBtn = container.querySelector('#ce-save-template-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentPrompt);

    // Sort selector
    const sortSel = container.querySelector('#ce-sort-select');
    if (sortSel) sortSel.addEventListener('change', (e) => { templateSort = e.target.value; renderTemplates(); });

    // Select toggle
    const selectToggle = container.querySelector('#ce-select-toggle');
    if (selectToggle) selectToggle.addEventListener('click', () => { bulkSelectMode = !bulkSelectMode; expandedCardIdx = -1; renderTemplates(); });

    // Bulk delete
    const bulkDelBtn = container.querySelector('#ce-bulk-delete');
    if (bulkDelBtn) bulkDelBtn.addEventListener('click', () => {
      const toRemove = [];
      templates.forEach(t => { if (!t.builtin && t._selected) toRemove.push(t); });
      toRemove.forEach(t => { const i = templates.indexOf(t); if (i >= 0) templates.splice(i, 1); });
      _undoStack = toRemove;
      templates.forEach(t => { delete t._selected; });
      bulkSelectMode = false; templateFilter = null;
      saveData(); renderTemplates(); showUndoToast('Deleted ' + toRemove.length + ' templates', () => {
        _undoStack.forEach(t => templates.push(t));
        _undoStack = [];
        saveData(); renderTemplates(); showToast('Undone');
      });
    });

    // Pin buttons
    container.querySelectorAll('.ce-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = templates[parseInt(btn.dataset.idx)];
        t.pinned = !t.pinned;
        saveData(); renderTemplates();
      });
    });

    // Bulk checkboxes
    container.querySelectorAll('.ce-bulk-check').forEach(cb => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        templates[parseInt(cb.dataset.idx)]._selected = cb.checked;
      });
    });

    // Preview expand
    container.querySelectorAll('.ce-template-preview').forEach(preview => {
      preview.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(preview.dataset.idx);
        expandedCardIdx = expandedCardIdx === idx ? -1 : idx;
        renderTemplates();
      });
    });

    // Tag filter
    container.querySelectorAll('.ce-tag-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        templateFilter = chip.dataset.tag || null;
        renderTemplates();
      });
    });

    container.querySelectorAll('.ce-insert-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); if (!(await trackUsage())) return showUpgrade(); const t = templates[parseInt(btn.dataset.idx)]; if (t.chainId) { insertChain(t); } else { insertTemplate(t); } await incrementUsage(); });
    });
    container.querySelectorAll('.ce-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); copyBuiltin(parseInt(btn.dataset.idx)); });
    });
    container.querySelectorAll('.ce-edit-template-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); editTemplate(parseInt(btn.dataset.idx)); });
    });
    container.querySelectorAll('.ce-delete-template-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const [removed] = templates.splice(idx, 1);
        _undoStack = [removed];
        templateFilter = null; saveData(); renderTemplates();
        showUndoToast('Template deleted', () => {
          templates.splice(idx, 0, removed);
          _undoStack = [];
          saveData(); renderTemplates(); showToast('Undone');
        });
      });
    });
    container.querySelectorAll('.ce-template-card').forEach((card) => {
      card.addEventListener('click', async () => {
        if (bulkSelectMode) return;
        const t = templates[parseInt(card.dataset.idx)];
        if (t.builtin) return;
        if (!(await trackUsage())) return showUpgrade();
        if (t.chainId) { insertChain(t); } else { insertTemplate(t); }
        await incrementUsage();
      });
      // Drag & drop (disabled in bulk mode)
      if (!templates[parseInt(card.dataset.idx)].builtin && !bulkSelectMode) {
        card.addEventListener('dragstart', dragStart);
        card.addEventListener('dragover', dragOver);
        card.addEventListener('drop', dropTemplate);
        card.addEventListener('dragend', dragEnd);
      }
    });
  }

  // ─────────────── Drag & Drop ───────────────
  let dragSrcIdx = null;

  function dragStart(e) {
    dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
    e.currentTarget.classList.add('ce-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIdx.toString());
  }

  function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    target.classList.toggle('ce-drop-above', e.clientY < midY);
    target.classList.toggle('ce-drop-below', e.clientY >= midY);
  }

  function dropTemplate(e) {
    e.preventDefault();
    const targetIdx = parseInt(e.currentTarget.dataset.idx);
    if (dragSrcIdx === null || dragSrcIdx === targetIdx) { dragSrcIdx = null; return; }
    const [moved] = templates.splice(dragSrcIdx, 1);
    const newIdx = targetIdx > dragSrcIdx ? targetIdx - 1 : targetIdx;
    const isBelow = e.clientY >= e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
    templates.splice(isBelow ? newIdx + 1 : newIdx, 0, moved);
    saveData();
    renderTemplates();
    dragSrcIdx = null;
  }

  function dragEnd(e) {
    e.currentTarget.classList.remove('ce-dragging');
    document.querySelectorAll('.ce-template-card').forEach(c => {
      c.classList.remove('ce-drop-above', 'ce-drop-below');
    });
    dragSrcIdx = null;
  }

  function saveCurrentPrompt() {
    const input = findChatGPTInput();
    const text = input ? getInputText(input) : '';
    if (!text.trim()) return showToast('Type something in ' + getPlatformName() + ' first');
    showModal('Save Template',
      '<label>Title</label><input id="ce-modal-title" placeholder="e.g. Code Review"><label>Content</label><textarea id="ce-modal-content">' + escHtml(text) + '</textarea><label>Tags (comma separated)</label><input id="ce-modal-tags" placeholder="e.g. coding, review">',
      (vals) => {
        chrome.storage.local.get(['templates'], (data) => {
          const all = data.templates || [];
          all.push({ title: vals.title || 'Untitled', content: vals.content, tags: parseTags(vals.tags), createdAt: Date.now() });
          chrome.storage.local.set({ templates: all }, () => {
            templates = all;
            renderTemplates(); showToast('Saved!');
          });
        });
      });
    setTimeout(() => { const el = document.getElementById('ce-modal-title'); if (el) el.focus(); }, 50);
  }

  function copyBuiltin(idx) {
    const t = templates[idx];
    if (!t || !t.builtin) return;
    chrome.storage.local.get(['templates'], (data) => {
      const all = data.templates || [];
      all.push({ title: t.title + ' (copy)', content: t.content, tags: [...(t.tags||[])], createdAt: Date.now() });
      chrome.storage.local.set({ templates: all }, () => {
        templates = all;
        renderTemplates(); showToast('Copied to My Templates!');
      });
    });
  }

  function editTemplate(idx) {
    const t = templates[idx];
    if (!t || t.builtin) return;
    showModal('Edit Template',
      '<label>Title</label><input id="ce-modal-title" value="' + escHtml(t.title) + '"><label>Content</label><textarea id="ce-modal-content">' + escHtml(t.content) + '</textarea><label>Tags (comma separated)</label><input id="ce-modal-tags" value="' + escHtml((t.tags || []).join(', ')) + '"><label>Chain (optional: name to group sequential prompts)</label><input id="ce-modal-chain" value="' + escHtml(t.chainId||'') + '" placeholder="e.g. blog-workflow">',
      (vals) => {
        t.title = vals.title || t.title;
        t.content = vals.content;
        t.tags = parseTags(vals.tags);
        if (vals.chain) {
          t.chainId = vals.chain;
          t.chainOrder = t.chainOrder || 0;
        } else {
          delete t.chainId; delete t.chainOrder;
        }
        saveData(); renderTemplates(); showToast('Updated!');
      });
  }

  // ─────────────── Prompt Chains ───────────────
  function insertChain(tpl) {
    const chainTemplates = templates.filter(t => t.chainId === tpl.chainId && !t.builtin).sort((a, b) => (a.chainOrder||0) - (b.chainOrder||0));
    if (chainTemplates.length === 0) { insertTemplate(tpl); return; }
    chainState = { chainId: tpl.chainId, nextIndex: 1, templates: chainTemplates };
    insertTemplate(chainTemplates[0]);
    if (chainTemplates.length > 1) {
      showToast('Chain step 1/' + chainTemplates.length + '. Ctrl+Shift+N for next');
    }
  }

  function insertNextInChain() {
    if (!chainState || chainState.nextIndex >= chainState.templates.length) {
      chainState = null; showToast('No more steps in chain.'); return;
    }
    const tpl = chainState.templates[chainState.nextIndex];
    chainState.nextIndex++;
    doInsert(tpl.content);
    const remaining = chainState.templates.length - chainState.nextIndex;
    if (remaining > 0) { showToast('Step ' + chainState.nextIndex + '/' + chainState.templates.length + '. Ctrl+Shift+N for next'); }
    else { chainState = null; showToast('Chain complete!'); }
  }

  function parseTags(str) {
    return (str || '').split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  function insertTemplate(tpl) {
    tpl.useCount = (tpl.useCount || 0) + 1;
    tpl.lastUsedAt = Date.now();
    saveData();
    const vars = parseVariables(tpl.content);
    if (vars.length > 0) {
      showVariablesModal(vars, tpl);
    } else {
      doInsert(tpl.content);
    }
  }

  // ─────────────── Prompt Variables ───────────────
  function parseVariables(content) {
    const re = /\{\{(\w+)\}\}/g;
    const vars = [];
    let m;
    while ((m = re.exec(content)) !== null) {
      if (!vars.includes(m[1])) vars.push(m[1]);
    }
    return vars;
  }

  function showVariablesModal(vars, tpl) {
    let fieldsHTML = '';
    vars.forEach(v => {
      fieldsHTML += '<label>' + escHtml(v) + '</label><input id="ce-var-' + escHtml(v) + '" placeholder="Value for ' + escHtml(v) + '">';
    });
    showModal('Fill Variables',
      fieldsHTML,
      (vals) => {
        // vals is the standard modal vals, but we need to read the variable inputs
        let text = tpl.content;
        vars.forEach(v => {
          const input = document.getElementById('ce-var-' + v);
          const val = input ? input.value : '';
          text = text.replace(new RegExp('\\{\\{' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}', 'g'), val || '{{' + v + '}}');
        });
        doInsert(text);
      }
    );
    // Override save button text
    setTimeout(() => {
      const saveBtn = document.getElementById('ce-modal-save');
      if (saveBtn) saveBtn.textContent = 'Insert';
    }, 10);
  }

  function doInsert(text) {
    const input = findChatGPTInput();
    if (!input) return showToast('Input not found');
    setInputText(input, text);
    showToast('Inserted!');
  }

  // ─────────────── Folders (nested tree) ───────────────
  function getRootFolders() { return folders.filter(f => !f.parentId); }
  function getChildren(parentId) { return folders.filter(f => f.parentId === parentId); }

  function renderFolders() {
    const container = sidebar.querySelector('[data-content="folders"]');
    if (!container) return;
    let html = '<button class="ce-new-folder-btn" id="ce-new-folder-btn">+ New Folder</button>';
    if (folders.length === 0) {
      html += '<div class="ce-empty"><div class="ce-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>No folders yet.<br>Create one to organize saved chats.</div>';
    } else {
      getRootFolders().forEach(f => { html += renderFolderTree(f, 0); });
    }
    container.innerHTML = html;
    bindFolderEvents(container);
  }

  function renderFolderTree(f, depth) {
    const children = getChildren(f.id);
    const hasChildren = children.length > 0;
    const expanded = f._expanded !== false;
    const showConvos = f._showConvos === true;
    let html = '<div class="ce-folder-wrapper" style="margin-left:' + (depth * 16) + 'px">';
    html += '<div class="ce-folder" draggable="true" data-idx="' + folders.indexOf(f) + '">';
    html += '<div class="ce-folder-name">';
    if (hasChildren) {
      html += '<span class="ce-folder-toggle">' + (expanded ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>') + '</span>';
    } else {
      html += '<span class="ce-folder-toggle" style="visibility:hidden"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>';
    }
    html += '<span class="ce-folder-color" style="background:' + (f.color || '#6c5ce7') + '"></span>' + escHtml(f.name) + '</div>';
    html += '<div class="ce-folder-actions"><span class="ce-folder-count">' + (f.conversations ? f.conversations.length : 0) + '</span><button class="ce-folder-delete" data-idx="' + folders.indexOf(f) + '" title="Delete folder"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>';
    html += '</div>';
    // Conversation list
    if (showConvos) {
      const convs = f.conversations || [];
      html += '<div class="ce-folder-convos">';
      if (convs.length === 0) {
        html += '<div class="ce-folder-convo-empty">No saved chats yet. Click "+ Add Current Chat" below.</div>';
      } else {
        convs.slice().reverse().forEach((c, i) => {
          const d = c.savedAt ? new Date(c.savedAt).toLocaleDateString() : '';
          html += '<div class="ce-folder-convo" data-folder-idx="' + folders.indexOf(f) + '" data-convo-idx="' + (convs.length - 1 - i) + '"><div class="ce-folder-convo-title">' + escHtml(c.title || 'Untitled') + '</div><div class="ce-folder-convo-meta"><span>' + d + '</span><button class="ce-folder-convo-open">Open</button><button class="ce-folder-convo-remove" title="Remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>';
        });
      }
      html += '<button class="ce-folder-add-btn" data-idx="' + folders.indexOf(f) + '">+ Add Current Chat</button>';
      html += '</div>';
    }
    html += '</div>';
    if (hasChildren && expanded) {
      children.forEach(c => { html += renderFolderTree(c, depth + 1); });
    }
    return html;
  }

  function bindFolderEvents(container) {
    const btn = container.querySelector('#ce-new-folder-btn');
    if (btn) btn.addEventListener('click', () => {
      const parentOpts = '<option value="">(root)</option>' + folders.map(f => '<option value="' + f.id + '">' + escHtml(f.name) + '</option>').join('');
      showModal('New Folder',
        '<label>Name</label><input id="ce-modal-name" placeholder="e.g. Work"><label>Parent</label><select id="ce-modal-parent">' + parentOpts + '</select><label>Color</label><select id="ce-modal-color"><option value="#6c5ce7">Purple</option><option value="#e74c3c">Red</option><option value="#3498db">Blue</option><option value="#2ecc71">Green</option></select>',
        (vals) => {
          folders.push({ id: 'f_' + Date.now(), name: vals.name, color: vals.color, parentId: vals.parent || null, conversations: [], createdAt: Date.now() });
          saveData(); renderFolders();
        });
      setTimeout(() => { const el = document.getElementById('ce-modal-name'); if (el) el.focus(); }, 50);
    });

    // Folder delete
    container.querySelectorAll('.ce-folder-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const [removed] = folders.splice(idx, 1);
        const children = getChildren(removed.id);
        const childParentIds = children.map(c => c.parentId);
        children.forEach(c => { c.parentId = removed.parentId || null; });
        saveData(); renderFolders();
        showUndoToast('Folder "' + removed.name + '" deleted', () => {
          folders.splice(idx, 0, removed);
          children.forEach((c, i) => { c.parentId = childParentIds[i]; });
          saveData(); renderFolders(); showToast('Undone');
        });
      });
    });

    // Folder click: toggle conversations view
    container.querySelectorAll('.ce-folder').forEach((f) => {
      f.addEventListener('click', (e) => {
        const idx = parseInt(f.dataset.idx);
        const folder = folders[idx];
        // Toggle sub-folders
        if (e.target.closest('.ce-folder-toggle')) {
          folder._expanded = !(folder._expanded !== false);
          saveData(); renderFolders(); return;
        }
        // Toggle conversation list
        folder._showConvos = !(folder._showConvos === true);
        saveData(); renderFolders();
      });
      // Drag & drop
      f.addEventListener('dragstart', (e) => {
        dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
        e.currentTarget.classList.add('ce-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      f.addEventListener('dragover', (e) => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.stopPropagation();
      });
      f.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        const targetIdx = parseInt(e.currentTarget.dataset.idx);
        if (dragSrcIdx === null || dragSrcIdx === targetIdx) { dragSrcIdx = null; return; }
        const [moved] = folders.splice(dragSrcIdx, 1);
        folders.splice(targetIdx > dragSrcIdx ? targetIdx - 1 : targetIdx, 0, moved);
        if (e.shiftKey && dragSrcIdx !== null) {
          moved.parentId = folders[targetIdx].id;
        }
        saveData(); renderFolders();
        dragSrcIdx = null;
      });
      f.addEventListener('dragend', (e) => {
        e.currentTarget.classList.remove('ce-dragging');
        dragSrcIdx = null;
      });
    });

    // Open conversation
    container.querySelectorAll('.ce-folder-convo-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = folders[parseInt(btn.closest('[data-folder-idx]').dataset.folderIdx)];
        const convoIdx = parseInt(btn.closest('[data-folder-idx]').dataset.convoIdx);
        const conv = folder.conversations[convoIdx];
        if (conv && conv.url) window.open(conv.url, '_blank');
      });
    });

    // Remove conversation from folder
    container.querySelectorAll('.ce-folder-convo-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = folders[parseInt(btn.closest('[data-folder-idx]').dataset.folderIdx)];
        const convoIdx = parseInt(btn.closest('[data-folder-idx]').dataset.convoIdx);
        folder.conversations.splice(convoIdx, 1);
        saveData(); renderFolders();
      });
    });

    // Add current chat to folder
    container.querySelectorAll('.ce-folder-add-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folder = folders[parseInt(btn.dataset.idx)];
        if (!(await trackUsage())) return showUpgrade();
        const conv = getCurrentConversationInfo();
        if (conv) {
          folder.conversations = folder.conversations || [];
          if (!folder.conversations.find(c => c.url === conv.url)) {
            folder.conversations.push(conv); saveData(); showToast('Added to "' + folder.name + '"'); renderFolders();
          } else { showToast('Already in folder'); }
        }
        await incrementUsage();
      });
    });
  }

  // ─────────────── Export ───────────────
  function renderExport() {
    const container = sidebar.querySelector('[data-content="export"]');
    if (!container) return;
    container.innerHTML = '<button class="ce-export-btn" id="ce-export-md"><div class="ce-export-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div class="ce-export-label">Markdown</div><div class="ce-export-desc">Download as .md</div></button><button class="ce-export-btn" id="ce-export-txt"><div class="ce-export-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div><div class="ce-export-label">Text</div><div class="ce-export-desc">Download as .txt</div></button><button class="ce-export-btn" id="ce-export-json"><div class="ce-export-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div><div class="ce-export-label">JSON</div><div class="ce-export-desc">Structured data</div></button><button class="ce-export-btn" id="ce-export-pdf"><div class="ce-export-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></div><div class="ce-export-label">PDF</div><div class="ce-export-desc">Print to PDF</div></button><button class="ce-export-btn" id="ce-export-backup"><div class="ce-export-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><div class="ce-export-label">Backup All</div><div class="ce-export-desc">Export all data as JSON</div></button>';
    container.querySelector('#ce-export-md').addEventListener('click', async () => { if (!(await trackUsage())) return showUpgrade(); exportConv('md'); await incrementUsage(); });
    container.querySelector('#ce-export-txt').addEventListener('click', async () => { if (!(await trackUsage())) return showUpgrade(); exportConv('txt'); await incrementUsage(); });
    container.querySelector('#ce-export-json').addEventListener('click', async () => { if (!(await trackUsage())) return showUpgrade(); exportConv('json'); await incrementUsage(); });
    container.querySelector('#ce-export-pdf').addEventListener('click', async () => { if (!(await trackUsage())) return showUpgrade(); exportPdf(); await incrementUsage(); });
    container.querySelector('#ce-export-backup').addEventListener('click', () => { exportBackup(); });
  }

  function exportPdf() {
    const msgs = extractMessages();
    if (msgs.length === 0) return showToast('No messages found');
    const title = getConversationTitle();
    const aiName = getPlatformName();
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title><style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#222;line-height:1.8}.msg{margin-bottom:20px;padding:12px 16px;border-radius:8px}.user{background:#f0f4ff}.ai{background:#f5f5f5}.role{font-weight:700;font-size:13px;color:#888;margin-bottom:4px}.text{font-size:14px;white-space:pre-wrap}</style></head><body><h1>' + escHtml(title) + '</h1>' + msgs.map(m => '<div class="msg ' + (m.role === 'user' ? 'user' : 'ai') + '"><div class="role">' + (m.role === 'user' ? 'You' : aiName) + '</div><div class="text">' + escHtml(m.text) + '</div></div>').join('') + '</body></html>';
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return showToast('Popup blocked. Allow popups for this site.');
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); };
    showToast('Print dialog opened');
  }

  function exportConv(format) {
    const msgs = extractMessages();
    if (msgs.length === 0) return showToast('No messages found');
    const title = getConversationTitle();
    const aiName = getPlatformName();
    let content, filename, mime;
    if (format === 'md') { content = '# ' + title + '\n\n' + msgs.map(m => '**' + (m.role === 'user' ? 'You' : aiName) + '**\n\n' + m.text + '\n\n---\n\n').join(''); filename = sanitizeFilename(title) + '.md'; mime = 'text/markdown'; }
    else if (format === 'json') { content = JSON.stringify({ title, messages: msgs, exportedAt: new Date().toISOString() }, null, 2); filename = sanitizeFilename(title) + '.json'; mime = 'application/json'; }
    else { content = title + '\n' + '='.repeat(Math.min(title.length, 40)) + '\n\n' + msgs.map(m => '[' + (m.role === 'user' ? 'You' : aiName) + ']\n' + m.text + '\n\n').join(''); filename = sanitizeFilename(title) + '.txt'; mime = 'text/plain'; }
    downloadFile(content, filename, mime);
    showToast('Exported ' + format.toUpperCase() + '!');
  }

  // ─────────────── Search ───────────────
  function renderSearch() {
    const container = sidebar.querySelector('[data-content="search"]');
    if (!container) return;
    container.innerHTML = '<input class="ce-search-input" id="ce-search-input" placeholder="Search templates & saved chats..."><div id="ce-search-results"></div>';
    const input = container.querySelector('#ce-search-input');
    const resultsDiv = container.querySelector('#ce-search-results');
    renderSearchResults(resultsDiv, getRecentItems());
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      renderSearchResults(resultsDiv, q ? searchAll(q) : getRecentItems());
    });
    input.focus();
  }

  function getRecentItems() {
    const items = [];
    templates.slice(-5).reverse().forEach(t => items.push({ type: 'template', title: t.title, snippet: t.content, data: t }));
    folders.forEach(f => (f.conversations || []).forEach(c => items.push({ type: 'conversation', title: c.title, snippet: c.url, data: c, folder: f.name })));
    return items.slice(0, 20);
  }

  function searchAll(q) {
    const r = [];
    templates.forEach(t => { if (t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)) r.push({ type: 'template', title: t.title, snippet: t.content, data: t }); });
    folders.forEach(f => (f.conversations || []).forEach(c => { if (c.title.toLowerCase().includes(q)) r.push({ type: 'conversation', title: c.title, snippet: c.url, data: c, folder: f.name }); }));
    return r;
  }

  function renderSearchResults(container, results) {
    if (!container) return;
    if (results.length === 0) { container.innerHTML = '<div class="ce-empty"><div class="ce-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>Nothing found.</div>'; return; }
    container.innerHTML = results.map((r, i) => '<div class="ce-search-result" data-idx="' + i + '" data-type="' + r.type + '"><div class="ce-result-title">' + (r.type === 'template' ? 'T: ' : 'C: ') + escHtml(r.title) + '</div><div class="ce-result-snippet">' + escHtml(r.snippet.slice(0, 80)) + (r.folder ? ' · ' + r.folder : '') + '</div></div>').join('');
    container.querySelectorAll('.ce-search-result').forEach(el => {
      el.addEventListener('click', async () => {
        const results = searchAll(document.getElementById('ce-search-input')?.value.trim().toLowerCase() || '');
        const item = results[parseInt(el.dataset.idx)] || getRecentItems()[parseInt(el.dataset.idx)];
        if (!item) return;
        if (!(await trackUsage())) return showUpgrade();
        if (item.type === 'template') insertTemplate(item.data);
        else if (item.type === 'conversation' && item.data.url) window.location.href = item.data.url;
        await incrementUsage();
      });
    });
  }

  // ─────────────── DOM Helpers (multi-platform) ───────────────
  function findChatGPTInput() {
    const selectors = [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      '#prompt-textarea-quiz',
      'form textarea',
      '[role="textbox"][contenteditable="true"]',
      '[data-slate-editor="true"]',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch(e) {}
    }
    // fallback: find any visible textarea-like element in the main area
    const allInputs = document.querySelectorAll('textarea, [contenteditable="true"]');
    for (const el of allInputs) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 20) return el;
    }
    return null;
  }

  function getInputText(input) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      return input.value;
    }
    // For contenteditable divs like ChatGPT's prompt-textarea
    // Try innerText first (handles line breaks), fall back to textContent
    return (input.innerText || input.textContent || '').trim();
  }

  function setInputText(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
    else { input.textContent = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.focus();
  }

  function extractMessages() {
    const msgs = [];
    const platform = detectPlatform();
    let selectors;
    if (platform === 'claude') {
      selectors = [
        '[data-message-author-role]',
        '[data-testid="user-message"], [data-testid="assistant-message"]',
        '.group\\/conversation-turn',
        '[data-testid^="conversation-turn"]',
        'article',
        '[role="article"]',
      ];
    } else {
      selectors = ['[data-message-author-role]', '.group\\/conversation-turn', '[data-testid^="conversation-turn"]', 'article'];
    }
    let els = [];
    for (const sel of selectors) {
      try { els = document.querySelectorAll(sel); if (els.length > 0) break; } catch(e) {}
    }
    els.forEach(el => {
      let role = el.getAttribute('data-message-author-role');
      if (!role) {
        role = detectPlatform() === 'claude' ? detectClaudeRole(el) : 'assistant';
      }
      const text = (el.textContent || '').trim();
      if (text.length > 5) msgs.push({ role, text });
    });
    return msgs;
  }

  function detectClaudeRole(el) {
    const cls = el.className || '';
    const text = (el.textContent || '');
    if (cls.includes('user') || text.includes('You')) return 'user';
    return 'assistant';
  }

  function getConversationTitle() {
    const t = document.querySelector('title');
    if (!t) return getDefaultTitle();
    let text = t.textContent;
    const platform = detectPlatform();
    if (platform === 'claude') {
      text = text.replace(/\s*[-–|]\s*Claude(\s*AI)?/, '').replace(/^Claude(\s*AI)?\s*[-–|]?\s*/, '');
    } else if (platform === 'deepseek') {
      text = text.replace(' - DeepSeek', '').replace('DeepSeek', '');
    } else if (platform === 'gemini') {
      text = text.replace(' - Gemini', '').replace('Gemini', '');
    } else if (platform === 'grok') {
      text = text.replace(' - Grok', '').replace('Grok', '');
    } else if (platform === 'perplexity') {
      text = text.replace(' - Perplexity', '').replace('Perplexity', '');
    } else {
      text = text.replace(' - ChatGPT', '').replace('ChatGPT', '');
    }
    return text.trim() || 'Untitled';
  }

  function getCurrentConversationInfo() {
    return { title: getConversationTitle(), url: window.location.href, savedAt: Date.now() };
  }

  // ─────────────── Utilities ───────────────
  function saveData() { chrome.storage.local.set({ templates, folders }); }

  function showToast(msg) {
    const toast = document.getElementById('ce-toast');
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    toast.style.cursor = 'default';
    toast.onclick = null;
    clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function showUndoToast(msg, onUndo) {
    const toast = document.getElementById('ce-toast');
    if (!toast) return;
    toast.innerHTML = msg + ' <span style="color:#b388ff;cursor:pointer;text-decoration:underline;font-weight:600">Undo</span>';
    toast.classList.add('show');
    toast.style.cursor = 'default';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.classList.remove('show'); _undoStack = []; }, 6000);
    toast.onclick = null;
    setTimeout(() => {
      const undoLink = toast.querySelector('span');
      if (undoLink) undoLink.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(toast._t);
        toast.classList.remove('show');
        onUndo();
      });
    }, 10);
  }

  function showUpgrade() { showToast('Free limit reached. Upgrade to Pro.'); switchTab('templates'); updateProUI(); }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function sanitizeFilename(name) { return name.replace(/[^a-zA-Z0-9一-鿿\s_-]/g, '').slice(0, 50) || 'conversation'; }

  function exportBackup() {
    chrome.storage.local.get(['templates','folders','isPro'], (data) => {
      const backup = { templates: data.templates||[], folders: data.folders||[], isPro:!!data.isPro, exportedAt: new Date().toISOString(), version:'1.0' };
      const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='ai-chat-enhancer-backup.json';
      a.click(); URL.revokeObjectURL(url);
      showToast('Backup downloaded!');
    });
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function showModal(title, bodyHTML, onSave) {
    removeModal();
    const overlay = document.createElement('div');
    overlay.id = 'ce-modal-overlay';
    overlay.innerHTML = '<div id="ce-modal"><h3>' + title + '</h3>' + bodyHTML + '<div class="ce-modal-actions"><button class="ce-btn-cancel" id="ce-modal-cancel">Cancel</button><button class="ce-btn-primary" id="ce-modal-save">Save</button></div></div>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#ce-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#ce-modal-save').addEventListener('click', () => {
      const vals = { name: getVal('ce-modal-name'), color: getVal('ce-modal-color') || '#6c5ce7', title: getVal('ce-modal-title'), content: getVal('ce-modal-content'), tags: getVal('ce-modal-tags'), parent: getVal('ce-modal-parent'), chain: getVal('ce-modal-chain') };
      if (overlay.querySelector('#ce-modal-name') && !vals.name) return showToast('Enter a name');
      if (overlay.querySelector('#ce-modal-title') && !vals.title) return showToast('Enter a title');
      onSave(vals); close();
    });
    function getVal(id) { const el = overlay.querySelector('#' + id); return el ? el.value.trim() : ''; }
  }

  function removeModal() { const m = document.getElementById('ce-modal-overlay'); if (m) m.remove(); }

  // ─────────────── Context Menu Handler (register once) ───────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SAVE_SELECTION' && request.text) {
      showModal('Save Template',
        '<label>Title</label><input id="ce-modal-title" placeholder="e.g. Code Review"><label>Content</label><textarea id="ce-modal-content">' + escHtml(request.text) + '</textarea><label>Tags (comma separated)</label><input id="ce-modal-tags" placeholder="e.g. coding, review">',
        (vals) => {
          chrome.storage.local.get(['templates'], (data) => {
            const all = data.templates || [];
            all.push({ title: vals.title || 'Untitled', content: vals.content, tags: parseTags(vals.tags), createdAt: Date.now() });
            chrome.storage.local.set({ templates: all }, () => {
              templates = all;
              renderTemplates(); showToast('Saved!');
            });
          });
        });
      setTimeout(() => { const el = document.getElementById('ce-modal-title'); if (el) el.focus(); }, 50);
    }
  });

  // ─────────────── Keyboard ───────────────
  document.addEventListener('keydown', (e) => {
    // Close sidebar on Escape
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
      e.preventDefault();
      toggleSidebar(false);
      return;
    }
    // Toggle shortcut
    let toggleMatch = false;
    if (shortcutKey === 'shift+cmd+e') toggleMatch = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e';
    else if (shortcutKey === 'alt+e') toggleMatch = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'e';
    else if (shortcutKey === 'ctrl+shift+e') toggleMatch = e.ctrlKey && e.shiftKey && !e.metaKey && e.key === 'e';
    if (toggleMatch) { e.preventDefault(); toggleSidebar(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && e.shiftKey && chainState) { e.preventDefault(); insertNextInChain(); }
  });

  // ─────────────── Start ───────────────
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
  }
  // Backup: try again after 1.5s in case of SPA delay
  setTimeout(() => { if (!document.getElementById('ce-toggle-btn')) init(); }, 1500);
})();
