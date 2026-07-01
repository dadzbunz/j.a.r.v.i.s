# J.A.R.V.I.S — Personal AI Assistant

A free, installable AI assistant with voice, memory, and real device actions — built to run entirely on your iPad Pro.

## What this actually is (read this first)

iOS doesn't let web apps run in the background or control other apps directly — no app can, that's Apple's sandbox, not a limitation of this build. What you *can* have, and what this is:

- A real installed app icon on your home screen (via "Add to Home Screen")
- Full-screen, no browser chrome, works like a native app
- Voice in/out, persistent memory, and a brain (Groq, free)
- The ability to **trigger real actions**: open Maps with directions, call/text a number, draft an email, add a calendar event, check live weather, open any app, and run iOS Shortcuts (which *can* do almost anything — control HomeKit, run automations, etc.)

That last one — Shortcuts — is your escape hatch to true "control everything." Ask JARVIS to run a Shortcut by name and it will.

---

## Step 1 — Get a free Groq API key (30 seconds, no credit card)

1. Go to **console.groq.com/keys**
2. Sign up, click "Create API Key"
3. Copy it — starts with `gsk_...`

Groq's free tier is generous (14,400 requests/day on Llama 3.3 70B as of writing) and fast. No cost.

## Step 2 — Deploy (pick one)

### Option A: GitHub Pages (recommended — permanent, free, real URL)

1. Create a new GitHub repo (e.g. `jarvis`)
2. Upload all files in this folder: `index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `icon.png`
3. Go to repo **Settings → Pages** → Source: `main` branch, `/root` → Save
4. Wait ~1 minute. Your app is live at `https://yourusername.github.io/jarvis/`

You can do all of this from the GitHub iOS app or github.com in Safari — no computer needed.

### Option B: Replit

1. Go to replit.com → Create → **HTML/CSS/JS** template
2. Delete the default files, upload these 6 files
3. Click **Run** — Replit gives you a live URL
4. For it to stay live 24/7 you may need to enable "Always On" (paid tier) — otherwise it sleeps when idle but wakes on visit, which is fine for personal use

## Step 3 — Install on your iPad

1. Open your deployed URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share** button → **Add to Home Screen**
3. Launch JARVIS from your home screen — it opens full-screen, no browser bars
4. Enter your Groq key once — it's saved locally on-device from then on

---

## Setting up Shortcuts (the real "control everything" layer)

1. Open the **Shortcuts** app on your iPad
2. Create shortcuts for things you want JARVIS to trigger — e.g. "Good Morning" (turns on lights, reads calendar), "Focus Mode," "Send Location to Mom"
3. Tell JARVIS: *"Run my Good Morning shortcut"* — it'll fire `shortcuts://run-shortcut?name=Good%20Morning`

This is how you extend JARVIS into HomeKit, Health data, Reminders, or literally any app that exposes a Shortcuts action — without needing a paid API.

---

## What's stored where

- **API key** — `localStorage`, this device only, never leaves except to call Groq's API directly
- **Conversation memory** — `localStorage`, persists across app launches, last 60 messages
- **Your profile** (name/interests/goals) — editable in the right panel, persists locally

Nothing touches a server you don't control. No account, no cloud database, no tracking.

---

## Roadmap for when you get a Mac / paid tier later

| Phase | Upgrade | Trigger |
|---|---|---|
| Now | Groq free tier, browser voice, local storage | ✅ done |
| Next | Supabase free tier for cross-device memory sync | when you want JARVIS on iPhone + iPad synced |
| Later | Self-hosted backend (Cloudflare Workers, free tier) for real web search | when Shortcuts-based search isn't enough |
| Later | Local LLM via Ollama on a Mac, iPad as thin client | when you have a machine to run inference on |
| Later | Home Assistant integration for real smart home control | if you get smart home devices |

Nothing here requires starting over — this architecture just gets better hardware behind it.
