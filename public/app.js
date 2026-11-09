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

  let conversationHistory = [];
  let isSoundEnabled = true;

  // 1. Web Audio API Acoustic Feedback (Zero External MP3s Needed)
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx && AudioContext) {
      audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
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

  function playSendSound() {
    playTone(587.33, 'sine', 0.12, 0.04); // D5
  }

  function playReceiveSound() {
    setTimeout(() => playTone(659.25, 'sine', 0.1, 0.03), 0); // E5
    setTimeout(() => playTone(880.00, 'sine', 0.15, 0.03), 80); // A5
  }

  soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundToggleBtn.classList.toggle('active', isSoundEnabled);
    soundToggleBtn.querySelector('.sound-icon').textContent = isSoundEnabled ? '🔊' : '🔇';
  });

  // 2. Dynamic Human Greeting
  const hour = new Date().getHours();
  let greeting = 'Good evening, creator.';
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning, creator.';
  } else if (hour >= 12 && hour < 18) {
    greeting = 'Good afternoon, creator.';
  }
  if (dynamicGreeting) {
    dynamicGreeting.textContent = greeting;
  }

  // 3. Persona LocalStorage Persistence
  const savedPersona = localStorage.getItem('nexus_persona');
  if (savedPersona && personaSelect) {
    personaSelect.value = savedPersona;
  }
  if (personaSelect) {
    personaSelect.addEventListener('change', () => {
      localStorage.setItem('nexus_persona', personaSelect.value);
    });
  }

  // 4. Marked Configuration
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // 5. Input Auto-Resize & Character Counter
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
    if (charCounter) {
      charCounter.textContent = `${userInput.value.length} / 2000`;
    }
  });

  // Enter to send, Shift+Enter for new line
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // 6. Scenario Cards Click
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

  // 7. Clear Conversation
  clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear the conversation?')) {
      conversationHistory = [];
      dialogueContainer.innerHTML = '';
      if (heroCard) heroCard.style.display = 'block';
    }
  });

  // 8. Export Conversation as Markdown
  exportChatBtn.addEventListener('click', () => {
    if (conversationHistory.length === 0) {
      alert('No messages to export yet.');
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let mdContent = `# Nexus Vibe Intelligence Transcript - ${new Date().toLocaleString()}\n\n---\n\n`;
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

  // 9. Form Submit
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    initAudio();
    playSendSound();

    const isWebSearch = webSearchToggle ? webSearchToggle.checked : true;
    const persona = personaSelect ? personaSelect.value : 'human';

    if (heroCard) {
      heroCard.style.display = 'none';
    }

    // Append User Message
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    // Reset Input
    userInput.value = '';
    userInput.style.height = 'auto';
    if (charCounter) charCounter.textContent = '0 / 2000';

    // Show Typing Indicator
    if (typingLabel) {
      typingLabel.textContent = isWebSearch
        ? 'Browsing live web & formulating answer...'
        : 'Formulating humanized response...';
    }
    showTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          webSearch: isWebSearch,
          persona: persona
        })
      });

      const data = await response.json();
      showTyping(false);

      if (!response.ok) {
        const errorMsg = data.details || data.error || 'Server error occurred.';
        appendMessage('ai', `⚠️ **Error:** ${errorMsg}`);
        return;
      }

      playReceiveSound();
      const aiReply = data.reply || 'No response generated.';
      appendMessage('ai', aiReply);
      conversationHistory.push({ role: 'assistant', content: aiReply });

    } catch (err) {
      showTyping(false);
      appendMessage('ai', `⚠️ **Connection Error:** Could not connect to backend (${err.message}).`);
    }
  });

  function appendMessage(role, content) {
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
      copyBtn.innerHTML = `<span>📋 Copy</span>`;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.innerHTML = `<span>✓ Copied</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<span>📋 Copy</span>`;
          }, 2000);
        });
      });
      actionsToolbar.appendChild(copyBtn);
    }

    contentWrapper.appendChild(bubble);
    contentWrapper.appendChild(actionsToolbar);

    row.appendChild(avatar);
    row.appendChild(contentWrapper);
    dialogueContainer.appendChild(row);

    scrollToBottom();
  }

  function showTyping(state) {
    if (state) {
      typingPill.classList.add('active');
    } else {
      typingPill.classList.remove('active');
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    chatWorkspace.scrollTop = chatWorkspace.scrollHeight;
  }
});
