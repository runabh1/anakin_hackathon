import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnv();

const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.ANAKIN_BASE_URL || "https://api.anakin.io/v1").replace(/\/$/, "");
const anakinKey = process.env.ANAKIN_API_KEY;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// URL Scraper targets — Indian scholarship & admission portals
const scrapeTargets = [
  { name: "National Scholarship Portal", url: "https://scholarships.gov.in/" },
  { name: "Vidyasaarathi", url: "https://www.vidyasaarathi.co.in/Vidyasaarathi/" },
  { name: "Buddy4Study", url: "https://www.buddy4study.com/scholarships" },
  { name: "JoSAA", url: "https://josaa.nic.in/" },
  { name: "Medical Counselling Committee", url: "https://mcc.nic.in/" },
];

const fallbackColleges = [
  {
    name: "NIT Jamshedpur",
    reason: "A strong public engineering route for a JEE student who needs brand value without private-college fee pressure.",
    source: "JoSAA / institute admission pages",
  },
  {
    name: "BIT Sindri",
    reason: "A realistic state engineering choice for Jharkhand students watching annual cost closely.",
    source: "Jharkhand counselling / official institute pages",
  },
  {
    name: "Jadavpur University",
    reason: "Excellent value if the student is open to West Bengal and can follow WBJEE counselling.",
    source: "WBJEE counselling / university admission pages",
  },
  {
    name: "Banaras Hindu University",
    reason: "A broad, affordable public university route for CUET or NEET-linked programs.",
    source: "BHU official admission pages",
  },
  {
    name: "AIIMS Patna",
    reason: "A focused public medical option for a NEET student from eastern India.",
    source: "MCC / AIIMS admission pages",
  },
];

const fallbackScholarships = [
  {
    name: "Central Sector Scheme of Scholarship for College and University Students",
    amount: "Up to Rs. 12,000 per year at UG level",
    deadline: "Check current NSP cycle",
    eligibility: "High Class 12 merit and income rules",
    why: "This is worth checking first because it is built for strong Class 12 students from lower-income homes.",
    source: "National Scholarship Portal",
  },
  {
    name: "Post Matric Scholarship",
    amount: "Tuition and maintenance support varies",
    deadline: "State-specific NSP deadline",
    eligibility: "Category, income, domicile, and course rules apply",
    why: "If the student's category and income match state rules, this can reduce the fee burden directly.",
    source: "NSP / state welfare portal",
  },
  {
    name: "AICTE Pragati Scholarship",
    amount: "Up to Rs. 50,000 per year",
    deadline: "Check current AICTE/NSP cycle",
    eligibility: "Girl students in AICTE-approved technical programs, income cap applies",
    why: "This is a strong fit for a first-generation girl entering technical education.",
    source: "AICTE / NSP",
  },
  {
    name: "Vidyasaarathi sponsor scholarships",
    amount: "Varies by sponsor",
    deadline: "Varies by listing",
    eligibility: "Marks, income, state, and course rules vary",
    why: "This gives the student private scholarship backup beyond government aid.",
    source: "Vidyasaarathi",
  },
  {
    name: "Buddy4Study listed scholarships",
    amount: "Varies by program",
    deadline: "Varies by listing",
    eligibility: "Marks, income, location, and course rules vary",
    why: "This is useful for finding live private scholarships matched to the student's course and income.",
    source: "Buddy4Study",
  },
];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/navigator") {
      const profile = await readJson(request);
      sendJson(response, 200, await buildNavigatorResponse(profile));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        anakinConfigured: Boolean(anakinKey),
        urlScraperEnabled: true,
        agenticSearchEnabled: true,
      });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the other server or set PORT=3001 in .env.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`First Gen Navigator running at http://127.0.0.1:${port}`);
});

