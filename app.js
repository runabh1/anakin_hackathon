/* ======================================================
   First Gen Navigator — app.js
   Features:
     · Multi-step form with validation
     · Dual mode: blocking (local) + polling (Vercel)
     · Animated loading with step progression
     · Scholarship tracker with "Applied" checkboxes
     · Budget vs scholarship calculator
     · Document checklist (localStorage persistent)
     · SOP copy + enhanced text
     · Read aloud (Web Speech API)
     · PDF print
     · Web Share API / clipboard fallback
     · Toast notifications
     · Progress tracking saved to localStorage
====================================================== */

// ─── Runtime detection ────────────────────────────────────────────────────────
// On Vercel: hostname ends with .vercel.app or VERCEL env var is set.
// We detect by probing /api/start — if it exists, use polling mode.
// On local: use /api/navigator (single blocking call).
const IS_VERCEL = !window.location.hostname.includes("127.0.0.1") &&
                  !window.location.hostname.includes("localhost");

// ─── DOM refs ────────────────────────────────────────────────────────────────
const form        = document.getElementById("navigator-form");
const output      = document.getElementById("output");
const statusDot   = document.getElementById("status-dot");
const statusText  = document.getElementById("status-text");
const statusActions = document.getElementById("status-actions");
const loadingState  = document.getElementById("loading-state");
const submitBtn   = document.getElementById("submit-btn");
const toastEl     = document.getElementById("toast");
const demoBtn     = document.getElementById("load-demo");

const apiBase = (window.location.protocol === "file:")
  ? "http://127.0.0.1:3000"
  : "";

// ─── State ───────────────────────────────────────────────────────────────────
let currentSop = "";
let isSpeaking = false;
let appliedScholarships = JSON.parse(localStorage.getItem("fgn_applied") || "{}");
let checkedDocs         = JSON.parse(localStorage.getItem("fgn_docs")    || "{}");
let lastPayload         = null;

// ─── Step navigation ──────────────────────────────────────────────────────────
function goStep(n) {
  // validate current step before going forward
  const cur = document.querySelector(".form-step.active");
  const curIdx = parseInt(cur.id.replace("step-", ""));
  if (n > curIdx && !validateStep(curIdx)) return;

  document.querySelectorAll(".form-step").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".step").forEach((s, i) => {
    s.classList.remove("active", "done");
    if (i + 1 < n) s.classList.add("done");
    if (i + 1 === n) s.classList.add("active");
  });
  document.getElementById(`step-${n}`).classList.add("active");
}
// expose globally for inline onclick
window.goStep = goStep;

function validateStep(n) {
  const step = document.getElementById(`step-${n}`);
  const required = step.querySelectorAll("[required]");
  let ok = true;
  required.forEach(el => {
    if (!el.value.trim()) {
      el.focus();
      el.style.borderColor = "#f43f5e";
      el.style.boxShadow   = "0 0 0 3px rgba(244,63,94,0.15)";
      setTimeout(() => { el.style.borderColor = ""; el.style.boxShadow = ""; }, 1500);
      ok = false;
    }
  });
  if (!ok) showToast("⚠️ Please fill in the required fields first.");
  return ok;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
demoBtn.addEventListener("click", () => {
  const demo = {
    name: "Asha Kumar", grade: "Class 12", marks: "86%",
    stream: "PCM with Computer Science", location: "Ranchi, Jharkhand",
    income: "Rs. 1.8 lakh", category: "OBC", gender: "Female",
    interests: "coding, robotics, helping younger students",
    career: "software engineer",
    preferredLocation: "Jharkhand, West Bengal, Delhi NCR",
    budget: "Under Rs. 1 lakh per year",
    exams: "JEE Main, CUET", jee: "92 percentile", neet: "",
    examYear: "2026", attempt: "First attempt", board: "CBSE",
    story: "My parents never went to college. My mother works in a brick kiln and my father drives an auto. I want to be the first engineer in my family.",
  };
  Object.entries(demo).forEach(([k, v]) => {
    const el = form.elements[k];
    if (el) el.value = v;
  });
  goStep(1);
  showToast("✅ Demo profile loaded — click 'Build my roadmap' on step 3");
});

// ─── Form submit ──────────────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStep(3)) return;

  const profile = Object.fromEntries(new FormData(form).entries());
  await buildRoadmap(profile);
});

