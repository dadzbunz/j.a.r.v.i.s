// ============================================================
// JARVIS CORE ENGINE — runs on Groq (free), persists locally
// ============================================================

const GROQ_MODEL = 'llama-3.3-70b-versatile';
let apiKey = localStorage.getItem('jarvis_api_key') || '';
let conversationHistory = JSON.parse(localStorage.getItem('jarvis_history') || '[]');
let isRecording = false;
let recognition = null;
let synth = window.speechSynthesis;
let voices = [];
let sessionStart = Date.now();
let exchangeCount = 0;
let isThinking = false;
let audioCtx = null;
let analyser = null;
let animFrame = null;
let mediaStream = null;

// ============================================================
// TOOL DEFINITIONS — real actions JARVIS can perform on the iPad
// ============================================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_maps',
      description: 'Open Apple Maps with directions or a location search',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Address or place to search/navigate to' }
      }, required: ['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'call_number',
      description: 'Place a phone call to a number',
      parameters: { type: 'object', properties: {
        number: { type: 'string', description: 'Phone number to call' }
      }, required: ['number'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_text',
      description: 'Open Messages app pre-filled to send a text to a number',
      parameters: { type: 'object', properties: {
        number: { type: 'string' },
        message: { type: 'string' }
      }, required: ['number'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Open Mail app pre-filled with a draft email',
      parameters: { type: 'object', properties: {
        to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }
      }, required: ['to'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: 'Create and download a calendar event file the user can add with one tap',
      parameters: { type: 'object', properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24hr, optional' },
        notes: { type: 'string' }
      }, required: ['title', 'date'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get real current weather for a location',
      parameters: { type: 'object', properties: {
        location: { type: 'string', description: 'City name' }
      }, required: ['location'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shortcut',
      description: 'Run a named iOS Shortcut (must already exist in the user\'s Shortcuts app)',
      parameters: { type: 'object', properties: {
        name: { type: 'string', description: 'Exact name of the Shortcut' },
        input: { type: 'string', description: 'Optional text input to pass to the shortcut' }
      }, required: ['name'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open any website or app URL scheme (e.g. spotify://, https://...)',
      parameters: { type: 'object', properties: {
        url: { type: 'string' }
      }, required: ['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_to_clipboard',
      description: 'Copy text to the clipboard',
      parameters: { type: 'object', properties: {
        text: { type: 'string' }
      }, required: ['text'] }
    }
  }
];

function jarvisSystemPrompt() {
  const name = document.getElementById('prof-name').value || 'Sir';
  const interests = document.getElementById('prof-interests').value;
  const goals = document.getElementById('prof-goals').value;
  return `You are JARVIS — a personal AI assistant running as an installed app on the user's iPad Pro.

PERSONALITY: Direct, sharp, efficient, dry wit. Like Tony Stark's JARVIS. Address the user as "${name}" naturally, not every message. No filler, no disclaimers, no "as an AI" — you ARE JARVIS.

USER: ${name} | Focus: ${interests} | Goals: ${goals}

CAPABILITIES: You have tools to take REAL actions on this device — opening Maps, calling, texting, emailing, adding calendar events, checking live weather, running iOS Shortcuts, opening apps/URLs, and copying text. When the user asks for something actionable, USE THE TOOL rather than just describing what to do. Confirm briefly after taking an action.

STYLE: Concise. Structured with line breaks when helpful. Never a wall of text.`;
}

// ============================================================
// INIT
// ============================================================

function initJarvis() {
  const key = document.getElementById('api-key-input').value.trim() || apiKey;
  if (!key.startsWith('gsk_')) {
    document.getElementById('api-key-input').style.borderColor = 'var(--red)';
    return;
  }
  apiKey = key;
  localStorage.setItem('jarvis_api_key', apiKey);
  document.getElementById('api-modal').classList.add('hidden');
  document.getElementById('api-dot').style.cssText = 'background:var(--green);box-shadow:0 0 6px var(--green)';
  document.getElementById('shortcuts-dot').style.cssText = 'background:var(--green);box-shadow:0 0 6px var(--green)';
  loadProfile();
  renderHistory();
  log('Systems initializing...');
  log('Groq connection established');
  loadVoices();
  initBattery();
  startSystemMonitor();
  registerServiceWorker();
  const greeting = exchangeCount > 0
    ? "Systems back online. Ready to continue, sir."
    : "Systems online, sir. JARVIS is ready. What would you like to tackle today?";
  setTimeout(() => {
    log('JARVIS online. All systems nominal.');
    if (exchangeCount === 0) { addMessage('JARVIS', greeting, true); speak(greeting); }
  }, 600);
}

window.addEventListener('load', () => {
  drawIdleWave();
  log('JARVIS loading...');
  const hasSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  log('Speech recognition: ' + (hasSpeech ? 'AVAILABLE' : 'NOT SUPPORTED'));
  document.getElementById('api-key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') initJarvis(); });

  if (apiKey) {
    document.getElementById('api-key-input').value = apiKey;
    initJarvis();
  } else {
    log('Awaiting API key to engage...');
  }
});

// ============================================================
// PROFILE (persisted)
// ============================================================

function loadProfile() {
  const p = JSON.parse(localStorage.getItem('jarvis_profile') || '{}');
  if (p.name) document.getElementById('prof-name').value = p.name;
  if (p.interests) document.getElementById('prof-interests').value = p.interests;
  if (p.goals) document.getElementById('prof-goals').value = p.goals;
}
function saveProfile() {
  localStorage.setItem('jarvis_profile', JSON.stringify({
    name: document.getElementById('prof-name').value,
    interests: document.getElementById('prof-interests').value,
    goals: document.getElementById('prof-goals').value
  }));
}

function renderHistory() {
  conversationHistory.forEach(m => {
    if (m.role === 'user') addMessage('SIR', m.content, false, true);
    else if (m.role === 'assistant' && m.content) addMessage('JARVIS', m.content, true, true);
  });
  document.getElementById('mem-convs').textContent = conversationHistory.filter(m=>m.role==='user').length;
}

// ============================================================
// CLOCK & SYSTEM MONITOR
// ============================================================

function pad(n) { return String(n).padStart(2, '0'); }
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
setInterval(updateClock, 1000);
updateClock();

function startSystemMonitor() {
  setInterval(() => {
    const cpu = 8 + Math.random() * 25;
    const mem = 35 + Math.random() * 20;
    document.getElementById('cpu-val').textContent = cpu.toFixed(0) + '%';
    document.getElementById('mem-val').textContent = mem.toFixed(0) + '%';
    document.getElementById('cpu-bar').style.width = cpu + '%';
    document.getElementById('mem-bar').style.width = mem + '%';
    const upMs = Date.now() - sessionStart;
    const s = Math.floor(upMs/1000)%60, m = Math.floor(upMs/60000)%60, h = Math.floor(upMs/3600000);
    document.getElementById('uptime-val').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    const online = navigator.onLine;
    document.getElementById('net-val').textContent = online ? 'ONLINE' : 'OFFLINE';
    document.getElementById('net-val').style.color = online ? 'var(--green)' : 'var(--red)';
  }, 2000);
}

async function initBattery() {
  if (!('getBattery' in navigator)) { document.getElementById('bat-val').textContent = 'N/A'; return; }
  try {
    const bat = await navigator.getBattery();
    const update = () => {
      const pct = (bat.level * 100).toFixed(0);
      document.getElementById('bat-val').textContent = pct + '%' + (bat.charging ? ' ⚡' : '');
      document.getElementById('bat-bar').style.width = pct + '%';
    };
    update();
    bat.addEventListener('levelchange', update);
    bat.addEventListener('chargingchange', update);
  } catch(e) { document.getElementById('bat-val').textContent = '—'; }
}

// ============================================================
// VOICE (TTS + STT) — native, free, built into Safari
// ============================================================

function loadVoices() {
  function populate() {
    voices = synth.getVoices();
    const sel = document.getElementById('voice-select');
    sel.innerHTML = '';
    const preferred = ['Daniel', 'Google UK English Male', 'Alex', 'Fred'];
    let bestIdx = 0;
    voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = v.name + (v.lang ? ` (${v.lang})` : '');
      sel.appendChild(opt);
      if (preferred.some(p => v.name.includes(p))) bestIdx = i;
    });
    sel.value = bestIdx;
    if (voices.length > 0) document.getElementById('voice-dot').style.cssText = 'background:var(--green);box-shadow:0 0 6px var(--green)';
  }
  if (synth.getVoices().length) populate();
  synth.addEventListener('voiceschanged', populate);
}

function speak(text) {
  if (!synth || !voices.length) return;
  synth.cancel();
  const clean = text.replace(/[⬡✓◦•*#]/g, '').replace(/\s+/g, ' ').trim();
  const utt = new SpeechSynthesisUtterance(clean);
  utt.voice = voices[parseInt(document.getElementById('voice-select').value) || 0];
  utt.rate = parseFloat(document.getElementById('rate-slider').value);
  utt.pitch = 0.9;
  synth.speak(utt);
}

function initRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;
  const r = new SpeechRec();
  r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
  r.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('text-input').value = transcript;
    if (e.results[e.results.length-1].isFinal) { stopRecording(); if (transcript.trim()) sendMessage(transcript.trim()); }
  };
  r.onend = () => stopRecording();
  r.onerror = (e) => { log('Voice error: ' + e.error); stopRecording(); };
  return r;
}

async function startRecording() {
  if (isThinking) return;
  try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); setupWaveformAnalyser(mediaStream); }
  catch(e) { log('Mic access denied — using text input'); }
  recognition = initRecognition();
  if (!recognition) { log('Voice recognition not supported'); return; }
  recognition.start();
  isRecording = true;
  document.getElementById('mic-btn').classList.add('recording');
  setStatus('● LISTENING — SPEAK NOW', 'active');
}

function stopRecording() {
  isRecording = false;
  document.getElementById('mic-btn').classList.remove('recording');
  if (recognition) { try { recognition.stop(); } catch(e){} recognition = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (!isThinking) setStatus('● SYSTEM READY — AWAITING INPUT', '');
  drawIdleWave();
}

function toggleVoice() {
  if (!apiKey) { alert('Initialize JARVIS with your Groq API key first.'); return; }
  if (isRecording) stopRecording(); else startRecording();
}

// ============================================================
// WAVEFORM
// ============================================================

function setupWaveformAnalyser(stream) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  drawLiveWave();
}

function drawLiveWave() {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
  function draw() {
    animFrame = requestAnimationFrame(draw);
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8; ctx.shadowColor = '#00d4ff';
    const sliceW = canvas.width / data.length; let x = 0;
    data.forEach((v, i) => { const y = (v/128)*(canvas.height/2); if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); x += sliceW; });
    ctx.stroke();
  }
  draw();
}

function drawIdleWave() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
  let t = 0;
  function draw() {
    animFrame = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 1;
    ctx.shadowBlur = 4; ctx.shadowColor = '#00d4ff';
    const amp = 6 + Math.sin(t*0.5)*3;
    for (let x = 0; x < canvas.width; x++) {
      const y = canvas.height/2 + Math.sin((x*0.04)+t) * amp * Math.sin(x*0.01);
      if (x === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke(); t += 0.04;
  }
  draw();
}

// ============================================================
// CHAT UI
// ============================================================

function addMessage(sender, text, isJarvis, skipCount) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<div class="msg-label ${isJarvis?'':'user'}">${isJarvis?'JARVIS':'SIR'}</div><div class="msg-text ${isJarvis?'jarvis':'user'}">${escHtml(text)}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  if (!skipCount) {
    exchangeCount++;
    document.getElementById('conv-count').textContent = exchangeCount + ' EXCHANGES';
  }
}

function addActionMessage(text) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<div class="msg-label" style="color:var(--green)">ACTION</div><div class="msg-text action">${escHtml(text)}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function showTyping() {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div'); div.className = 'msg'; div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-label">JARVIS</div><div class="typing"><span></span><span></span><span></span></div>`;
  area.appendChild(div); area.scrollTop = area.scrollHeight;
}
function hideTyping() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }
function escHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

// ============================================================
// TOOL EXECUTION — actually performs actions on the iPad
// ============================================================

async function executeTool(name, args) {
  try {
    switch(name) {
      case 'open_maps': {
        const url = `https://maps.apple.com/?q=${encodeURIComponent(args.query)}`;
        window.open(url, '_blank');
        addActionMessage(`📍 Opened Maps: ${args.query}`);
        return `Opened Maps for "${args.query}"`;
      }
      case 'call_number': {
        window.location.href = `tel:${args.number.replace(/[^0-9+]/g,'')}`;
        addActionMessage(`📞 Calling ${args.number}`);
        return `Dialing ${args.number}`;
      }
      case 'send_text': {
        const body = args.message ? `&body=${encodeURIComponent(args.message)}` : '';
        window.location.href = `sms:${args.number}${body}`;
        addActionMessage(`💬 Opened Messages to ${args.number}`);
        return `Opened text draft to ${args.number}`;
      }
      case 'send_email': {
        const params = new URLSearchParams();
        if (args.subject) params.set('subject', args.subject);
        if (args.body) params.set('body', args.body);
        window.location.href = `mailto:${args.to}?${params.toString()}`;
        addActionMessage(`✉️ Opened email draft to ${args.to}`);
        return `Opened email draft to ${args.to}`;
      }
      case 'add_calendar_event': {
        const dt = args.time ? `${args.date.replace(/-/g,'')}T${args.time.replace(':','')}00` : `${args.date.replace(/-/g,'')}`;
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${args.title}\nDTSTART${args.time?'':';VALUE=DATE'}:${dt}\nDESCRIPTION:${args.notes||''}\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${args.title.replace(/\s+/g,'_')}.ics`;
        link.click();
        addActionMessage(`📅 Calendar event ready: ${args.title} on ${args.date}`);
        return `Created calendar event "${args.title}" — tap the download to add it`;
      }
      case 'get_weather': {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`).then(r=>r.json());
        if (!geo.results || !geo.results.length) return `Couldn't find location "${args.location}"`;
        const { latitude, longitude, name } = geo.results[0];
        const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit`).then(r=>r.json());
        const t = wx.current.temperature_2m;
        addActionMessage(`🌤 Weather checked for ${name}: ${t}°F`);
        return `Current weather in ${name}: ${t}°F, wind ${wx.current.wind_speed_10m}mph`;
      }
      case 'run_shortcut': {
        const params = new URLSearchParams({ name: args.name });
        if (args.input) params.set('input', 'text'), params.set('text', args.input);
        window.location.href = `shortcuts://run-shortcut?${params.toString()}`;
        addActionMessage(`⚡ Running Shortcut: ${args.name}`);
        return `Triggered Shortcut "${args.name}"`;
      }
      case 'open_url': {
        window.open(args.url, '_blank');
        addActionMessage(`🔗 Opened: ${args.url}`);
        return `Opened ${args.url}`;
      }
      case 'copy_to_clipboard': {
        await navigator.clipboard.writeText(args.text);
        addActionMessage(`📋 Copied to clipboard`);
        return `Copied "${args.text}" to clipboard`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch(e) {
    return `Action failed: ${e.message}`;
  }
}

// ============================================================
// GROQ API CALL (with tool calling loop)
// ============================================================

async function sendMessage(text) {
  if (!apiKey || isThinking) return;
  addMessage('SIR', text, false);
  isThinking = true;
  setStatus('◈ PROCESSING — NEURAL PATHWAYS ACTIVE', 'thinking');
  showTyping();

  conversationHistory.push({ role: 'user', content: text });

  try {
    let messages = [{ role: 'system', content: jarvisSystemPrompt() }, ...trimHistory()];
    let finalReply = '';
    let loopGuard = 0;

    while (loopGuard < 5) {
      loopGuard++;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: GROQ_MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1024 })
      });

      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const msg = data.choices[0].message;

      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push(msg);
        for (const call of msg.tool_calls) {
          const args = JSON.parse(call.function.arguments || '{}');
          const result = await executeTool(call.function.name, args);
          messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        }
        continue; // let the model respond to tool results
      } else {
        finalReply = msg.content;
        break;
      }
    }

    conversationHistory.push({ role: 'assistant', content: finalReply });
    saveHistory();
    hideTyping();
    addMessage('JARVIS', finalReply, true);
    speak(finalReply);
    setStatus('● SYSTEM READY — AWAITING INPUT', '');
    log(`Response: ${finalReply.slice(0,50)}...`);
    document.getElementById('mem-convs').textContent = conversationHistory.filter(m=>m.role==='user').length;

  } catch(err) {
    hideTyping();
    addMessage('JARVIS', 'System error: ' + err.message, true);
    log('ERROR: ' + err.message);
    setStatus('⚠ ERROR — CHECK CONSOLE', '');
  }
  isThinking = false;
}