async function buildNavigatorResponse(profile) {
  // Run URL Scraper and Agentic Search in parallel
  const [scraperResult, agenticResult] = await Promise.all([
    runUrlScraper(profile),
    runAgenticSearch(profile),
  ]);

  const extracted = normalizeLiveData(scraperResult, agenticResult);
  const live = extracted.colleges.length > 0 || extracted.scholarships.length > 0;

  return {
    profile,
    result: {
      colleges: personalizeColleges(profile, live ? extracted.colleges : fallbackColleges).slice(0, 5),
      scholarships: personalizeScholarships(profile, live ? extracted.scholarships : fallbackScholarships).slice(0, 5),
      sop: buildSop(profile),
      plan: buildActionPlan(extracted.scholarships),
    },
    sources: {
      live,
      anakin: scraperResult.summary,
      wire: agenticResult.summary,
      summary: [scraperResult.summary, agenticResult.summary].filter(Boolean).join(" "),
    },
  };
}

// ─── URL Scraper ────────────────────────────────────────────────────────────
// Scrapes up to 3 Indian scholarship / admission portals with browser mode
// and AI JSON extraction. The completed job shape is:
//   { status: "completed", generatedJson: { scholarships: [...], colleges: [...] }, markdown: "..." }
async function runUrlScraper(profile) {
  if (!anakinKey) return { ok: false, summary: "Anakin API key is not set on the backend.", data: [] };

  const targets = chooseScrapeTargets(profile).slice(0, 3); // cap at 3 to save credits

  try {
    const jobs = await Promise.all(
      targets.map(async (target) => {
        try {
          // POST /v1/url-scraper — only valid params: url, country, useBrowser, generateJson, sessionId
          const submit = await apiFetch("/url-scraper", anakinKey, {
            method: "POST",
            body: {
              url: target.url,
              country: "in",        // Indian residential proxy — better access to .gov.in sites
              useBrowser: true,     // JS-rendered sites need browser mode
              generateJson: true,   // AI-extract structured JSON from the page content
            },
          });

          const jobId = submit.jobId || submit.job_id || submit.id;
          if (!jobId) {
            console.error(`URL Scraper submit for ${target.name} returned no jobId:`, submit);
            return { source: target.name, ok: false };
          }

          // Poll /v1/url-scraper/{jobId} — completed job has .generatedJson at top level
          const job = await pollUrlScraper(jobId);
          return { source: target.name, url: target.url, job };
        } catch (err) {
          console.error(`URL Scraper failed for ${target.name}: ${err.message}`);
          return { source: target.name, ok: false, error: err.message };
        }
      })
    );

    return { ok: true, summary: "Anakin URL Scraper checked public Indian scholarship and admission portals.", data: jobs };
  } catch (error) {
    return { ok: false, summary: `Anakin URL Scraper failed: ${error.message}`, data: [] };
  }
}

// Poll the URL Scraper endpoint — returns the full completed job object
// so normalizeLiveData can access .generatedJson directly
async function pollUrlScraper(jobId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await apiFetch(`/url-scraper/${jobId}`, anakinKey);
    const status = String(job.status || "").toLowerCase();
    if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return job;
    if (["failed", "error", "cancelled"].includes(status)) throw new Error(job.error || `URL Scraper job ${status}`);
    await delay(3000); // 3-second poll interval as recommended by docs
  }
  throw new Error("Timed out waiting for URL Scraper job.");
}

