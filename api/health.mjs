// GET /api/health
import { BASE_URL } from "../lib/core.mjs";

export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    anakinConfigured: Boolean(process.env.ANAKIN_API_KEY),
    endpoints: { start: "/api/start", check: "/api/check" },
    anakinBase: BASE_URL,
    runtime: "vercel-serverless",
  });
}
