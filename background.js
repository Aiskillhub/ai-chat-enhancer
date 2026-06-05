// Background service worker for AI Chat Enhancer
// Handles storage operations, message passing, and built-in templates

const BUILTIN_TEMPLATES = [
  { title:'Code Review', content:'Please review the following code for bugs, performance issues, and best practices:\n\n```\n\n```\n\nFocus on: readability, error handling, edge cases, and security.', tags:['coding','review'], builtin:true, createdAt:Date.now() },
  { title:'Explain Code', content:'Explain the following code in detail, line by line. What does each part do and why is it written this way?\n\n```\n\n```', tags:['coding','learning'], builtin:true, createdAt:Date.now() },
  { title:'Translate to English', content:'Translate the following text to natural, fluent English. Preserve the original tone and nuance:\n\n', tags:['translation'], builtin:true, createdAt:Date.now() },
  { title:'中译英', content:'将以下内容翻译成地道的中文，保持原文的语气和风格：\n\n', tags:['translation'], builtin:true, createdAt:Date.now() },
  { title:'Summarize Article', content:'Summarize the following text in 3-5 bullet points. Capture the key arguments, evidence, and conclusions:\n\n', tags:['reading','productivity'], builtin:true, createdAt:Date.now() },
  { title:'Write Email', content:'Write a professional email with the following requirements.\n\nTone: [formal/friendly/casual]\nSubject: \nKey points:\n1. \n2. \n3. \n\nKeep it concise and actionable.', tags:['writing','email'], builtin:true, createdAt:Date.now() },
  { title:'Write Blog Post', content:'Write a blog post on the following topic.\n\nTopic: \nTarget audience: \nTone: [professional/casual/technical]\nWord count: ~800\n\nInclude: an engaging intro, 3-4 main sections with subheadings, and a conclusion with a call to action.', tags:['writing','blog'], builtin:true, createdAt:Date.now() },
  { title:'Debug Error', content:'I encountered the following error. Help me understand what causes it and how to fix it:\n\nError message:\n\n\nContext / steps to reproduce:\n\n\nMy environment:', tags:['coding','debugging'], builtin:true, createdAt:Date.now() },
  { title:'Refactor Code', content:'Refactor the following code to improve readability and maintainability without changing its behavior. Apply design patterns where appropriate:\n\n```\n\n```\n\nPlease explain your changes.', tags:['coding'], builtin:true, createdAt:Date.now() },
  { title:'Write Unit Tests', content:'Write comprehensive unit tests for the following function. Cover: happy path, edge cases, error handling, and boundary values. Use a standard testing framework:\n\n```\n\n```', tags:['coding','testing'], builtin:true, createdAt:Date.now() },
  { title:'SQL Query Help', content:'Write a SQL query for the following requirement. Optimize for performance and explain your approach:\n\nTable structure:\n\n\nRequirement:\n\n\nExpected output:', tags:['coding','sql'], builtin:true, createdAt:Date.now() },
  { title:'API Design', content:'Design a REST API for the following use case. Include: endpoints, HTTP methods, request/response schemas, error handling, and authentication approach:\n\nUse case:', tags:['coding','api'], builtin:true, createdAt:Date.now() },
  { title:'Resume Bullet Points', content:'Turn the following job experience into 3-5 strong resume bullet points using action verbs and quantifiable achievements:\n\nJob title:\nCompany:\nResponsibilities:\n\nMake them ATS-friendly.', tags:['writing','career'], builtin:true, createdAt:Date.now() },
  { title:'Social Media Post', content:'Write a social media post about the following topic.\n\nPlatform: [Twitter/LinkedIn/Instagram]\nTopic: \nTone: [professional/inspirational/casual]\n\nInclude relevant hashtags and a hook in the first line.', tags:['writing','social'], builtin:true, createdAt:Date.now() },
  { title:'Explain Concept', content:'Explain the following concept to me as if I have {{level}} knowledge of the subject. Use analogies and examples:\n\nConcept:\n\nKeep it clear and avoid unnecessary jargon.', tags:['learning'], builtin:true, createdAt:Date.now() },
  { title:'Meeting Notes', content:'Turn the following meeting transcript/notes into a structured summary:\n\n- Attendees:\n- Key decisions:\n- Action items (with owners):\n- Follow-up needed:\n\n\n\n', tags:['productivity','writing'], builtin:true, createdAt:Date.now() },
  { title:'Compare Options', content:'Compare the following options across these dimensions: features, pricing, pros/cons, best use case, and scalability.\n\nOption A:\nOption B:\nOption C (optional):\n\nGive a final recommendation with reasoning.', tags:['analysis'], builtin:true, createdAt:Date.now() },
  { title:'Brainstorm Ideas', content:'Help me brainstorm 10 creative ideas for:\n\nTopic: \nConstraints: \nTarget audience: \n\nPush beyond obvious answers. For each idea, give a one-sentence description.', tags:['creativity'], builtin:true, createdAt:Date.now() },
  { title:'Grammar Fix', content:'Fix the grammar, spelling, and punctuation in the following text. Improve clarity and flow without changing the meaning:\n\n', tags:['writing','editing'], builtin:true, createdAt:Date.now() },
  { title:'Create README', content:'Write a README.md for the following project. Include: title, description, features, installation, usage, configuration, and license sections:\n\nProject:\n\n\nTech stack:', tags:['coding','docs'], builtin:true, createdAt:Date.now() },
  { title:'Learning Plan', content:'Create a 4-week learning plan for mastering {{skill}}. Break it down by week with specific topics, resources, and practice exercises:\n\nCurrent level: beginner\nWeekly time commitment: {{hours}} hours', tags:['learning','productivity'], builtin:true, createdAt:Date.now() },
  { title:'Pitch / Elevator Speech', content:'Write a compelling 60-second elevator pitch for:\n\nProduct/idea:\nTarget audience:\nKey differentiator:\n\nMake it memorable and persuasive.', tags:['writing','business'], builtin:true, createdAt:Date.now() },
  { title:'Product Description', content:'Write a product description for an e-commerce listing. Include: headline, key features, benefits, specifications, and a persuasive closing:\n\nProduct:\n\n\nKeywords:', tags:['writing','marketing'], builtin:true, createdAt:Date.now() },
  { title:'Negotiation Email', content:'Write a professional negotiation email. Be polite but firm, state your position clearly, and propose a win-win solution:\n\nContext:\nMy position:\nDesired outcome:', tags:['writing','business','email'], builtin:true, createdAt:Date.now() },
  { title:'Feedback / Critique', content:'Provide constructive feedback on the following work. Use the "sandwich method" (positive → improvement areas → positive). Be specific and actionable:\n\n\n\nFocus on: clarity, structure, impact, and accuracy.', tags:['writing','productivity'], builtin:true, createdAt:Date.now() },
];