// ─── Agentic Search ──────────────────────────────────────────────────────────
// Uses Anakin's 4-stage AI research pipeline:
//   1. Query refinement  2. Web search  3. Citation scraping  4. Analysis & synthesis
// This is the RIGHT tool for Indian scholarship research — it searches the live web,
// scrapes top sources, and returns structured data. Wire has no Indian scholarship actions.
//
// POST /v1/agentic-search → { job_id, status: "pending" }
// GET  /v1/agentic-search/{id} → { status, generatedJson: { summary, structured_data: { scholarships, colleges } } }
async function runAgenticSearch(profile) {
  if (!anakinKey) return { ok: false, summary: "Anakin API key is not set for Agentic Search.", data: [] };

  const stream = profile.stream || "PCM";
  const location = profile.location || "India";
  const category = profile.category || "";
  const income = profile.income || "";
  const exams = profile.exams || "JEE";
  const career = profile.career || "engineering";

  const prompt = [
    `Research Indian college admissions and scholarships for a first-generation student with this profile:`,
    `Location: ${location}, Stream: ${stream}, Category: ${category}, Family Income: ${income}, Exams: ${exams}, Career goal: ${career}.`,
    `Find:`,
    `1. Top 5 affordable Indian colleges for this profile (NIT, IIT, state engineering/medical/general universities) with fees and cutoffs.`,
    `2. Top 5 active Indian government scholarships (NSP, AICTE, state schemes) and private scholarships with current deadlines, amounts, and eligibility.`,
    `Return results as structured JSON with two arrays: colleges (name, reason, fees, cutoff, source) and scholarships (name, amount, deadline, eligibility, why, source).`,
  ].join(" ");

  try {
    // Submit the agentic search job
    const submit = await apiFetch("/agentic-search", anakinKey, {
      method: "POST",
      body: { prompt },
    });

    const jobId = submit.job_id || submit.jobId || submit.id;
    if (!jobId) {
      console.error("Agentic Search submit returned no job_id:", submit);
      return { ok: false, summary: "Agentic Search submission did not return a job ID.", data: [] };
    }

    console.log(`Agentic Search job submitted: ${jobId}`);

    // Poll /v1/agentic-search/{id} — docs say poll every 10 seconds, takes 1-5 minutes
    const job = await pollAgenticSearch(jobId);
    return {
      ok: true,
      summary: "Anakin Agentic Search completed a 4-stage AI research pipeline on Indian scholarships and colleges.",
      data: [job],
    };
  } catch (error) {
    return { ok: false, summary: `Agentic Search failed: ${error.message}`, data: [] };
  }
}

// Poll the Agentic Search endpoint — docs say poll every 10s, typical 1-5 min
// Completed response shape: { id, status: "completed", generatedJson: { summary, structured_data, data_schema } }
async function pollAgenticSearch(jobId) {
  for (let attempt = 0; attempt < 36; attempt += 1) { // 36 × 10s = 6 min max
    const job = await apiFetch(`/agentic-search/${jobId}`, anakinKey);
    const status = String(job.status || "").toLowerCase();
    if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return job;
    if (["failed", "error", "cancelled"].includes(status)) throw new Error(job.error || `Agentic Search job ${status}`);
    await delay(10000); // 10-second poll interval as recommended by docs
  }
  throw new Error("Timed out waiting for Agentic Search job (6 min limit).");
}

// ─── Data normalization ───────────────────────────────────────────────────────
// Handles two response shapes:
//
// URL Scraper job (returned by pollUrlScraper):
//   { status: "completed", generatedJson: { colleges: [...], scholarships: [...] }, markdown: "..." }
//
// Agentic Search job (returned by pollAgenticSearch):
//   { status: "completed", generatedJson: { summary: "...", structured_data: { colleges: [...], scholarships: [...] } } }
function normalizeLiveData(scraperResult, agenticResult) {
  const colleges = [];
  const scholarships = [];

  // Process URL Scraper results — each item in data is { source, url, job }
  for (const item of asArray(scraperResult.data)) {
    if (!item || !item.job) continue;
    const job = item.job;

    // URL Scraper completed job: generatedJson is at top level
    extractCollegesAndScholarships(job.generatedJson, colleges, scholarships);
    // Also check markdown-parsed data if generatedJson is missing
    if (job.generated_json) extractCollegesAndScholarships(job.generated_json, colleges, scholarships);
  }

  // Process Agentic Search results — each item in data is the full job object
  for (const job of asArray(agenticResult.data)) {
    if (!job) continue;

    // Agentic Search: generatedJson.structured_data contains the arrays
    const gj = job.generatedJson || job.generated_json;
    if (gj) {
      extractCollegesAndScholarships(gj, colleges, scholarships);           // top-level in gj
      extractCollegesAndScholarships(gj.structured_data, colleges, scholarships); // nested structured_data
    }
  }

  return {
    colleges: dedupeByName(colleges.filter(isObject)),
    scholarships: dedupeByName(scholarships.filter(isObject)),
  };
}