async function buildRoadmap(profile) {
  // UI: loading state
  setStatus("pending", "🔍 Searching live scholarship and college data…");
  output.className = "output";
  output.innerHTML = "";
  output.style.display = "none";
  loadingState.style.display = "flex";
  statusActions.style.display = "none";
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-text">⏳ Building…</span>';

  activateLoaderStep(0);

  try {
    let payload;
    if (IS_VERCEL) {
      payload = await buildRoadmapVercel(profile);
    } else {
      payload = await buildRoadmapLocal(profile);
    }
    lastPayload = payload;
    renderRoadmap(payload);
  } catch (err) {
    const local = err.message === "Failed to fetch";
    const msg = local
      ? "Cannot reach the backend. Make sure the server is running at http://127.0.0.1:3000 (run start.bat)."
      : err.message;
    setStatus("fallback", "❌ " + msg);
    output.style.display = "";
    output.className = "output empty";
    output.innerHTML = `<div class="empty-state"><div class="empty-icon">😞</div><h2>Could not build roadmap</h2><p>${escapeHtml(msg)}</p></div>`;
    loadingState.style.display = "none";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="btn-text">🚀 Build my roadmap</span>';
  }
}

// ─── Local mode (blocking, single call) ──────────────────────────────────────
async function buildRoadmapLocal(profile) {
  // Animate loader steps based on time estimates
  const delays = [0, 4000, 14000, 52000];
  delays.forEach((d, i) => setTimeout(() => activateLoaderStep(i), d));

  const res = await fetch(`${apiBase}/api/navigator`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(profile),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Backend error");
  return payload;
}

// ─── Vercel polling mode ─────────────────────────────────────────────────────
// Step 1: POST /api/start  → returns { scraperJobIds, agenticJobId, profile }
// Step 2: POST /api/check  → poll every 6s until { done: true, ...result }
async function buildRoadmapVercel(profile) {
  activateLoaderStep(0);

  // Submit jobs
  const startRes = await fetch(`${apiBase}/api/start`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(profile),
  });
  const startData = await startRes.json();
  if (!startRes.ok) throw new Error(startData.error || "Failed to start jobs");

  const { scraperJobIds, agenticJobId } = startData;
  activateLoaderStep(1);
  setStatus("pending", `⏳ Jobs submitted — polling for results…`);

  // Poll loop — max 40 rounds × 6s = 4 minutes
  const MAX_POLLS = 40;
  for (let round = 0; round < MAX_POLLS; round++) {
    await delay(6000);

    // Advance loader animation
    if (round === 3)  activateLoaderStep(2);
    if (round === 10) activateLoaderStep(3);

    const checkRes = await fetch(`${apiBase}/api/check`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ scraperJobIds, agenticJobId, profile }),
    });
    const checkData = await checkRes.json();
    if (!checkRes.ok) throw new Error(checkData.error || "Poll request failed");

    if (checkData.done) return checkData;

    // Update status with live progress
    const as = checkData.agenticStatus || "running";
    const ss = (checkData.scraperStatus || []).join(", ") || "running";
    setStatus("pending", `⏳ Scraper: ${ss} · Research: ${as} (${round + 1}/${MAX_POLLS})`);
  }

  throw new Error("Timed out waiting for AI results. Try again — Anakin's research pipeline takes 1–5 minutes.");
}

