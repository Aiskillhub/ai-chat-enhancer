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

// Context menu: save selected text as template
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-as-template',
    title: 'Save to AI Chat Enhancer',
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
  if (info.menuItemId === 'save-as-template' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, { type: 'SAVE_SELECTION', text: info.selectionText });
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
  if (request.type === 'ACTIVATE_PRO') {
    const licenseKey = request.licenseKey || '';
    if (!licenseKey) {
      sendResponse({ success: false, error: 'Please enter a license key.' });
      return true;
    }
    // Verify against Payhip License v2 API
    // REPLACE_WITH_YOUR_SECRET: get this from Payhip → Product → Edit → License Keys → Product Secret Key
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
});

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