// Extract colleges and scholarships arrays from any JSON blob
function extractCollegesAndScholarships(blob, colleges, scholarships) {
  if (!blob || typeof blob !== "object") return;

  // Look for colleges in multiple possible field names
  for (const col of asArray(blob.colleges || blob.college_matches || blob.admissions || blob.institutions)) {
    colleges.push(col);
  }

  // Look for scholarships in multiple possible field names
  for (const sch of asArray(blob.scholarships || blob.scholarship_matches || blob.schemes || blob.grants)) {
    scholarships.push(sch);
  }

  // Recursively search one level deeper for nested objects (e.g. { data: { colleges: [] } })
  for (const val of Object.values(blob)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const col of asArray(val.colleges || val.college_matches || val.admissions)) colleges.push(col);
      for (const sch of asArray(val.scholarships || val.scholarship_matches || val.schemes)) scholarships.push(sch);
    }
  }
}

function personalizeColleges(profile, colleges) {
  return colleges.map((college) => {
    const reason = college.reason || college.fit || college.eligibility || "This option matches the profile and should be checked on the official admission page.";
    return {
      name: college.name || college.college || college.institution || "College option",
      reason: `${reason} For ${profile.name || "this student"}, it connects with ${profile.career || "their dream career"} and the exam path they listed.`,
      fees: college.fees || college.fee || college.course_fee,
      cutoff: college.cutoff || college.cutoffs || college.closing_rank,
      source: college.source || college.url || "Live source returned by backend",
    };
  });
}

function personalizeScholarships(profile, scholarships) {
  return scholarships.map((scholarship) => {
    const why = scholarship.why || scholarship.reason || "The student's marks, income, course, or category may match this scholarship.";
    return {
      name: scholarship.name || scholarship.title || "Scholarship option",
      amount: scholarship.amount || scholarship.award || scholarship.benefit || "Amount varies",
      deadline: scholarship.deadline || scholarship.last_date || scholarship.closeDate || "Check current listing",
      eligibility: scholarship.eligibility || scholarship.criteria || "Eligibility varies by scheme",
      why: `${why} ${profile.name || "The student"} should apply early and keep documents ready.`,
      source: scholarship.source || scholarship.url || "Live source returned by backend",
    };
  });
}

function buildSop(profile) {
  const name = profile.name || "I";
  const firstName = name.split(" ")[0];
  const city = profile.location || "my hometown";
  const career = profile.career || "the career I dream about";
  const interests = profile.interests || "the problems around me";

  return `${name} did not grow up with college advice at the dinner table, so every form, exam, and deadline has had to be learned with courage. In ${city}, ${firstName} found direction through ${interests}, turning curiosity into a promise that education would change more than one life. I want to study for ${career} because my family's first college journey should become the beginning of many more.`;
}

function buildActionPlan(scholarships) {
  const sourceDeadlines = scholarships
    .map((item) => item.deadline || item.last_date || item.closeDate)
    .filter(Boolean)
    .slice(0, 4);
  const tasks = [
    "Confirm official eligibility, fees, cutoffs, and counselling rules for each shortlisted college.",
    "Prepare income, caste/category, domicile, marksheet, Aadhaar, bank, and first-generation proof documents.",
    "Apply or renew profiles on NSP, Vidyasaarathi, Buddy4Study, and any state scholarship portal.",
    "Track JEE/NEET/CUET counselling notices and lock a weekly revision or document-check slot.",
    "Finish the SOP, activity list, and one-page family education story.",
    "Submit applications, save receipts, and call admission offices for unclear requirements.",
  ];

  return tasks.map((task, index) => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth() + index, 1);
    const deadline = sourceDeadlines[index] ? ` Live deadline to watch: ${sourceDeadlines[index]}.` : "";
    return { month: monthNames[date.getMonth()], task: task + deadline };
  });
}

function chooseScrapeTargets(profile) {
  const text = `${profile.career} ${profile.exams} ${profile.jee} ${profile.neet}`.toLowerCase();
  if (text.includes("neet")) return scrapeTargets;
  if (text.includes("jee")) return scrapeTargets.filter((target) => target.name !== "Medical Counselling Committee");
  return scrapeTargets;
}

async function apiFetch(path, key, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? parseJson(text) : {};
    if (!response.ok) throw new Error(data.message || data.error || `${response.status} ${response.statusText}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.name || item.title || item.college || item.institution || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function serveStatic(pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, cleanPath));
  if (!filePath.startsWith(root)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(data);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function contentType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[extname(filePath)] || "application/octet-stream"
  );
}

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