// ─── Loader step animator ─────────────────────────────────────────────────────
let _currentLoaderStep = -1;
function activateLoaderStep(index) {
  if (index <= _currentLoaderStep) return;
  _currentLoaderStep = index;
  const stepIds = ["ls-1", "ls-2", "ls-3", "ls-4"];
  stepIds.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (i < index) {
      el.classList.remove("active"); el.classList.add("done");
      if (!el.textContent.startsWith("✓")) el.textContent = "✓ " + el.textContent.slice(2);
    } else if (i === index) {
      el.classList.add("active"); el.classList.remove("done");
    }
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Render ───────────────────────────────────────────────────────────────────
function renderRoadmap(payload) {
  const { profile, result, sources } = payload;

  loadingState.style.display = "none";
  output.style.display = "";
  output.className = "output";

  const live = sources.live;
  setStatus(
    live ? "live" : "fallback",
    live
      ? "✅ Live AI data — Anakin URL Scraper + Agentic Search pipeline"
      : "⚠️ Backend responded, but live extraction was partial. Showing curated fallback data."
  );
  statusActions.style.display = "flex";
  document.getElementById("btn-copy-sop").style.display = "inline-flex";
  currentSop = result.sop;

  // Budget calc
  const budgetInfo = calcBudget(profile, result);

  output.innerHTML = `
    <div class="roadmap-content" id="roadmap-root">

      <!-- Print header (hidden on screen) -->
      <div class="print-header">
        <h1 style="font-size:1.4rem;font-weight:900;color:#0d9488;margin-bottom:4px">First Gen Navigator</h1>
        <p style="font-size:0.85rem;color:#555">Roadmap for ${escapeHtml(profile.name || "Student")} · Generated ${new Date().toLocaleDateString("en-IN")}</p>
      </div>

      <div class="live-badge">${live ? "LIVE AI DATA" : "CURATED FALLBACK"}</div>

      <!-- Progress tracker -->
      <div class="progress-section">
        <div class="progress-label">
          <span>🎯 Overall Readiness</span>
          <span id="progress-pct">0%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
      </div>

      <!-- 1. Colleges -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon teal">🏫</div>
          <span class="section-title">College Matches</span>
          <span class="section-count">${result.colleges.length} found</span>
        </div>
        <ul class="item-list">
          ${result.colleges.map((c, i) => renderCollegeCard(c, i)).join("")}
        </ul>
      </div>

      <!-- 2. Scholarships -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon gold">🏆</div>
          <span class="section-title">Scholarships You Can Win Right Now</span>
          <span class="section-count">${result.scholarships.length} found</span>
        </div>
        <ul class="item-list">
          ${result.scholarships.map((s, i) => renderScholarshipCard(s, i)).join("")}
        </ul>
      </div>

      <!-- 3. Budget calculator -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon gold">📊</div>
          <span class="section-title">Budget vs Scholarship Calculator</span>
        </div>
        ${renderBudgetCalc(budgetInfo)}
      </div>

      <!-- 4. Document checklist -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon purple">📋</div>
          <span class="section-title">Document Checklist</span>
          <span class="section-count" id="doc-count">0 / 12</span>
        </div>
        ${renderDocChecklist(profile)}
      </div>

      <!-- 5. SOP -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon purple">✍️</div>
          <span class="section-title">Your SOP Opening Paragraph</span>
        </div>
        <div class="sop-block">
          <span class="sop-quote-icon">"</span>
          <div id="sop-text">${escapeHtml(result.sop)}</div>
        </div>
        <div class="sop-actions" style="margin-top:10px">
          <button class="btn-ghost" onclick="copySop()" style="font-size:0.8rem;padding:7px 14px">📋 Copy SOP</button>
          <button class="btn-ghost" onclick="toggleSpeak()" style="font-size:0.8rem;padding:7px 14px">🔊 Read aloud</button>
        </div>
      </div>

      <!-- 6. Action plan -->
      <div class="result-section">
        <div class="section-header">
          <div class="section-icon blue">📅</div>
          <span class="section-title">Month-by-Month Action Plan</span>
        </div>
        <div class="timeline">
          ${result.plan.map((p, i) => renderTimelineItem(p, i)).join("")}
        </div>
      </div>

      <!-- Source note -->
      <div class="source-note">
        <strong>Data sources:</strong> ${escapeHtml(sources.summary || "Curated scholarship database")} ·
        Built for ${escapeHtml(profile.name || "this student")} on ${new Date().toLocaleDateString("en-IN")}
      </div>

    </div>
  `;

  // Animate progress bar
  setTimeout(() => updateProgress(), 300);
  setTimeout(() => animateBudgetBar(budgetInfo), 500);

  // Restore checkbox states
  restoreDocChecklist();
  updateDocCount();
}

// ─── College card ─────────────────────────────────────────────────────────────
function renderCollegeCard(c, i) {
  const name = escapeHtml(c.name || "College option");
  const reason = escapeHtml(c.reason || "Matches the student profile.");
  const fees   = c.fees   ? `<span class="chip chip-teal">💰 ${escapeHtml(String(c.fees))}</span>` : "";
  const cutoff = c.cutoff ? `<span class="chip chip-gold">📊 ${escapeHtml(String(c.cutoff))}</span>` : "";
  const source = c.source ? `<span class="chip chip-muted">🔗 ${escapeHtml(String(c.source).split("/")[2] || c.source)}</span>` : "";
  return `
    <li class="result-card" style="animation-delay:${i * 0.06}s">
      <div class="card-name">${name}</div>
      <div class="card-reason">${reason}</div>
      <div class="card-chips">${fees}${cutoff}${source}</div>
    </li>`;
}

// ─── Scholarship card with Apply tracker ──────────────────────────────────────
function renderScholarshipCard(s, i) {
  const id      = `sch-${i}`;
  const applied = appliedScholarships[id] ? "checked" : "";
  const name    = escapeHtml(s.name || "Scholarship option");
  const why     = escapeHtml(s.why  || "May match the student profile.");
  const amount  = s.amount   ? `<span class="chip chip-gold">💰 ${escapeHtml(String(s.amount))}</span>` : "";
  const deadline= s.deadline ? `<span class="chip chip-rose">⏰ ${escapeHtml(String(s.deadline))}</span>` : "";
  const elig    = s.eligibility ? `<span class="chip chip-purple">✅ ${escapeHtml(String(s.eligibility))}</span>` : "";
  const source  = s.source ? `<span class="chip chip-muted">🔗 ${escapeHtml(String(s.source).split("/")[2] || s.source)}</span>` : "";
  return `
    <li class="result-card" id="card-${id}" style="animation-delay:${i * 0.06}s">
      <div class="card-name">${name}</div>
      <div class="card-reason">${why}</div>
      <div class="card-chips">${amount}${deadline}${elig}${source}</div>
      <label class="apply-check ${applied}" onclick="toggleApplied('${id}', this)">
        <input type="checkbox" ${applied}/> ${applied ? "✓ Applied!" : "Mark as Applied"}
      </label>
    </li>`;
}

// ─── Apply tracker ────────────────────────────────────────────────────────────
function toggleApplied(id, labelEl) {
  const isNow = !labelEl.classList.contains("checked");
  labelEl.classList.toggle("checked", isNow);
  labelEl.innerHTML = `<input type="checkbox" ${isNow ? "checked" : ""}/>  ${isNow ? "✓ Applied!" : "Mark as Applied"}`;
  appliedScholarships[id] = isNow;
  localStorage.setItem("fgn_applied", JSON.stringify(appliedScholarships));
  showToast(isNow ? "🎉 Marked as applied! Keep going!" : "Unmarked.");
  updateProgress();
}
window.toggleApplied = toggleApplied;

// ─── Budget calculator ─────────────────────────────────────────────────────────
function calcBudget(profile, result) {
  // Try to extract numbers from income and budget strings
  const parseAmount = (s) => {
    if (!s) return 0;
    const m = String(s).match(/[\d,]+/g);
    if (!m) return 0;
    let n = parseInt(m.join("").replace(/,/g, ""));
    if (String(s).toLowerCase().includes("lakh")) n *= 100000;
    if (String(s).toLowerCase().includes("thousand")) n *= 1000;
    return n;
  };

  const income = parseAmount(profile.income) || 180000;
  const budget = parseAmount(profile.budget) || 100000;

  let totalScholarship = 0;
  result.scholarships.forEach(s => {
    const a = parseAmount(s.amount);
    if (a > 0) totalScholarship += a;
  });

  // Estimate college cost from first college if fees available
  let collegeCost = 80000; // default
  result.colleges.forEach(c => {
    const a = parseAmount(c.fees || c.fee || "");
    if (a > 0 && collegeCost === 80000) collegeCost = a;
  });

  const netCost = Math.max(0, collegeCost - Math.min(totalScholarship, collegeCost));
  const coverage = collegeCost > 0 ? Math.min(100, Math.round((Math.min(totalScholarship, collegeCost) / collegeCost) * 100)) : 0;

  return { income, budget, collegeCost, totalScholarship, netCost, coverage };
}

function renderBudgetCalc(b) {
  const fmt = n => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n / 1000).toFixed(0)}K`;
  const netColor = b.netCost <= b.budget ? "green" : "red";
  return `
    <div class="budget-calc">
      <div class="budget-row">
        <span class="budget-label">Estimated annual family income</span>
        <span class="budget-value">${fmt(b.income)}</span>
      </div>
      <div class="budget-row">
        <span class="budget-label">Your stated college budget</span>
        <span class="budget-value gold">${fmt(b.budget)}</span>
      </div>
      <div class="budget-row">
        <span class="budget-label">Estimated college fees (1st match)</span>
        <span class="budget-value">${fmt(b.collegeCost)}</span>
      </div>
      <div class="budget-row">
        <span class="budget-label">Total scholarships found</span>
        <span class="budget-value green">+ ${fmt(b.totalScholarship)}</span>
      </div>
      <div class="budget-row">
        <span class="budget-label" style="font-weight:800;color:#e2e8f0">Net cost after scholarships</span>
        <span class="budget-value ${netColor}" style="font-size:1rem">${fmt(b.netCost)}</span>
      </div>
      <div class="budget-bar-wrap">
        <div class="budget-bar-label">
          <span>Scholarship coverage</span>
          <span id="coverage-pct">${b.coverage}%</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" id="budget-bar" style="width:0"></div>
        </div>
      </div>
    </div>`;
}

function animateBudgetBar(b) {
  const bar = document.getElementById("budget-bar");
  if (bar) bar.style.width = b.coverage + "%";
}

// ─── Document checklist ────────────────────────────────────────────────────────
const DOCS = [
  "Aadhaar card (original + 2 copies)",
  "Class 10 marksheet",
  "Class 12 marksheet",
  "JEE / NEET scorecard",
  "Income certificate (< 3 months old)",
  "Caste / category certificate",
  "Domicile certificate",
  "Passport-size photographs (10+)",
  "Bank passbook (first page)",
  "School leaving certificate",
  "First-generation learner certificate",
  "Migration certificate",
];

function renderDocChecklist(profile) {
  return `<div class="doc-grid">${DOCS.map((doc, i) => {
    const id = `doc-${i}`;
    return `<div class="doc-item" id="${id}" onclick="toggleDoc('${id}', this)">
      <div class="doc-cb">✓</div>
      <span>${escapeHtml(doc)}</span>
    </div>`;
  }).join("")}</div>`;
}

function toggleDoc(id, el) {
  const isNow = !el.classList.contains("checked");
  el.classList.toggle("checked", isNow);
  checkedDocs[id] = isNow;
  localStorage.setItem("fgn_docs", JSON.stringify(checkedDocs));
  updateDocCount();
  updateProgress();
}
window.toggleDoc = toggleDoc;

function restoreDocChecklist() {
  Object.entries(checkedDocs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) el.classList.add("checked");
  });
}

function updateDocCount() {
  const total   = DOCS.length;
  const checked = document.querySelectorAll(".doc-item.checked").length;
  const el = document.getElementById("doc-count");
  if (el) el.textContent = `${checked} / ${total}`;
}

// ─── Timeline ──────────────────────────────────────────────────────────────────
function renderTimelineItem(p, i) {
  const dl = p.task.match(/Live deadline to watch: ([^.]+)/)?.[1] || "";
  const task = p.task.replace(/ Live deadline to watch:[^.]+\./, "").trim();
  return `
    <div class="timeline-item" style="animation-delay:${i * 0.05}s">
      <div class="month-badge">${escapeHtml(p.month)}</div>
      <div>
        <div class="timeline-task">${escapeHtml(task)}</div>
        ${dl ? `<div class="timeline-deadline">⏰ Deadline: ${escapeHtml(dl)}</div>` : ""}
      </div>
    </div>`;
}

// ─── Progress tracker ──────────────────────────────────────────────────────────
function updateProgress() {
  const docsTotal   = DOCS.length;
  const docsDone    = Object.values(checkedDocs).filter(Boolean).length;
  const appliedDone = Object.values(appliedScholarships).filter(Boolean).length;

  // Score: 50% docs, 50% applied scholarships (up to 5)
  const docScore  = docsTotal  > 0 ? (docsDone / docsTotal) * 50 : 0;
  const appScore  = Math.min(appliedDone, 5) / 5 * 50;
  const total     = Math.round(docScore + appScore);

  const fill = document.getElementById("progress-fill");
  const pct  = document.getElementById("progress-pct");
  if (fill) fill.style.width  = total + "%";
  if (pct)  pct.textContent   = total + "%";
}

// ─── SOP copy ──────────────────────────────────────────────────────────────────
function copySop() {
  if (!currentSop) return showToast("⚠️ Generate a roadmap first.");
  navigator.clipboard.writeText(currentSop)
    .then(() => showToast("📋 SOP copied to clipboard!"))
    .catch(() => showToast("❌ Could not copy — try manually selecting the text."));
}
window.copySop = copySop;

// ─── Read aloud ────────────────────────────────────────────────────────────────
function toggleSpeak() {
  if (!("speechSynthesis" in window)) return showToast("❌ Your browser doesn't support text-to-speech.");

  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    showToast("🔇 Stopped reading.");
    return;
  }

  const text = buildSpeechText();
  if (!text) return showToast("⚠️ Generate a roadmap first.");

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 0.92;
  utter.pitch = 1;
  utter.lang  = "en-IN";
  utter.onend = () => { isSpeaking = false; };
  window.speechSynthesis.speak(utter);
  isSpeaking = true;
  showToast("🔊 Reading your roadmap aloud…");
}
window.toggleSpeak = toggleSpeak;

function buildSpeechText() {
  if (!lastPayload) return "";
  const { result, profile } = lastPayload;
  const lines = [
    `Hello ${profile.name}. Here is your First Gen Navigator roadmap.`,
    "Top college matches.",
    ...result.colleges.map(c => `${c.name}. ${c.reason || ""}`),
    "Scholarships you can apply for right now.",
    ...result.scholarships.map(s => `${s.name}. Amount: ${s.amount || "varies"}. Deadline: ${s.deadline || "check portal"}.`),
    "Your Statement of Purpose opening.",
    result.sop,
    "Your action plan.",
    ...result.plan.map(p => `${p.month}. ${p.task}`),
  ];
  return lines.join(" ");
}

// ─── PDF / Print ───────────────────────────────────────────────────────────────
function downloadPdf() {
  if (!lastPayload) return showToast("⚠️ Generate a roadmap first.");
  showToast("🖨️ Opening print dialog — save as PDF…");
  setTimeout(() => window.print(), 400);
}
window.downloadPdf = downloadPdf;

// ─── Share ─────────────────────────────────────────────────────────────────────
async function shareRoadmap() {
  if (!lastPayload) return showToast("⚠️ Generate a roadmap first.");
  const { profile, result } = lastPayload;
  const text = [
    `🎓 First Gen Navigator Roadmap for ${profile.name}`,
    "",
    "🏫 Top College: " + (result.colleges[0]?.name || "See roadmap"),
    "🏆 Best Scholarship: " + (result.scholarships[0]?.name || "See roadmap"),
    "💰 Scholarship amount: " + (result.scholarships[0]?.amount || "varies"),
    "",
    "Built free at First Gen Navigator — AI roadmap for first-generation students.",
    window.location.href,
  ].join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ title: "My First Gen Navigator Roadmap", text });
      showToast("✅ Shared!");
      return;
    } catch {}
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    showToast("🔗 Roadmap summary copied to clipboard!");
  } catch {
    showToast("❌ Could not share — try copying manually.");
  }
}
window.shareRoadmap = shareRoadmap;

// ─── Status helper ─────────────────────────────────────────────────────────────
function setStatus(kind, message) {
  statusDot.className = `status-dot ${kind}`;
  statusText.textContent = message;
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

// ─── Utility ───────────────────────────────────────────────────────────────────
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
