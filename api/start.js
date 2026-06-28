// POST /api/start
// Submits URL Scraper + Agentic Search jobs to Anakin and immediately
// returns their job IDs. Each Anakin submit is < 2s so this stays well
// within Vercel's 10-second serverless limit.
//
// Request body: student profile object
// Response: { scraperJobIds: string[], agenticJobId: string, profile: object }

import { apiFetch, buildPrompt, chooseScrapeTargets } from "../lib/core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANAKIN_API_KEY;
  if (!key) return res.status(500).json({ error: "ANAKIN_API_KEY is not configured in Vercel environment variables." });

  let profile = {};
  try { profile = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: "Invalid JSON body" }); }

  const targets = chooseScrapeTargets(profile).slice(0, 2); // 2 targets to stay fast

  const [scraperSubmits, agenticSubmit] = await Promise.allSettled([
    // Submit URL scraper jobs in parallel
    Promise.all(targets.map(t =>
      apiFetch("/url-scraper", key, {
        method: "POST",
        body: { url: t.url, country: "in", useBrowser: true, generateJson: true },
      }).catch(err => ({ _error: err.message, name: t.name }))
    )),
    // Submit agentic search job
    apiFetch("/agentic-search", key, {
      method: "POST",
      body: { prompt: buildPrompt(profile) },
    }).catch(err => ({ _error: err.message })),
  ]);

  const scraperResults  = scraperSubmits.status  === "fulfilled" ? scraperSubmits.value  : [];
  const agenticResult   = agenticSubmit.status   === "fulfilled" ? agenticSubmit.value   : {};

  const scraperJobIds = scraperResults
    .filter(s => !s._error)
    .map(s => s.jobId || s.job_id || s.id)
    .filter(Boolean);

  const agenticJobId = agenticResult._error ? null : (agenticResult.job_id || agenticResult.jobId || agenticResult.id || null);

  if (!scraperJobIds.length && !agenticJobId) {
    return res.status(502).json({ error: "Both Anakin jobs failed to start. Check your API key and credits." });
  }

  return res.status(200).json({ scraperJobIds, agenticJobId, profile });
}
