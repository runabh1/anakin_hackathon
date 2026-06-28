// POST /api/check
// Called by the frontend every 6 seconds after /api/start.
// Makes ONE poll request to each running Anakin job and returns immediately.
// Each Anakin status check is < 1s, so this stays well within Vercel's 10s limit.
//
// Request body: { scraperJobIds: string[], agenticJobId: string, profile: object }
// Response (not done): { done: false, scraperStatus: string[], agenticStatus: string }
// Response (done):     { done: true, ...navigator response }

import { apiFetch, normalizeLiveData, buildNavigatorResult } from "./lib/core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANAKIN_API_KEY;
  if (!key) return res.status(500).json({ error: "ANAKIN_API_KEY is not set." });

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: "Invalid JSON body" }); }

  const { scraperJobIds = [], agenticJobId = null, profile = {} } = body;

  // Poll all jobs simultaneously — one HTTP call each, fast
  const [scraperPolls, agenticPoll] = await Promise.all([
    Promise.all(scraperJobIds.map(id =>
      apiFetch(`/url-scraper/${id}`, key, { timeoutMs: 8000 })
        .catch(err => ({ status: "error", _error: err.message }))
    )),
    agenticJobId
      ? apiFetch(`/agentic-search/${agenticJobId}`, key, { timeoutMs: 8000 })
          .catch(err => ({ status: "error", _error: err.message }))
      : Promise.resolve(null),
  ]);

  const DONE_STATUSES   = new Set(["completed", "complete", "succeeded", "success", "done"]);
  const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);

  const scraperDone  = scraperPolls.every(j => DONE_STATUSES.has(String(j.status||"").toLowerCase()) || FAILED_STATUSES.has(String(j.status||"").toLowerCase()));
  const agenticDone  = !agenticJobId || DONE_STATUSES.has(String(agenticPoll?.status||"").toLowerCase()) || FAILED_STATUSES.has(String(agenticPoll?.status||"").toLowerCase());

  // Still running — tell frontend to keep polling
  if (!scraperDone || !agenticDone) {
    return res.status(200).json({
      done:           false,
      scraperStatus:  scraperPolls.map(j => j.status || "pending"),
      agenticStatus:  agenticPoll?.status || "pending",
    });
  }

  // All done — normalize and build response
  const completedScraperJobs = scraperPolls.filter(j =>
    DONE_STATUSES.has(String(j.status||"").toLowerCase())
  );
  const extracted = normalizeLiveData(completedScraperJobs, agenticPoll);

  const sources = [
    scraperJobIds.length ? "Anakin URL Scraper (live scholarship portals)" : null,
    agenticJobId        ? "Anakin Agentic Search (4-stage AI research)"    : null,
  ].filter(Boolean).join(" + ");

  const payload = buildNavigatorResult(profile, extracted, sources);

  return res.status(200).json({ done: true, ...payload });
}