// Context menu: AI Chat Enhancer quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ce-parent',
    title: 'AI Chat Enhancer',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ce-explain',
    parentId: 'ce-parent',
    title: 'Explain this',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ce-summarize',
    parentId: 'ce-parent',
    title: 'Summarize this',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ce-improve',
    parentId: 'ce-parent',
    title: 'Improve writing',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ce-translate',
    parentId: 'ce-parent',
    title: 'Translate to English',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ce-save-template',
    parentId: 'ce-parent',
    title: 'Save as template',
    contexts: ['selection']
  });

  // Seed built-in templates and initialize usage tracking
  chrome.storage.local.get(['usageCount', 'usageDate', 'templates', 'builtinSeeded'], (data) => {
    const updates = {};
    if (!data.usageDate) {
      updates.usageCount = 0;
      updates.usageDate = new Date().toDateString();
    }
    if (!data.builtinSeeded && (!data.templates || data.templates.length === 0)) {
      updates.templates = BUILTIN_TEMPLATES;
      updates.builtinSeeded = true;
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const text = info.selectionText;
  if (!text) return;

  const prompts = {
    'ce-explain': 'Explain the following in detail, as if to a beginner. Break down key concepts:\n\n' + text,
    'ce-summarize': 'Summarize the following concisely. Extract the key points and main takeaways:\n\n' + text,
    'ce-improve': 'Improve the following writing. Fix grammar, clarity, and flow while keeping the original meaning:\n\n' + text,
    'ce-translate': 'Translate the following to natural, fluent English:\n\n' + text,
    'ce-save-template': null, // handled by content script
  };

  if (info.menuItemId === 'ce-save-template') {
    chrome.tabs.sendMessage(tab.id, { type: 'SAVE_SELECTION', text });
  } else if (prompts[info.menuItemId]) {
    chrome.tabs.sendMessage(tab.id, { type: 'INSERT_PROMPT', text: prompts[info.menuItemId] });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_USAGE') {
    checkUsageLimit().then(sendResponse);
    return true;
  }
  if (request.type === 'INCREMENT_USAGE') {
    incrementUsage().then(sendResponse);
    return true;
  }
  if (request.type === 'GET_PRO_STATUS') {
    chrome.storage.local.get(['isPro'], (data) => {
      sendResponse({ isPro: !!data.isPro });
    });
    return true;
  }
  if (request.type === 'OPTIMIZE_PROMPT') {
    optimizePrompt(request.text).then(sendResponse);
    return true;
  }
  if (request.type === 'ACTIVATE_PRO') {
    const licenseKey = request.licenseKey || '';
    if (!licenseKey) {
      sendResponse({ success: false, error: 'Please enter a license key.' });
      return true;
    }
    // Payhip API v2 license verification (public product secret key)
    const PRODUCT_SECRET_KEY = 'prod_sk_WiVe1_b96629ea9a169d42fb848ce0b90879202c6c0035';
    fetch(`https://payhip.com/api/v2/license/verify?license_key=${encodeURIComponent(licenseKey)}`, {
      headers: { 'product-secret-key': PRODUCT_SECRET_KEY }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.data && data.data.enabled) {
          chrome.storage.local.set({ isPro: true, licenseKey }, () => {
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: false, error: 'Invalid license key. Check your Payhip receipt.' });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: 'Cannot reach license server. Check your internet connection.' });
      });
    return true;
  }
  if (request.type === 'DEACTIVATE_PRO') {
    chrome.storage.local.remove(['isPro', 'licenseKey'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function optimizePrompt(text) {
  const data = await chrome.storage.local.get(['isPro', 'apiKey', 'apiProvider', 'apiBaseUrl']);
  if (!data.isPro) {
    return { success: false, error: 'Pro required for AI Optimizer.' };
  }
  const apiKey = data.apiKey;
  if (!apiKey) {
    return { success: false, error: 'Set your API key in the extension popup.' };
  }
  const provider = data.apiProvider || 'deepseek';

  const systemMsg = 'You are an expert prompt engineer. Improve the user\'s prompt to be more specific, detailed, and effective. Add relevant context, constraints, and structure. Return ONLY the improved prompt text, no explanations or prefixes. Preserve the original language and intent.';
  const userMsg = 'Optimize this prompt:\n\n' + text;

  try {
    let res, json, optimized;

    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: systemMsg,
          messages: [{ role: 'user', content: userMsg }]
        })
      });
      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: 'API error: ' + (res.status === 401 ? 'Invalid API key' : res.status === 429 ? 'Rate limited' : res.status + ' ' + err.slice(0, 80)) };
      }
      json = await res.json();
      optimized = json.content && json.content[0] ? json.content[0].text.trim() : '';
    } else {
      // OpenAI-compatible: deepseek, openai, custom
      let endpoint, model;
      if (provider === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        model = 'gpt-4o-mini';
      } else if (provider === 'custom') {
        endpoint = data.apiBaseUrl || 'https://api.openai.com/v1/chat/completions';
        model = 'gpt-4o-mini';
      } else {
        // deepseek (default)
        endpoint = 'https://api.deepseek.com/v1/chat/completions';
        model = 'deepseek-chat';
      }
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: 'API error: ' + (res.status === 401 ? 'Invalid API key' : res.status === 429 ? 'Rate limited' : res.status + ' ' + err.slice(0, 80)) };
      }
      json = await res.json();
      optimized = json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content.trim() : '';
    }

    if (!optimized) return { success: false, error: 'Empty response from API.' };
    return { success: true, optimized };
  } catch (err) {
    return { success: false, error: 'Network error: ' + (err.message || 'unknown') };
  }
}

async function checkUsageLimit() {
  const data = await chrome.storage.local.get(['usageCount', 'usageDate', 'isPro']);
  const today = new Date().toDateString();

  if (data.isPro) return { allowed: true, remaining: Infinity, isPro: true };

  if (data.usageDate !== today) {
    await chrome.storage.local.set({ usageCount: 0, usageDate: today });
    return { allowed: true, remaining: 10, isPro: false };
  }

  const count = data.usageCount || 0;
  return { allowed: count < 10, remaining: 10 - count, isPro: false };
}

async function incrementUsage() {
  const data = await chrome.storage.local.get(['usageCount', 'usageDate', 'isPro']);
  const today = new Date().toDateString();

  if (data.isPro) return { success: true, count: Infinity };

  const count = (data.usageDate === today ? data.usageCount || 0 : 0) + 1;
  await chrome.storage.local.set({ usageCount: count, usageDate: today });
  return { success: true, count };
}
