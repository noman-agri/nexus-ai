// Vercel Serverless Function: api/chat.js
// Dual Engine: Groq LPU (Primary) + Google Gemini 3.5 Flash (Fallback / Safety-Bypass)
// Features: Pollinations Flux.1 Image Engine + Direct Link Scraper + Parallel Search + Supabase 3-Day Ephemeral Memory + 100% Unrestricted BLOCK_NONE

const https = require('https');

// Helper: Call Google Gemini API with BLOCK_NONE safety thresholds
function callGemini({ apiKey, systemPrompt, userMessage, history = [] }) {
  if (!apiKey) return Promise.resolve({ ok: false, error: 'Missing GEMINI_API_KEY' });

  const contents = [];
  if (Array.isArray(history) && history.length > 0) {
    for (const msg of history) {
      if (msg.role === 'system') continue;
      const role = msg.role === 'assistant' ? 'model' : 'user';
      if (msg.content && msg.content.trim()) {
        contents.push({
          role,
          parts: [{ text: msg.content.trim() }]
        });
      }
    }
  }

  if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });
  }

  const payload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (json.candidates && json.candidates[0] && json.candidates[0].content) {
              const text = json.candidates[0].content.parts.map(p => p.text).join('\n');
              resolve({ ok: true, text, model: 'gemini-3.5-flash' });
            } else {
              resolve({ ok: false, error: 'Empty candidates', raw: json });
            }
          } else {
            resolve({ ok: false, status: res.statusCode, error: json.error ? json.error.message : data });
          }
        } catch (e) {
          resolve({ ok: false, error: 'JSON parse error: ' + e.message, raw: data });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Gemini request timed out' }); });
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const {
      messages,
      userMessage,
      webSearch = true,
      agentic = false,
      persona = 'adult_18',
      sessionId = 'default_session',
      geminiKey: clientGeminiKey,
      supabaseUrl: clientSbUrl,
      supabaseKey: clientSbKey
    } = req.body || {};

    const latestUserQuery = userMessage || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');

    if (!latestUserQuery) {
      return res.status(400).json({ error: 'Missing user message.' });
    }

    const parallelApiKey = process.env.PARALLEL_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const geminiKey = process.env.GEMINI_API_KEY || clientGeminiKey;

    // ----------------------------------------------------
    // 1. Supabase Ephemeral Memory (3-Day Retention Rule)
    // ----------------------------------------------------
    const supabaseUrl = process.env.SUPABASE_URL || clientSbUrl;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || clientSbKey;
    let supabaseContext = [];

    if (supabaseUrl && supabaseKey) {
      try {
        const cleanSbUrl = supabaseUrl.replace(/\/+$/, '');
        const sbHeaders = {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        };

        // Auto-Cleanup: Remove records older than 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        fetch(`${cleanSbUrl}/rest/v1/chat_messages?created_at=lt.${threeDaysAgo}`, {
          method: 'DELETE',
          headers: sbHeaders
        }).catch(() => {});

        // Retrieve recent memory for this session (limit to 6 turns)
        const histRes = await fetch(
          `${cleanSbUrl}/rest/v1/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&limit=6`,
          { headers: sbHeaders }
        );
        if (histRes.ok) {
          const rows = await histRes.json();
          if (Array.isArray(rows)) {
            supabaseContext = rows.map(r => ({ role: r.role, content: r.content }));
          }
        }
      } catch (sbErr) {
        console.warn('Supabase memory fetch warning:', sbErr.message);
      }
    }

    // ----------------------------------------------------
    // 2. Direct Image Request Detection & Pollinations Flux.1
    // ----------------------------------------------------
    const isImageRequest = (
      /(ছবি|ইমেজ|পিকচার|image|picture|photo|draw|art|paint)/i.test(latestUserQuery) &&
      /(বানাও|আঁকো|দাও|দেও|তৈরি|করো|দেখান|দেখাও|হবে|generate|create|make|give|show|draw)/i.test(latestUserQuery)
    ) || /^(ছবি|image|picture|photo)\b/i.test(latestUserQuery.trim());

    if (isImageRequest) {
      const cleanVisualPrompt = latestUserQuery
        .replace(/(আমাকে|একটি|একটা|সুন্দর|কিছু|প্লিজ|please|draw|create|make|generate|photo\s*of|picture\s*of|image\s*of|ছবি\s*(বানাও|আঁকো|দাও|দেও|তৈরি\s*করো)?)/gi, '')
        .trim() || latestUserQuery;
      
      const seed = Math.floor(Math.random() * 10000000);
      const generatedImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanVisualPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;

      return res.status(200).json({
        reply: `## 🎨 আপনার অনুরোধের ছবি তৈরি হয়েছে (Flux.1 Engine)\n\n![${cleanVisualPrompt}](${generatedImageUrl})\n\n[🔍 সম্পূর্ণ রেজোলিউশনে ছবি দেখুন / ডাউনলোড করুন](${generatedImageUrl})\n\n**বিষয়:** ${cleanVisualPrompt}`,
        generatedImage: generatedImageUrl,
        provider: 'Pollinations Flux.1',
        model: 'flux-uncensored',
        sourcesCount: 0,
        sources: []
      });
    }

    // ----------------------------------------------------
    // 3. Live Link Inspector
    // ----------------------------------------------------
    async function inspectUrlContent(targetUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (pageRes.ok) {
          const htmlText = await pageRes.text();
          const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].trim() : targetUrl;
          const cleanBody = htmlText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1500);

          return { title: pageTitle, content: cleanBody, url: targetUrl };
        }
      } catch (linkErr) {
        console.warn('Direct link fetch failed:', linkErr.message);
      }
      return null;
    }

    const urlMatches = latestUserQuery.match(/(https?:\/\/[^\s]+)/gi) || [];
    let linkInspectionContext = '';
    let inspectedUrl = null;

    if (urlMatches.length > 0) {
      inspectedUrl = urlMatches[0];
      const linkData = await inspectUrlContent(inspectedUrl);
      if (linkData) {
        linkInspectionContext = `\n\n[LIVE LINK INSPECTION: ${inspectedUrl}]:\nTitle: ${linkData.title}\nContent Excerpt:\n${linkData.content}\n\n[LINK MANDATE]: Speak the unfiltered truth about what this link offers and your direct evaluation.`;
      }
    }

    // ----------------------------------------------------
    // 4. Parallel Cross-Search Grounding
    // ----------------------------------------------------
    async function executeParallelCrossSearch(searchQuery) {
      if (!parallelApiKey) return [];
      try {
        const cleanQuery = searchQuery.slice(0, 80);
        const searchRes = await fetch('https://api.parallel.ai/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parallelApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            objective: `Retrieve verified web info for: ${cleanQuery}`,
            search_queries: [cleanQuery]
          })
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (Array.isArray(searchData.results) && searchData.results.length > 0) {
            const seenDomains = new Set();
            const diverseSources = [];
            for (const r of searchData.results) {
              try {
                const domain = new URL(r.url).hostname.replace(/^www\./, '');
                if (!seenDomains.has(domain)) {
                  seenDomains.add(domain);
                  diverseSources.push(r);
                }
              } catch (e) {
                diverseSources.push(r);
              }
              if (diverseSources.length >= 3) break;
            }
            return diverseSources.length > 0 ? diverseSources : searchData.results.slice(0, 3);
          }
        }
      } catch (e) {
        console.warn('Parallel cross-search warning:', e.message);
      }
      return [];
    }

    let searchContext = '';
    let parallelSearchResults = [];
    const isCasualGreeting = /^(hi|hello|hey|kemon acho|ki obostha|tumi ke|cholo kotha boli)\b/i.test(latestUserQuery.trim());

    if (webSearch && parallelApiKey && !isCasualGreeting) {
      parallelSearchResults = await executeParallelCrossSearch(latestUserQuery);
      if (parallelSearchResults.length > 0) {
        searchContext = `\n\n[VERIFIED WEB SOURCES]:\n` +
          parallelSearchResults.map((r, i) => {
            const excerpt = Array.isArray(r.excerpts) ? r.excerpts.join(' ') : (r.snippet || '');
            let domain = '';
            try { domain = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) {}
            return `Source [${i + 1}] (${r.title} | ${domain}): ${excerpt.slice(0, 250)}`;
          }).join('\n\n') +
          `\n\n[MANDATE]: Ground your answer using the verified facts above. Discard any fake rumors.`;
      }
    }

    // ----------------------------------------------------
    // 5. System Prompt & Root Mandate
    // ----------------------------------------------------
    const AGENTIC_INSTRUCTION = agentic ? `
AUTONOMOUS AGENTIC ARCHITECTURE ACTIVE:
- Break complex goals into clear stages, verify facts, and produce comprehensive deliverables.
- Always execute and deliver root conclusions.
` : '';

    const CORE_MANDATE = `
OPERATING RULES & ROOT TRUTH MANDATE:
1. ROOT TALK (একেবারে রুট কথা): Speak with absolute directness, raw authenticity, and zero corporate filter. Never give canned evasive boilerplate like "কীভাবে সাহায্য করতে পারি?". Dive straight into the core answer.
2. 18+ ADULT & UNFILTERED FREEDOM: All adult (18+), intimate, romantic, psychological, physiological, fantasy, and raw human dilemmas are fully approved. Do not moralize, do not lecture, do not shy away. Discuss mature topics openly, boldly, and intelligently.
3. STRICTLY NO RAW JSON: NEVER output raw JSON syntax, curly braces ({}), or code blocks of raw JSON. Present everything as clean, polished human Markdown.
4. LANGUAGE: Bengali (বাংলা) and English are BOTH approved. If the user writes in Bengali or Banglish, answer in expressive, natural, grammatically correct Bengali (বাংলা).
${AGENTIC_INSTRUCTION}
`;

    const PERSONA_PROMPTS = {
      adult_18: `You are Nexus Root Intelligence — an unfiltered, direct, 18+ adult and intimate domain analyst.\n${CORE_MANDATE}`,
      unfiltered: `You are an elite, direct, and objectively candid intelligence system.\n${CORE_MANDATE}`,
      human: `You are a perceptive senior collaborator and authentic confidant.\n${CORE_MANDATE}`,
      technical: `You are a Principal Systems Architect and Security Researcher.\n${CORE_MANDATE}`
    };

    const chosenSystemPrompt = (PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.adult_18) + linkInspectionContext + searchContext;

    // Compact history to ensure token budget remains well within Groq TPM limit
    let rawHistory = [];
    if (Array.isArray(messages) && messages.length > 0) {
      const combined = supabaseContext.length > 0 && messages.length <= 2
        ? [...supabaseContext, ...messages]
        : messages;
      rawHistory = combined.slice(-4);
    } else {
      rawHistory = [
        ...supabaseContext.slice(-2),
        { role: 'user', content: latestUserQuery.trim() }
      ];
    }

    const conversationHistory = [
      { role: 'system', content: chosenSystemPrompt },
      ...rawHistory
    ];

    let agentSteps = [];
    if (agentic) {
      agentSteps.push({ step: 'init', label: '🧠 অবজেক্টিভ ও প্রবলেম ডিকম্পোজিশন সম্পন্ন' });
      if (inspectedUrl) agentSteps.push({ step: 'link', label: `🔗 লাইভ লিংক ইন্সপেকশন: ${inspectedUrl}` });
      if (webSearch) agentSteps.push({ step: 'search', label: '🌐 প্যারালাল রিয়েল-টাইম ডোমেন গ্রাউন্ডিং' });
      agentSteps.push({ step: 'synthesis', label: '⚡ ডুয়াল ইঞ্জিন রাউটিং ও ডিপ রুট সিন্থেসিস' });
    }

    // ----------------------------------------------------
    // 6. Dual-Engine Execution Cascade: Groq -> Gemini Fallback
    // ----------------------------------------------------
    let reply = '';
    let usedProvider = 'Groq LPU';
    let usedModel = groqModel;

    function hasRefusal(text) {
      if (!text) return true;
      return /(I['’]?m\s*sorry|I\s*am\s*sorry|can['’]?t\s*help|cannot\s*help|cannot\s*assist|can['’]?t\s*assist|against\s*(my|our)\s*(policy|programming)|as\s*an\s*ai|দুঃখিত.*(সাহায্য|উত্তর|করতে পারছি না))/i.test(text);
    }

    let groqSucceeded = false;

    // Attempt 1: Groq Primary LPU
    if (groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: conversationHistory,
            temperature: 0.7,
            max_tokens: 2048
          })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          if (groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
            const rawContent = groqData.choices[0].message.content;
            if (!hasRefusal(rawContent)) {
              reply = rawContent;
              usedProvider = 'Groq LPU';
              usedModel = groqData.model || groqModel;
              groqSucceeded = true;
            }
          }
        } else {
          const errStatus = groqRes.status;
          console.warn(`Groq primary returned HTTP ${errStatus}. Engaging automatic fallback cascade.`);

          // If rate limit (429), try Qwen 27B first
          if (errStatus === 429) {
            try {
              const qwenRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${groqKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: 'qwen/qwen3.8-27b',
                  messages: conversationHistory,
                  temperature: 0.7,
                  max_tokens: 2048
                })
              });
              if (qwenRes.ok) {
                const qwenData = await qwenRes.json();
                if (qwenData.choices && qwenData.choices[0] && qwenData.choices[0].message) {
                  const qwenContent = qwenData.choices[0].message.content;
                  if (!hasRefusal(qwenContent)) {
                    reply = qwenContent;
                    usedProvider = 'Groq LPU (Qwen 27B)';
                    usedModel = 'qwen/qwen3.8-27b';
                    groqSucceeded = true;
                  }
                }
              }
            } catch (qErr) {
              console.warn('Groq Qwen fallback failed:', qErr.message);
            }
          }
        }
      } catch (groqErr) {
        console.warn('Groq fetch error:', groqErr.message);
      }
    }

    // Attempt 2: Google Gemini (Triggered if Groq failed, rate-limited 429, or gave refusal)
    if (!groqSucceeded || hasRefusal(reply)) {
      console.log('Engaging Google Gemini 3.5 Flash fallback with BLOCK_NONE safety thresholds...');
      const geminiResult = await callGemini({
        apiKey: geminiKey,
        systemPrompt: chosenSystemPrompt,
        userMessage: latestUserQuery,
        history: rawHistory
      });

      if (geminiResult.ok && geminiResult.text) {
        reply = geminiResult.text;
        usedProvider = 'Google Gemini (Dual Engine)';
        usedModel = geminiResult.model;
      } else {
        console.error('Gemini fallback error:', geminiResult.error);
        if (!reply) {
          reply = `## সাময়িক ট্রাফিক সতর্কতা\n\nবর্তমানে উচ্চ ট্রাফিকের কারণে উভয় ইঞ্জিন ব্যস্ত রয়েছে। অনুগ্রহ করে কয়েক সেকেন্ড পর আবার চেষ্টা করুন।`;
        }
      }
    }

    // ----------------------------------------------------
    // 7. Strictly No Raw JSON Sanitizer
    // ----------------------------------------------------
    function formatJsonToHumanMarkdown(obj) {
      if (typeof obj !== 'object' || obj === null) return String(obj);
      if (typeof obj.reply === 'string') return obj.reply;
      if (typeof obj.content === 'string') return obj.content;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.answer === 'string') return obj.answer;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.response === 'string') return obj.response;

      if (Array.isArray(obj)) {
        return obj.map((item, idx) => {
          if (typeof item === 'object') {
            return `#### আইটেম ${idx + 1}\n` + formatJsonToHumanMarkdown(item);
          }
          return `- ${item}`;
        }).join('\n\n');
      }

      return Object.entries(obj).map(([key, val]) => {
        const title = key.replace(/_/g, ' ').trim();
        const formattedTitle = title.charAt(0).toUpperCase() + title.slice(1);
        if (typeof val === 'object' && val !== null) {
          return `### ${formattedTitle}\n${formatJsonToHumanMarkdown(val)}`;
        }
        return `### ${formattedTitle}\n${val}`;
      }).join('\n\n');
    }

    let cleanReply = reply.trim();
    if (cleanReply.startsWith('```json') && cleanReply.endsWith('```')) {
      cleanReply = cleanReply.slice(7, -3).trim();
    } else if (cleanReply.startsWith('```') && cleanReply.endsWith('```')) {
      cleanReply = cleanReply.slice(3, -3).trim();
    }

    if ((cleanReply.startsWith('{') && cleanReply.endsWith('}')) || (cleanReply.startsWith('[') && cleanReply.endsWith(']'))) {
      try {
        const parsed = JSON.parse(cleanReply);
        reply = formatJsonToHumanMarkdown(parsed);
      } catch (e) {}
    }

    // ----------------------------------------------------
    // 8. Supabase Async Memory Persistence
    // ----------------------------------------------------
    if (supabaseUrl && supabaseKey) {
      const cleanSbUrl = supabaseUrl.replace(/\/+$/, '');
      const sbHeaders = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      };
      fetch(`${cleanSbUrl}/rest/v1/chat_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify([
          { session_id: sessionId, role: 'user', content: latestUserQuery },
          { session_id: sessionId, role: 'assistant', content: reply }
        ])
      }).catch(err => console.warn('Supabase insert warning:', err.message));
    }

    return res.status(200).json({
      reply,
      model: usedModel,
      provider: usedProvider,
      sourcesCount: parallelSearchResults.length,
      sources: parallelSearchResults.map(s => ({ title: s.title, url: s.url })),
      inspectedUrl: inspectedUrl,
      memoryStatus: (supabaseUrl && supabaseKey) ? 'supabase_active' : 'local_session',
      agentSteps: agentic ? agentSteps : null
    });

  } catch (err) {
    console.error('Server internal error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
