// Vercel Serverless Function: api/chat.js (Groq Ultra-Fast Inference + Parallel Search + Strict Structural Prompting)
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
    const { messages, userMessage, webSearch = true, persona = 'unfiltered' } = req.body || {};

    const latestUserQuery = userMessage || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1].content : '');

    if (!latestUserQuery) {
      return res.status(400).json({ error: 'Missing user message.' });
    }

    // 1. Parallel Web Search Grounding (Read strictly from Environment)
    const parallelApiKey = process.env.PARALLEL_API_KEY;
    let searchContext = '';
    let parallelSearchResults = [];

    if (webSearch && parallelApiKey) {
      try {
        const searchRes = await fetch('https://api.parallel.ai/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${parallelApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            objective: `Retrieve verified web information and latest developments for: ${latestUserQuery}`,
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
              }).join('\n\n');
          }
        } else {
          console.warn('Parallel search returned non-ok status:', searchRes.status);
        }
      } catch (searchErr) {
        console.warn('Parallel search connection failed:', searchErr.message);
      }
    }

    // 2. Strict Structural Mandate & Persona Engine
    const STRUCTURAL_MANDATE = `
STRUCTURAL ARCHITECTURE RULES (MANDATORY FOR ALL REPLIES):
1. EXECUTIVE SUMMARY: Start with a crisp, 1-2 sentence core takeaway under a bold heading (##).
2. COMPARISON TABLE / MATRIX: Whenever comparing tools, architectures, trade-offs, or options, ALWAYS build a clean Markdown Table (| Column | Column |).
3. SYSTEMATIC BREAKDOWN: Divide the solution into numbered (1, 2, 3) or bulleted analytical pillars with bold descriptive subheadings (###).
4. CONCRETE CODE / EXAMPLES: Provide complete, syntax-highlighted code blocks or exact execution commands.
5. CLICKABLE CITATIONS: Integrate verified links [Source Title](URL) from Parallel Search.
6. ZERO FILLER: No preachy intros, no corporate lecturing ("As an AI...", "Certainly!"). Jump straight to Section 1.
`;

    const PERSONA_PROMPTS = {
      unfiltered: `You are an elite, direct, and objectively honest technical intelligence system.
Operating Style:
- Zero moralizing, zero judgment, zero corporate lecturing.
- Provide direct, raw technical and factual reality.
${STRUCTURAL_MANDATE}`,

      human: `You are a perceptive senior engineering collaborator and architect.
Operating Style:
- Natural, conversational, peer-level insight.
- Eliminate robotic boilerplate.
${STRUCTURAL_MANDATE}`,

      technical: `You are a Principal Systems Architect and Security Researcher.
Operating Style:
- Deep technical rigor, memory models, protocol breakdowns, and production edge-cases.
${STRUCTURAL_MANDATE}`,

      concise: `You are an executive technology advisor.
Operating Style:
- High signal, minimal words.
${STRUCTURAL_MANDATE}`
    };

    const chosenSystemPrompt = (PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.unfiltered) + searchContext;

    const systemPromptMessage = {
      role: 'system',
      content: chosenSystemPrompt
    };

    let conversationHistory = [];
    if (Array.isArray(messages) && messages.length > 0) {
      conversationHistory = [systemPromptMessage, ...messages];
    } else {
      conversationHistory = [
        systemPromptMessage,
        { role: 'user', content: latestUserQuery.trim() }
      ];
    }

    // 3. Provider Routing: Groq (Primary) -> Fallback (DeepInfra / OpenRouter)
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
        reply: `## System Ready (Configuration Required)\n\nPlease set your **GROQ_API_KEY** or **AI_API_KEY** in your Vercel Environment Variables or local \`.env\` file to activate live model inference.`,
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
        temperature: 0.5,
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
    const reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : 'No response received from the model.';

    return res.status(200).json({
      reply,
      model: data.model || activeModel,
      provider: groqKey ? 'Groq LPU' : 'Serverless',
      sourcesCount: parallelSearchResults.length,
      sources: parallelSearchResults.map(s => ({ title: s.title, url: s.url }))
    });

  } catch (err) {
    console.error('Server internal error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
