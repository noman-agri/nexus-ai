# Nexus - Humanized & Live Search AI Workspace

A bespoke, production-ready AI interface engineered to eliminate corporate robotic clichés ("As an AI...", "Certainly!", boilerplate apologies) and deliver authentic, senior-peer level technical reasoning, adaptive persona switching, and real-time web search citations.

---

## 🌟 Human-Centric Design Highlights

1. **Adaptive Persona Engine:**
   - `Natural & Conversational`: Speaks like a seasoned engineering partner over coffee. Direct, warm, and nuanced.
   - `Deep Architectural`: High-density technical trade-offs, code structures, and concrete systems design.
   - `Crisp & Decisive`: High-signal executive brevity (2-3 bullet points, zero fluff).
2. **Zero Default / Robotic Boilerplate:**
   - Strict anti-robotic system instructions preventing generic assistant speech.
   - Dynamic time-based natural greeting (*"Good morning / Good evening, partner"*).
3. **Real-time Web Search Grounding:**
   - Toggleable live web search.
   - Generates organic citations `[Source Title](URL)` with zero raw-dump clutter.
4. **Human-Centric UX:**
   - 📋 **One-Click Copy:** Every AI response has an instant copy button with visual feedback.
   - 💾 **Export to Markdown:** Instant export of the full dialogue history as a formatted `.md` file.
   - 📱 **Obsidian/Slate Theme:** Plus Jakarta Sans & JetBrains Mono typography, custom smooth scrollbars, pulsing status ring.
5. **Ultra Low-Cost Serverless Core:**
   - Free Vercel Serverless Hosting ($0).
   - Micro-cent API inference via DeepInfra / Perplexity Sonar / OpenRouter.

---

## 📁 Repository Structure

```text
ai-client-app/
├── api/
│   └── chat.js            # Humanized serverless inference engine with persona & search integration
├── public/
│   ├── index.html         # Bespoke human-centric UI with persona & search controls
│   ├── style.css          # Slate/Obsidian design system with smooth micro-interactions
│   └── app.js             # Dynamic greeting, markdown rendering, copy & export features
├── .env.example           # Environment template for live API keys
├── .gitignore             # Standard git exclusions
├── package.json           # Project manifest
├── README.md              # Documentation
├── server.js              # Zero-dependency local development preview server
└── vercel.json            # Vercel serverless routing definition
```

---

## 🚀 Running Locally (1-Step)

```powershell
cd C:\Users\pc\.gemini\antigravity\scratch\ai-client-app
node server.js
```
Open your browser at: **`http://localhost:3000`**

---

## 🌐 1-Click Vercel Deployment

1. Create a new repository on [GitHub](https://github.com) and upload this folder.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"** -> Import your repository.
3. (Optional) Add your API key in **Environment Variables**:
   - `AI_API_KEY`: Your DeepInfra or OpenRouter key.
   - `PERPLEXITY_API_KEY`: (Optional) For direct Perplexity Sonar web browsing.
4. Hit **Deploy**. Your app is live with a secure HTTPS URL!
