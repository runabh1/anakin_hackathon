// ─── Shared core logic for both Vercel serverless functions and local server.js ───
// api/lib/core.js
//
// This file contains:
//   · apiFetch     — HTTP wrapper for Anakin API
//   · buildPrompt  — agentic search prompt builder
//   · scrapeTargets / chooseScrapeTargets
//   · normalizeLiveData / extractCollegesAndScholarships
//   · buildNavigatorResult — assembles the final response from extracted data
//   · fallback data
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_URL = "https://api.anakin.io/v1";

export const SCRAPE_TARGETS = [
  { name: "National Scholarship Portal", url: "https://scholarships.gov.in/" },
  { name: "Vidyasaarathi",               url: "https://www.vidyasaarathi.co.in/Vidyasaarathi/" },
  { name: "Buddy4Study",                 url: "https://www.buddy4study.com/scholarships?year=2026" },
  { name: "JoSAA",                       url: "https://josaa.nic.in/" },
  { name: "MCC",                         url: "https://mcc.nic.in/" },
];

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── HTTP ─────────────────────────────────────────────────────────────────────
export async function apiFetch(path, key, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  options.method || "GET",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body:    options.body ? JSON.stringify(options.body) : undefined,
      signal:  controller.signal,
    });
    const text = await res.text();
    const data = text ? safeJson(text) : {};
    if (!res.ok) throw new Error(data.message || data.error || `${res.status} ${res.statusText}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeJson(text) {
  try { return JSON.parse(text); } catch { return { message: text }; }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
export function buildPrompt(profile) {
  const examYear = profile.examYear || new Date().getFullYear();
  const nextYear = Number(examYear) + 1;
  return [
    `IMPORTANT: Today's date is ${new Date().toISOString().slice(0,10)}. The student is giving exams in ${examYear}.`,
    `Only return scholarships and colleges relevant to the ${examYear}-${nextYear} academic cycle.`,
    `DO NOT return any scholarships with deadlines in 2023, 2024, or 2025 — those are expired and useless.`,
    `All deadlines must be in ${examYear} or ${nextYear}. If the exact ${examYear} deadline is not yet announced, write "Expected [month] ${examYear}" based on previous years' patterns.`,
    ``,
    `Student profile:`,
    `Name: ${profile.name||"Student"}, Location: ${profile.location||"India"}, Stream: ${profile.stream||"PCM"},`,
    `Category: ${profile.category||""}, Income: ${profile.income||""}, Gender: ${profile.gender||""},`,
    `Exams: ${profile.exams||"JEE"} (${examYear}), Career goal: ${profile.career||"engineering"}.`,
    `Grade: ${profile.grade||""}, Marks: ${profile.marks||""}, JEE: ${profile.jee||""}, NEET: ${profile.neet||""}.`,
    ``,
    `Find:`,
    `1. Top 5 affordable Indian colleges (NIT/IIT/state universities) with ${examYear} fees, cutoffs, and counselling timeline.`,
    `2. Top 5 CURRENTLY OPEN or UPCOMING Indian scholarships (NSP/AICTE/state/private) with ${examYear}-${nextYear} deadlines, amounts, and eligibility.`,
    ``,
    `Return structured JSON: { colleges:[{name,reason,fees,cutoff,source}], scholarships:[{name,amount,deadline,eligibility,why,source}] }`,
  ].join("\n");
}

// ─── Target selection ─────────────────────────────────────────────────────────
export function chooseScrapeTargets(profile) {
  const text = `${profile.career||""} ${profile.exams||""} ${profile.neet||""}`.toLowerCase();
  if (text.includes("neet")) return SCRAPE_TARGETS;
  if (text.includes("jee"))  return SCRAPE_TARGETS.filter(t => t.name !== "MCC");
  return SCRAPE_TARGETS;
}

// ─── Normalize ────────────────────────────────────────────────────────────────
export function normalizeLiveData(scraperJobs, agenticJob) {
  const colleges = [], scholarships = [];

  for (const job of asArray(scraperJobs)) {
    if (!job) continue;
    extract(job.generatedJson || job.generated_json, colleges, scholarships);
  }

  if (agenticJob) {
    const gj = agenticJob.generatedJson || agenticJob.generated_json;
    if (gj) {
      extract(gj, colleges, scholarships);
      extract(gj.structured_data, colleges, scholarships);
    }
  }

  return {
    colleges:     dedupe(colleges.filter(isObj)),
    scholarships: dedupe(scholarships.filter(isObj)),
  };
}

function extract(blob, colleges, scholarships) {
  if (!blob || typeof blob !== "object") return;
  for (const c of asArray(blob.colleges||blob.college_matches||blob.admissions||blob.institutions)) colleges.push(c);
  for (const s of asArray(blob.scholarships||blob.scholarship_matches||blob.schemes||blob.grants))  scholarships.push(s);
  for (const val of Object.values(blob)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const c of asArray(val.colleges||val.college_matches||val.admissions))        colleges.push(c);
      for (const s of asArray(val.scholarships||val.scholarship_matches||val.schemes))   scholarships.push(s);
    }
  }
}

// ─── Build result ─────────────────────────────────────────────────────────────
export function buildNavigatorResult(profile, extracted, sourcesSummary) {
  const live = extracted.colleges.length > 0 || extracted.scholarships.length > 0;
  const colleges     = personalizeColleges(profile,     live ? extracted.colleges     : FALLBACK_COLLEGES).slice(0, 5);
  const scholarships = personalizeScholarships(profile, live ? extracted.scholarships : FALLBACK_SCHOLARSHIPS).slice(0, 5);

  return {
    profile,
    result: {
      colleges,
      scholarships,
      sop:  buildSop(profile),
      plan: buildPlan(scholarships),
    },
    sources: {
      live,
      summary: sourcesSummary || (live ? "Live Anakin AI data" : "Curated fallback data"),
    },
  };
}

