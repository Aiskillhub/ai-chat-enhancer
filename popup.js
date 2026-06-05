document.addEventListener('DOMContentLoaded', () => {
  let currentIsPro = false;

  // Load data
  chrome.storage.local.get(
    ['templates', 'folders', 'isPro', 'usageCount', 'usageDate', 'shortcut', 'apiKey', 'apiProvider', 'apiBaseUrl'],
    (data) => {
      const templates = data.templates || [];
      const folders = data.folders || [];
      const isPro = !!data.isPro;
      currentIsPro = isPro;
      const today = new Date().toDateString();
      const usageCount = data.usageDate === today ? data.usageCount || 0 : 0;
      const max = isPro ? 'unlimited' : 10;

      document.getElementById('templateCount').textContent = templates.length;
      document.getElementById('folderCount').textContent = folders.length;
      document.getElementById('usageToday').textContent = `${usageCount}/${max}`;
      document.getElementById('statusText').textContent = isPro ? 'Pro' : 'Free';
      document.getElementById('proBadge').style.display = isPro ? 'inline' : 'none';
      document.getElementById('upgradeBtn').style.display = isPro ? 'none' : 'block';
      document.getElementById('activateSection').classList.toggle('hidden', isPro);

      // Set shortcut selector
      const sel = document.getElementById('shortcutSelect');
      const sc = data.shortcut || 'shift+cmd+e';
      if (sel) sel.value = sc;
      updateShortcutTip(sc);

      // Deactivate section
      document.getElementById('deactivateSection').classList.toggle('hidden', !isPro);
      const apiKeyInput = document.getElementById('apiKeyInput');
      const apiProvider = document.getElementById('apiProvider');
      const apiBaseUrl = document.getElementById('apiBaseUrl');
      const customUrlRow = document.getElementById('customUrlRow');
      if (apiKeyInput && data.apiKey) apiKeyInput.value = data.apiKey;
      if (apiProvider && data.apiProvider) apiProvider.value = data.apiProvider;
      if (apiBaseUrl && data.apiBaseUrl) apiBaseUrl.value = data.apiBaseUrl;
      if (customUrlRow && apiProvider) {
        customUrlRow.style.display = apiProvider.value === 'custom' ? 'block' : 'none';
      }
      // API key section visible for all users (Pro gate happens on usage)
      const apiKeySection = document.getElementById('apiKeySection');
      if (apiKeySection) {
        apiKeySection.style.display = 'block';
      }
    }
  );

  // Open ChatGPT
  document.getElementById('openChatGPTBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chatgpt.com' });
  });

  // Open Claude
  document.getElementById('openClaudeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://claude.ai' });
  });

  // Open DeepSeek
  document.getElementById('openDeepSeekBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.deepseek.com' });
  });

  // Open Gemini
  document.getElementById('openGeminiBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://gemini.google.com' });
  });

  // Open Grok
  document.getElementById('openGrokBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://grok.com' });
  });

  // Open Perplexity
  document.getElementById('openPerplexityBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://perplexity.ai' });
  });

  // Import template from clipboard
  document.getElementById('importTemplateBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const tpl = JSON.parse(text);
      if (!tpl.title || !tpl.content || !tpl.v) throw new Error('Invalid format');
      chrome.storage.local.get(['templates'], (data) => {
        const all = data.templates || [];
        all.push({ title: tpl.title, content: tpl.content, tags: tpl.tags || [], createdAt: Date.now() });
        chrome.storage.local.set({ templates: all }, () => {
          document.getElementById('templateCount').textContent = all.length;
          alert('Imported: ' + tpl.title + '\n\nReload the AI chat page to see it.');
        });
      });
    } catch (e) {
      alert('No valid template in clipboard.\n\nCopy a template JSON from AI Chat Enhancer first.\n(Click "Copy" on any template card in the sidebar.)');
    }
  });

  // Upgrade button
  document.getElementById('upgradeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://aiskillhub.github.io/ai-chat-enhancer/' });
    // Also show activate section after purchasing
    document.getElementById('activateSection').classList.remove('hidden');
  });

  // Activate button
  document.getElementById('activateBtn').addEventListener('click', () => {
    const code = document.getElementById('activateCode').value.trim();
    const msgEl = document.getElementById('activateMsg');

    if (!code) {
      msgEl.className = 'msg error';
      msgEl.textContent = 'Please enter a license key.';
      return;
    }

    const btn = document.getElementById('activateBtn');
    btn.disabled = true;
    btn.textContent = '...';
    msgEl.className = 'msg';
    msgEl.textContent = 'Verifying...';

    chrome.runtime.sendMessage({ type: 'ACTIVATE_PRO', licenseKey: code }, (res) => {
      btn.disabled = false;
      btn.textContent = 'Activate';
      if (res && res.success) {
        msgEl.className = 'msg';
        msgEl.textContent = 'Activated! Reload the AI chat page to enjoy Pro.';
        document.getElementById('proBadge').style.display = 'inline';
        document.getElementById('statusText').textContent = 'Pro';
        document.getElementById('usageToday').textContent = '0/unlimited';
        document.getElementById('upgradeBtn').style.display = 'none';
        document.getElementById('activateSection').classList.add('hidden');
        const apiKeySection = document.getElementById('apiKeySection');
        if (apiKeySection) apiKeySection.style.display = 'block';
      } else {
        msgEl.className = 'msg error';
        msgEl.textContent = (res && res.error) || 'Invalid license key. Check your Payhip receipt.';
      }
    });
  });

  // Press Enter in activate input
  document.getElementById('activateCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('activateBtn').click();
  });

  const shortcutLabels = {
    'shift+cmd+e': 'Shift+Cmd+E',
    'alt+e': 'Alt+E',
    'ctrl+shift+e': 'Ctrl+Shift+E'
  };

  function updateShortcutTip(sc) {
    const tip = document.getElementById('shortcutTip');
    if (tip) tip.textContent = shortcutLabels[sc] || sc + ' to toggle sidebar';
  }

  // Shortcut selector
  document.getElementById('shortcutSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ shortcut: e.target.value });
    updateShortcutTip(e.target.value);
  });

  // Backup
  document.getElementById('backupBtn').addEventListener('click', () => {
    chrome.storage.local.get(['templates','folders','isPro'], (data) => {
      const backup = { templates: data.templates||[], folders: data.folders||[], exportedAt: new Date().toISOString(), version:'1.1' };
      const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='ai-chat-enhancer-backup.json';
      a.click(); URL.revokeObjectURL(url);
    });
  });

  // Save API key
  document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    const provider = document.getElementById('apiProvider').value;
    const baseUrl = document.getElementById('apiBaseUrl').value.trim();
    const msg = document.getElementById('apiKeyMsg');
    chrome.storage.local.set({ apiKey: key, apiProvider: provider, apiBaseUrl: baseUrl }, () => {
      msg.className = 'msg';
      msg.textContent = key ? 'Saved.' : 'Cleared.';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    });
  });

  // Show/hide custom URL when provider changes
  document.getElementById('apiProvider').addEventListener('change', (e) => {
    document.getElementById('customUrlRow').style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  // Import
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.templates || !data.folders) throw new Error('Invalid format');
        chrome.storage.local.set({ templates: data.templates, folders: data.folders }, () => {
          alert('Imported ' + data.templates.length + ' templates and ' + data.folders.length + ' folders. Reload AI chat pages.');
          e.target.value = '';
          // Refresh counts
          document.getElementById('templateCount').textContent = data.templates.length;
          document.getElementById('folderCount').textContent = data.folders.length;
        });
      } catch(err) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  });

  // Deactivate Pro
  document.getElementById('deactivateBtn').addEventListener('click', () => {
    if (!confirm('Deactivate Pro license? You can re-activate anytime.')) return;
    chrome.runtime.sendMessage({ type: 'DEACTIVATE_PRO' }, (res) => {
      if (res && res.success) {
        document.getElementById('proBadge').style.display = 'none';
        document.getElementById('statusText').textContent = 'Free';
        document.getElementById('usageToday').textContent = '0/10';
        document.getElementById('upgradeBtn').style.display = 'block';
        document.getElementById('activateSection').classList.remove('hidden');
        document.getElementById('deactivateSection').classList.add('hidden');
        alert('Deactivated. Reload AI chat pages to apply.');
      }
    });
  });
});