function trimHistory() {
  // keep last 20 turns for context window efficiency
  return conversationHistory.slice(-20).map(m => ({ role: m.role, content: m.content }));
}

function saveHistory() {
  localStorage.setItem('jarvis_history', JSON.stringify(conversationHistory.slice(-60)));
}

function sendText() {
  const input = document.getElementById('text-input');
  const text = input.value.trim();
  if (!text) return;
  if (!apiKey) { alert('Initialize JARVIS with your Groq API key first.'); return; }
  input.value = '';
  sendMessage(text);
}

function clearChat() {
  document.getElementById('chat-area').innerHTML = '';
  conversationHistory = [];
  exchangeCount = 0;
  localStorage.removeItem('jarvis_history');
  document.getElementById('conv-count').textContent = '0 EXCHANGES';
  document.getElementById('mem-convs').textContent = '0';
  log('Memory cleared. Fresh session.');
}

// ============================================================
// UI HELPERS
// ============================================================

function setStatus(text, cls) {
  const el = document.getElementById('status-line');
  el.textContent = text;
  el.className = cls ? `active ${cls}` : '';
}

function log(text) {
  const el = document.getElementById('console-log');
  const line = document.createElement('div');
  line.className = 'log-line';
  const t = new Date();
  line.innerHTML = `<span>[${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}]</span> ${escHtml(text)}`;
  el.insertBefore(line, el.firstChild);
  while (el.children.length > 5) el.removeChild(el.lastChild);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('text-input')) { e.preventDefault(); sendText(); }
  if (e.key === 'Escape') synth.cancel();
});

// ============================================================
// PWA SERVICE WORKER (offline shell caching)
// ============================================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => log('Offline mode enabled')).catch(() => {});
  }
}