function personalizeColleges(profile, list) {
  return list.map(c => ({
    name:   c.name || c.college || c.institution || "College option",
    reason: `${c.reason||c.fit||"Matches the student profile."} For ${profile.name||"this student"}, it connects with ${profile.career||"their goal"}.`,
    fees:   c.fees || c.fee || c.course_fee,
    cutoff: c.cutoff || c.cutoffs || c.closing_rank,
    source: c.source || c.url || "Live source",
  }));
}

function personalizeScholarships(profile, list) {
  const examYear = profile.examYear || new Date().getFullYear();
  return list.map(s => {
    // Fix outdated deadlines — if a deadline mentions a past year, replace it
    let deadline = s.deadline || s.last_date || s.closeDate || "Check current listing";
    const pastYearMatch = deadline.match(/\b(2019|2020|2021|2022|2023|2024|2025)\b/);
    if (pastYearMatch) {
      deadline = deadline.replace(pastYearMatch[1], String(examYear)) + " (estimated from previous cycle)";
    }
    return {
      name:        s.name || s.title || "Scholarship option",
      amount:      s.amount || s.award || s.benefit || "Amount varies",
      deadline,
      eligibility: s.eligibility || s.criteria || "Eligibility varies",
      why:         `${s.why||s.reason||"May match this profile."} ${profile.name||"The student"} should apply early.`,
      source:      s.source || s.url || "Live source",
    };
  });
}

function buildSop(profile) {
  const name    = profile.name || "I";
  const first   = name.split(" ")[0];
  const city    = profile.location || "my hometown";
  const career  = profile.career || "the career I dream about";
  const story   = profile.story ? ` ${profile.story}` : "";
  return `${name} did not grow up with college advice at the dinner table, so every form, exam, and deadline had to be learned alone.${story} In ${city}, ${first} turned curiosity into a promise that education would change more than one life. I want to study for ${career} because my family's first college journey should be the beginning of many more.`;
}

function buildPlan(scholarships) {
  const deadlines = scholarships.map(s => s.deadline).filter(Boolean).slice(0, 4);
  const tasks = [
    "Confirm official eligibility, fees, cutoffs, and counselling rules for each shortlisted college.",
    "Prepare income, category, domicile, marksheet, Aadhaar, bank, and first-generation proof documents.",
    "Apply or renew profiles on NSP, Vidyasaarathi, Buddy4Study, and state scholarship portals.",
    "Track JEE/NEET/CUET counselling notices and lock a weekly revision or document-check slot.",
    "Finish the SOP, activity list, and one-page family education story.",
    "Submit applications, save receipts, and call admission offices for unclear requirements.",
  ];
  return tasks.map((task, i) => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1);
    const dl   = deadlines[i] ? ` Live deadline to watch: ${deadlines[i]}.` : "";
    return { month: MONTH_NAMES[date.getMonth()], task: task + dl };
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function asArray(v) { return !v ? [] : Array.isArray(v) ? v : [v]; }
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = String(item.name||item.title||item.college||"").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ─── Fallback data ────────────────────────────────────────────────────────────
export const FALLBACK_COLLEGES = [
  { name:"NIT Jamshedpur",       reason:"Strong public engineering route for JEE students needing brand value without private-college fees.", source:"JoSAA" },
  { name:"BIT Sindri",           reason:"Realistic state engineering choice for Jharkhand students watching annual cost.",                   source:"Jharkhand counselling" },
  { name:"Jadavpur University",  reason:"Excellent value if open to West Bengal via WBJEE counselling.",                                    source:"WBJEE counselling" },
  { name:"Banaras Hindu University", reason:"Broad, affordable public university for CUET or NEET-linked programs.",                        source:"BHU admissions" },
  { name:"AIIMS Patna",          reason:"Focused public medical option for a NEET student from eastern India.",                             source:"MCC / AIIMS" },
];

export const FALLBACK_SCHOLARSHIPS = [
  { name:"Central Sector Scholarship (NSP)", amount:"Up to ₹12,000/yr UG", deadline:"Expected Oct-Dec 2026 (check NSP portal)",  eligibility:"High Class 12 merit + income criteria",              why:"Built for strong Class 12 students from lower-income homes.",          source:"scholarships.gov.in" },
  { name:"Post Matric Scholarship",          amount:"Tuition + maintenance", deadline:"Expected Sep-Nov 2026 (check state portal)", eligibility:"Category + income + domicile rules",                 why:"Reduces fee burden directly if category and income match.",            source:"scholarships.gov.in" },
  { name:"AICTE Pragati Scholarship",        amount:"Up to ₹50,000/yr",     deadline:"Expected Oct-Nov 2026 (check AICTE portal)", eligibility:"Girl students in AICTE-approved tech programs",      why:"Strong fit for a first-generation girl entering technical education.", source:"www.aicte-india.org" },
  { name:"Vidyasaarathi Scholarships",       amount:"Varies by sponsor",    deadline:"Rolling — check current listings",          eligibility:"Marks, income, state, course rules vary",            why:"Private scholarship backup beyond government aid.",                    source:"vidyasaarathi.co.in" },
  { name:"Buddy4Study Scholarships",         amount:"Varies by program",    deadline:"Rolling — check current listings",          eligibility:"Marks, income, location, course rules vary",         why:"Find live private scholarships matched to course and income.",         source:"buddy4study.com" },
];
