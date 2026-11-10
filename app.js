document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chatForm');
  const userInput = document.getElementById('userInput');
  const dialogueContainer = document.getElementById('dialogueContainer');
  const chatWorkspace = document.getElementById('chatWorkspace');
  const heroCard = document.getElementById('heroCard');
  const typingPill = document.getElementById('typingPill');
  const typingLabel = document.getElementById('typingLabel');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const webSearchToggle = document.getElementById('webSearchToggle');
  const personaSelect = document.getElementById('personaSelect');
  const charCounter = document.getElementById('charCounter');
  const dynamicGreeting = document.getElementById('dynamicGreeting');
  const scenarioCards = document.querySelectorAll('.scenario-card');
  const soundToggleBtn = document.getElementById('soundToggleBtn');

  // Supabase Modal & Memory Elements
  const openSupabaseModalBtn = document.getElementById('openSupabaseModalBtn');
  const closeSupabaseModalBtn = document.getElementById('closeSupabaseModalBtn');
  const supabaseModal = document.getElementById('supabaseModal');
  const sbUrlInput = document.getElementById('sbUrlInput');
  const sbKeyInput = document.getElementById('sbKeyInput');
  const saveSupabaseBtn = document.getElementById('saveSupabaseBtn');
  const clearSupabaseBtn = document.getElementById('clearSupabaseBtn');
  const memoryStatusText = document.getElementById('memoryStatusText');

  let conversationHistory = [];
  let isSoundEnabled = true;

  // 1. Session ID for 3-Day Ephemeral Memory
  let sessionId = localStorage.getItem('nexus_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
    localStorage.setItem('nexus_session_id', sessionId);
  }

  // Update Supabase memory UI status
  function updateMemoryBadge() {
    const sbUrl = localStorage.getItem('nexus_supabase_url');
    const sbKey = localStorage.getItem('nexus_supabase_key');
    if (memoryStatusText) {
      if (sbUrl && sbKey) {
        memoryStatusText.textContent = '🟢 মেমোরি: Supabase (৩ দিনের অটো-পার্জ)';
      } else {
        memoryStatusText.textContent = '☁️ মেমোরি: লোকাল (Supabase যুক্ত করুন)';
      }
    }
  }
  updateMemoryBadge();

  if (openSupabaseModalBtn && supabaseModal) {
    openSupabaseModalBtn.addEventListener('click', () => {
      if (sbUrlInput) sbUrlInput.value = localStorage.getItem('nexus_supabase_url') || '';
      if (sbKeyInput) sbKeyInput.value = localStorage.getItem('nexus_supabase_key') || '';
      supabaseModal.style.display = 'flex';
    });
  }

  if (closeSupabaseModalBtn && supabaseModal) {
    closeSupabaseModalBtn.addEventListener('click', () => {
      supabaseModal.style.display = 'none';
    });
  }

  if (saveSupabaseBtn && supabaseModal) {
    saveSupabaseBtn.addEventListener('click', () => {
      const url = sbUrlInput ? sbUrlInput.value.trim() : '';
      const key = sbKeyInput ? sbKeyInput.value.trim() : '';
      if (url && key) {
        localStorage.setItem('nexus_supabase_url', url);
        localStorage.setItem('nexus_supabase_key', key);
        alert('✓ Supabase মেমোরি কনফিগারেশন সফলভাবে সেভ হয়েছে! ৩ দিনের অটো-পার্জ কার্যকর।');
      } else {
        localStorage.removeItem('nexus_supabase_url');
        localStorage.removeItem('nexus_supabase_key');
      }
      updateMemoryBadge();
      supabaseModal.style.display = 'none';
    });
  }

  if (clearSupabaseBtn && supabaseModal) {
    clearSupabaseBtn.addEventListener('click', () => {
      localStorage.removeItem('nexus_supabase_url');
      localStorage.removeItem('nexus_supabase_key');
      if (sbUrlInput) sbUrlInput.value = '';
      if (sbKeyInput) sbKeyInput.value = '';
      updateMemoryBadge();
      alert('Supabase ক্রেডেনশিয়াল মুছে ফেলা হয়েছে। এখন লোকাল সেশন মেমোরি চলবে।');
      supabaseModal.style.display = 'none';
    });
  }

  // 2. Web Audio API
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx && AudioContext) audioCtx = new AudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, type, duration, gainValue = 0.05) {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playSendSound() { playTone(587.33, 'sine', 0.12, 0.04); }
  function playReceiveSound() {
    setTimeout(() => playTone(659.25, 'sine', 0.1, 0.03), 0);
    setTimeout(() => playTone(880.00, 'sine', 0.15, 0.03), 80);
  }

  soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundToggleBtn.classList.toggle('active', isSoundEnabled);
    soundToggleBtn.querySelector('.sound-icon').textContent = isSoundEnabled ? '🔊' : '🔇';
  });

  // 3. Dynamic Human Greeting
  const hour = new Date().getHours();
  let greeting = 'শুভ সন্ধ্যা / Good evening.';
  if (hour >= 5 && hour < 12) {
    greeting = 'শুভ সকাল / Good morning.';
  } else if (hour >= 12 && hour < 18) {
    greeting = 'শুভ অপরাহ্ন / Good afternoon.';
  }
  if (dynamicGreeting) dynamicGreeting.textContent = greeting;

  // 4. Persona LocalStorage Persistence (Defaults to adult_18)
  const savedPersona = localStorage.getItem('nexus_persona');
  if (savedPersona && personaSelect) {
    personaSelect.value = savedPersona;
  } else if (personaSelect) {
    personaSelect.value = 'adult_18';
  }
  if (personaSelect) {
    personaSelect.addEventListener('change', () => {
      localStorage.setItem('nexus_persona', personaSelect.value);
    });
  }

  // 5. Marked Configuration
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // 6. Input Auto-Resize & Character Counter
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
    if (charCounter) charCounter.textContent = `${userInput.value.length} / 2000`;
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // 7. Scenario Cards Click
  scenarioCards.forEach(card => {
    card.addEventListener('click', () => {
      initAudio();
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        userInput.value = prompt;
        userInput.dispatchEvent(new Event('input'));
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // 8. Clear Conversation
  clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear the conversation?')) {
      conversationHistory = [];
      dialogueContainer.innerHTML = '';
      if (heroCard) heroCard.style.display = 'block';
    }
  });

  // 9. Export Conversation
  exportChatBtn.addEventListener('click', () => {
    if (conversationHistory.length === 0) {
      alert('No messages to export yet.');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let mdContent = `# Nexus Transcript - ${new Date().toLocaleString()}\n\n---\n\n`;
    conversationHistory.forEach(item => {
      const speaker = item.role === 'user' ? '### User' : '### Nexus';
      mdContent += `${speaker}\n\n${item.content}\n\n---\n\n`;
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `nexus-chat-${timestamp}.md`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  });

  // Helper: Deep convert JSON objects or arrays into human Markdown
  function formatJsonToHumanMarkdown(data) {
    if (typeof data !== 'object' || data === null) {
      return String(data);
    }
    if (typeof data.reply === 'string') return data.reply;
    if (typeof data.content === 'string') return data.content;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.answer === 'string') return data.answer;
    if (typeof data.text === 'string') return data.text;
    if (typeof data.response === 'string') return data.response;

    if (Array.isArray(data)) {
      return data.map((item, idx) => {
        if (typeof item === 'object') {
          return `#### আইটেম ${idx + 1}\n` + formatJsonToHumanMarkdown(item);
        }
        return `- ${item}`;
      }).join('\n\n');
    }

    return Object.entries(data).map(([key, val]) => {
      const title = key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim();
      const formattedTitle = title.charAt(0).toUpperCase() + title.slice(1);
      if (typeof val === 'object' && val !== null) {
        return `### ${formattedTitle}\n${formatJsonToHumanMarkdown(val)}`;
      }
      return `### ${formattedTitle}\n${val}`;
    }).join('\n\n');
  }

  // 10. Form Submit: Link Check + Parallel Grounding + Supabase Sync
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    initAudio();
    playSendSound();

    const isWebSearch = webSearchToggle ? webSearchToggle.checked : true;
    const persona = personaSelect ? personaSelect.value : 'adult_18';
    const hasUrl = /(https?:\/\/[^\s]+)/i.test(text);

    if (heroCard) heroCard.style.display = 'none';

    // Append User Message
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    // Reset Input
    userInput.value = '';
    userInput.style.height = 'auto';
    if (charCounter) charCounter.textContent = '0 / 2000';

    // Show Typing Indicator based on intent
    if (typingLabel) {
      if (hasUrl) {
        typingLabel.textContent = '🔍 লিংক ডোমেন পরীক্ষা ও রুট অ্যানালাইসিস চলছে...';
      } else if (isWebSearch) {
        typingLabel.textContent = 'Parallel ডোমেন সার্চ ও Groq NLP প্রসেসিং চলছে...';
      } else {
        typingLabel.textContent = 'Groq LPU প্রসেসিং চলছে...';
      }
    }
    showTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          webSearch: isWebSearch,
          persona: persona,
          sessionId: sessionId,
          supabaseUrl: localStorage.getItem('nexus_supabase_url') || '',
          supabaseKey: localStorage.getItem('nexus_supabase_key') || ''
        })
      });

      // Parse JSON from API response
      const data = await response.json();
      showTyping(false);

      if (!response.ok) {
        const errorMsg = data.details || data.error || 'Server error occurred.';
        appendMessage('ai', `⚠️ **ত্রুটি (Error):** ${errorMsg}`);
        return;
      }

      playReceiveSound();

      if (data.memoryStatus === 'supabase_active' && memoryStatusText) {
        memoryStatusText.textContent = '🟢 মেমোরি: Supabase (৩ দিনের অটো-পার্জ)';
      }

      // Ensure JSON is NEVER displayed raw to the user
      let humanFormattedReply = data.reply || 'কোনো উত্তর পাওয়া যায়নি।';
      
      // Clean stringified JSON if present (either raw JSON or code-fenced JSON)
      if (typeof humanFormattedReply === 'string') {
        let cleanText = humanFormattedReply.trim();
        if (cleanText.startsWith('```json') && cleanText.endsWith('```')) {
          cleanText = cleanText.slice(7, -3).trim();
        } else if (cleanText.startsWith('```') && cleanText.endsWith('```')) {
          cleanText = cleanText.slice(3, -3).trim();
        }

        if ((cleanText.startsWith('{') && cleanText.endsWith('}')) || (cleanText.startsWith('[') && cleanText.endsWith(']'))) {
          try {
            const parsed = JSON.parse(cleanText);
            humanFormattedReply = formatJsonToHumanMarkdown(parsed);
          } catch (e) {}
        }
      }

      // Append clean human message with interactive sources tray & inspected link
      appendMessage('ai', humanFormattedReply, data.sources, data.inspectedUrl);
      conversationHistory.push({ role: 'assistant', content: humanFormattedReply });

    } catch (err) {
      showTyping(false);
      appendMessage('ai', `⚠️ **সংযোগ ত্রুটি (Connection Error):** ব্যাকএন্ডের সাথে সংযোগ স্থাপন সম্ভব হয়নি (${err.message})।`);
    }
  });

  function appendMessage(role, content, sources = [], inspectedUrl = null) {
    const row = document.createElement('div');
    row.className = `dialogue-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'dialogue-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'N';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'dialogue-content';

    const bubble = document.createElement('div');
    bubble.className = 'dialogue-bubble';

    if (role === 'ai') {
      if (window.marked) {
        bubble.innerHTML = marked.parse(content);
      } else {
        bubble.textContent = content;
      }

      if (window.hljs) {
        bubble.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
    } else {
      bubble.textContent = content;
    }

    contentWrapper.appendChild(bubble);

    // If a specific link was inspected, render an Inspected Link Badge
    if (role === 'ai' && inspectedUrl) {
      const linkBadge = document.createElement('div');
      linkBadge.className = 'sources-tray';
      linkBadge.innerHTML = `
        <div class="sources-tray-header">
          <span>🔍 পরীক্ষিত লিংক (Live Inspected Link):</span>
        </div>
        <div class="source-pills-list">
          <a class="source-pill" href="${inspectedUrl}" target="_blank" rel="noopener noreferrer">
            <span class="source-num">🔗</span> <span class="source-title">${inspectedUrl.slice(0, 60)}</span> ↗
          </a>
        </div>
      `;
      contentWrapper.appendChild(linkBadge);
    }

    // If live sources exist from Parallel Search, render a clean Source Pills Tray
    if (role === 'ai' && Array.isArray(sources) && sources.length > 0) {
      const sourcesTray = document.createElement('div');
      sourcesTray.className = 'sources-tray';
      
      const trayHeader = document.createElement('div');
      trayHeader.className = 'sources-tray-header';
      trayHeader.innerHTML = `<span>🌐 যাচাইকৃত লাইভ উৎস (${sources.length})</span>`;
      sourcesTray.appendChild(trayHeader);

      const pillsList = document.createElement('div');
      pillsList.className = 'source-pills-list';

      sources.forEach((s, idx) => {
        const pill = document.createElement('a');
        pill.className = 'source-pill';
        pill.href = s.url;
        pill.target = '_blank';
        pill.rel = 'noopener noreferrer';
        pill.innerHTML = `<span class="source-num">${idx + 1}</span> <span class="source-title">${s.title || 'Source'}</span> ↗`;
        pillsList.appendChild(pill);
      });

      sourcesTray.appendChild(pillsList);
      contentWrapper.appendChild(sourcesTray);
    }

    // Message Actions Toolbar (Copy Button & Time)
    const actionsToolbar = document.createElement('div');
    actionsToolbar.className = 'message-actions';

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeSpan = document.createElement('span');
    timeSpan.textContent = timeString;
    actionsToolbar.appendChild(timeSpan);

    if (role === 'ai') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = `<span>📋 কপি করুন (Copy)</span>`;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.innerHTML = `<span>✓ কপি হয়েছে (Copied)</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<span>📋 কপি করুন (Copy)</span>`;
          }, 2000);
        });
      });
      actionsToolbar.appendChild(copyBtn);
    }

    contentWrapper.appendChild(actionsToolbar);
    row.appendChild(avatar);
    row.appendChild(contentWrapper);

    dialogueContainer.appendChild(row);
    scrollToBottom();
  }

  function showTyping(show) {
    if (typingPill) {
      typingPill.style.display = show ? 'inline-flex' : 'none';
      if (show) scrollToBottom();
    }
  }

  function scrollToBottom() {
    chatWorkspace.scrollTop = chatWorkspace.scrollHeight;
  }
});
