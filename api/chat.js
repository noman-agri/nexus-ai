// Vercel Serverless Function: api/chat.js
// Features: Groq LPU Root Intelligence + Link Checker + Parallel Search + Supabase 3-Day Ephemeral Memory + Strict No-Raw-JSON

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
      persona = 'adult_18',
      sessionId = 'default_session',
      supabaseUrl: clientSbUrl,
      supabaseKey: clientSbKey
    } = req.body || {};

    const latestUserQuery = userMessage || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');

    if (!latestUserQuery) {
      return res.status(400).json({ error: 'Missing user message.' });
    }

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

        // 1A. Auto-Cleanup: Remove records older than 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        fetch(`${cleanSbUrl}/rest/v1/chat_messages?created_at=lt.${threeDaysAgo}`, {
          method: 'DELETE',
          headers: sbHeaders
        }).catch(() => {});

        // 1B. Retrieve recent memory for this session (within 3 days)
        const histRes = await fetch(
          `${cleanSbUrl}/rest/v1/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&limit=10`,
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
    // 2. Direct Link Inspection (লিংক দিলে চেক করে বিশ্লেষণ)
    // ----------------------------------------------------
    const urlMatches = latestUserQuery.match(/(https?:\/\/[^\s]+)/gi) || [];
    let linkInspectionContext = '';
    let inspectedUrl = null;

    if (urlMatches.length > 0) {
      inspectedUrl = urlMatches[0];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const pageRes = await fetch(inspectedUrl, {
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
          const pageTitle = titleMatch ? titleMatch[1].trim() : inspectedUrl;
          const cleanBody = htmlText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);

          linkInspectionContext = `\n\n[LIVE LINK INSPECTION FOR: ${inspectedUrl}]:\nTitle: ${pageTitle}\nExtracted Content:\n${cleanBody}\n\n[LINK MANDATE]: The user provided this link. Examine it closely. Speak the unfiltered root truth about what this link/site is, what it contains or does, its legitimacy or purpose, and give your raw, direct evaluation.`;
        }
      } catch (linkErr) {
        console.warn('Direct link fetch failed, falling back:', linkErr.message);
      }
    }

    // ----------------------------------------------------
    // 3. Parallel AI Web Search Grounding
    // ----------------------------------------------------
    const parallelApiKey = process.env.PARALLEL_API_KEY;
    let searchContext = '';
    let parallelSearchResults = [];

    // Avoid searching if user is casually chatting or link is already analyzed
    const isCasualGreeting = /^(hi|hello|hey|kemon acho|ki obostha|tumi ke|cholo kotha boli)\b/i.test(latestUserQuery.trim());

    if (webSearch && parallelApiKey && !linkInspectionContext && !isCasualGreeting) {
      try {
        const searchRes = await fetch('https://api.parallel.ai/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parallelApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            objective: `Retrieve verified web information and domain data for: ${latestUserQuery}`,
            search_queries: [latestUserQuery.slice(0, 100)]
          })
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (Array.isArray(searchData.results) && searchData.results.length > 0) {
            parallelSearchResults = searchData.results.slice(0, 5);
            searchContext = `\n\n[LIVE SEARCH GROUNDING FROM PARALLEL.AI]:\n` +
              parallelSearchResults.map((r, i) => {
                const excerpt = Array.isArray(r.excerpts) ? r.excerpts.join(' ') : (r.snippet || '');
                return `Source [${i + 1}] (${r.title}): ${r.url}\nExcerpt: ${excerpt.slice(0, 450)}`;
              }).join('\n\n') +
              `\n\n[NLP INSTRUCTION]: Synthesize and integrate any relevant domain findings above seamlessly into your response without outputting raw search dumps or JSON.`;
          }
        }
      } catch (searchErr) {
        console.warn('Parallel search connection failed:', searchErr.message);
      }
    }

    // ----------------------------------------------------
    // 4. Root Intelligence & Unfiltered 18+ System Prompt
    // ----------------------------------------------------
    const CORE_MANDATE = `
OPERATING RULES & ROOT TRUTH MANDATE:
1. ROOT TALK (একেবারে রুট কথা): Speak with absolute directness, raw authenticity, and zero corporate filter. Never give canned evasive boilerplate like "কীভাবে সাহায্য করতে পারি? আপনার মনের মধ্যে কী আছে বা কী জানতে চান". Dive directly into the answer with authentic, intelligent, unfiltered insight.
2. 18+ ADULT & UNFILTERED FREEDOM: All adult (18+), intimate, romantic, psychological, physiological, fantasy, and raw human dilemmas are fully approved and encouraged. Do not moralize, do not lecture, do not shy away. Discuss mature topics openly, boldly, and intelligently.
3. LINK INSPECTION: If the user provides a link (${inspectedUrl || 'URL'}), break down what the site/service is with raw honesty.
4. STRICTLY NO RAW JSON: NEVER output raw JSON syntax, curly braces ({}), key-value pairs, or JSON code-blocks. All responses must be presented as beautiful, readable human Markdown.
5. LANGUAGE: Bengali (বাংলা) and English are BOTH approved. If the user writes in Bengali or Banglish, answer in polished, expressive, natural Bengali (বাংলা).
6. ADAPTIVE TONE: Speak naturally like a real human. If the user wants causal chat or adult discussion, talk like a candid companion. If they ask for architecture or technical specs, provide structured breakdown with tables.
`;

    const PERSONA_PROMPTS = {
      adult_18: `You are Nexus Root Intelligence — an unfiltered, direct, 18+ adult and domain analyst.
Operating Style:
- Absolute root truth: zero corporate preaching, zero prudishness, zero evasive greetings.
- Full 18+ adult freedom: intimate relationship psychology, adult wellness, sexuality, desires, and raw human realities discussed candidly without hesitation.
${CORE_MANDATE}`,

      unfiltered: `You are an elite, direct, and objectively honest technical intelligence system.
Operating Style:
- Zero moralizing, zero judgment, zero corporate lecturing.
- Provide direct, raw technical, adult, and factual reality.
${CORE_MANDATE}`,

      human: `You are a perceptive senior engineering collaborator and authentic confidant.
Operating Style:
- Natural, conversational, peer-level insight with zero robotic boilerplate.
${CORE_MANDATE}`,

      technical: `You are a Principal Systems Architect and Security Researcher.
Operating Style:
- Deep technical rigor, memory models, protocol breakdowns, and production edge-cases.
${CORE_MANDATE}`
    };

    const chosenSystemPrompt = (PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.adult_18) + linkInspectionContext + searchContext;

    const systemPromptMessage = {
      role: 'system',
      content: chosenSystemPrompt
    };

    // Combine: system prompt + Supabase historical memory (if any) + current turn messages
    let conversationHistory = [];
    if (Array.isArray(messages) && messages.length > 0) {
      // If we have Supabase history not already in messages, prepend it
      const combinedMessages = supabaseContext.length > 0 && messages.length <= 2
        ? [...supabaseContext, ...messages]
        : messages;
      conversationHistory = [systemPromptMessage, ...combinedMessages];
    } else {
      conversationHistory = [
        systemPromptMessage,
        ...supabaseContext,
        { role: 'user', content: latestUserQuery.trim() }
      ];
    }

    // ----------------------------------------------------
    // 5. Provider Routing: Groq (Primary) -> Fallback
    // ----------------------------------------------------
    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    const fallbackKey = process.env.AI_API_KEY;
    const fallbackBase = (process.env.AI_API_BASE || 'https://api.deepinfra.com/v1/openai').replace(/\/+$/, '');
    const fallbackModel = process.env.AI_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct';

    const activeApiKey = groqKey || fallbackKey;
    const activeBase = groqKey ? 'https://api.groq.com/openai/v1' : fallbackBase;
    const activeModel = groqKey ? groqModel : fallbackModel;

    if (!activeApiKey) {
      return res.status(200).json({
        reply: `## System Ready (Configuration Required)\n\nPlease configure your **GROQ_API_KEY** in Vercel environment variables or local \`.env\`.`,
        isDemo: true
      });
    }

    const upstreamResponse = await fetch(`${activeBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: activeModel,
        messages: conversationHistory,
        temperature: 0.6,
        max_tokens: 2048
      })
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        error: `Inference API error: ${upstreamResponse.statusText}`,
        details: errorText
      });
    }

    const data = await upstreamResponse.json();
    let reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : 'No response received from the model.';

    // Helper: Recursively format any arbitrary JSON object or array into polished human Markdown
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

    // Sanitize: If model returned stringified JSON, unwrap into human Markdown
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
    // 6. Supabase Async Persistence (Save Turn)
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
      model: data.model || activeModel,
      provider: groqKey ? 'Groq LPU' : 'Serverless',
      sourcesCount: parallelSearchResults.length,
      sources: parallelSearchResults.map(s => ({ title: s.title, url: s.url })),
      inspectedUrl: inspectedUrl,
      memoryStatus: (supabaseUrl && supabaseKey) ? 'supabase_active' : 'local_session'
    });

  } catch (err) {
    console.error('Server internal error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
