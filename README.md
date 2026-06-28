# First Gen Navigator

> *I was 17. Results had just come out. 92 percentile in JEE — not enough for the IITs, but enough for something. I didn't know what that something was.*

---

I remember sitting in front of our family computer — the one my father saved three months of auto-rickshaw earnings to buy — typing "JEE 92 percentile which college" into Google at 11 PM.

I got 47 tabs worth of answers. None of them made sense together.

I asked ChatGPT. It gave me a list. A nice, clean, confident list. No fees. No cutoffs. No deadlines. No scholarship that I could actually apply to with an OBC certificate from Jharkhand. Just... words.

My parents couldn't help. My mother has never seen a college application form. My father dropped out in Class 9. There was no older sibling who'd been through this. No cousin who'd cracked JEE. No neighbor uncle who knew the JoSAA counselling process.

I was completely, absolutely alone in this — and I was one of the lucky ones, because I had the internet.

**That's why I built First Gen Navigator.**

---

## What it is

A free, AI-powered roadmap tool that does in 60 seconds what took me three weeks of panic, wrong forums, and expired scholarship links to figure out — if I figured it out at all.

You put in your name, your score, your state, your income, your category. You hit submit.

It searches **live** — not cached, not guessed, not hallucinated — across the National Scholarship Portal, AICTE, Vidyasaarathi, JoSAA, and 10+ other sources using [Anakin AI's](https://anakin.io) real-time research pipeline. Then it gives you:

- **Colleges that match your actual cutoff, location, and budget** — with fees
- **Scholarships you can apply for right now** — with real deadlines and amounts
- **A budget calculator** — fees minus what the scholarships cover
- **A document checklist** — so you never miss an Aadhaar copy or income certificate
- **A personalized SOP opening paragraph** — for students who've never written one
- **A month-by-month action plan** — broken down so it's not overwhelming
- **A scholarship tracker** — check off what you've applied to
- **Read aloud support** — for students who need accessibility help
- **Download as PDF** — to print and put on the wall

No login. No credit card. No English degree required to understand the output.

---

## The problem this solves

India has thousands of scholarships. Most first-generation students never apply to any of them.

Not because they don't qualify. Because they don't know the name of the scholarship, the portal it's on, the deadline that passed two weeks ago, or the one document they're missing that disqualifies them on the last page of a 14-step form.

ChatGPT tells you what scholarships exist. Google tells you they exist somewhere. Neither tells you:

> *"Asha Kumar, you qualify for the AICTE Pragati Scholarship (₹50,000/yr) and the Jharkhand State Scholarship (₹30,000/yr). The NSP portal closes March 31. You need your income certificate to be less than 3 months old. Here's the document checklist."*

That's what this does.

---

## How it works

Built for the **Anakin AI Hackathon** using two core Anakin products:

### 🔍 Anakin URL Scraper
Scrapes live Indian scholarship and college admission portals (NSP, Vidyasaarathi, Buddy4Study, JoSAA, MCC) using:
- `useBrowser: true` — handles JavaScript-heavy government sites
- `country: "in"` — Indian residential proxy for `.gov.in` access
- `generateJson: true` — AI extracts structured data (name, amount, deadline, eligibility)

### 🧠 Wire API (Agentic Search)
Runs a 4-stage AI research pipeline on the student's specific profile via Anakin's Wire API:
1. **Query refinement** — shapes the research question for the student's stream, location, category, and income
2. **Web search** — finds 20+ live sources
3. **Citation scraping** — pulls full content from top results
4. **Analysis & synthesis** — returns structured colleges and scholarships arrays

Both run **in parallel**. The whole thing typically completes in **60–90 seconds**.

---

## Setup

### Prerequisites
- Node.js 18+ (ESM support required)
- An [Anakin API key](https://anakin.io/dashboard) — free tier includes 500 credits

### Install & run

```bash
git clone https://github.com/yourusername/first-gen-navigator
cd first-gen-navigator
npm install
```

Create `.env`:
```
ANAKIN_API_KEY=ask_your_key_here
PORT=3000
```

Start:
```bash
node server.js
```

Or on Windows, double-click `start.bat`.

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

---

## Features

| Feature | Description |
|---|---|
| 🎯 Live scholarship search | Real-time NSP, AICTE, Vidyasaarathi data |
| 🏫 College matching | Cutoffs, fees, location filter |
| 📊 Budget calculator | Fees minus scholarships = what you actually pay |
| 📋 Document checklist | 12-item list, saves progress in browser |
| ✅ Scholarship tracker | Mark which ones you've applied to |
| ✍️ SOP generator | Personalized opening paragraph for statements of purpose |
| 📅 Action plan | Month-by-month deadlines and tasks |
| 🔊 Read aloud | Web Speech API for accessibility |
| ⬇️ Download PDF | Full roadmap to print or save |
| 🔗 Share | Web Share API / clipboard fallback |
| 💾 Persistent progress | Checklist + applied status saved in localStorage |
| 📱 Fully responsive | Mobile, tablet, desktop |
| 🔒 Privacy-first | API key stays on local server. No login. No tracking. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Backend | Node.js (native `http` module, zero npm dependencies) |
| AI scraping | Anakin URL Scraper (browser mode, Indian proxy) |
| AI research | Anakin Agentic Search (4-stage pipeline) |
| Styling | Custom design system (dark glassmorphism, CSS animations) |
| Fonts | Inter + Outfit via Google Fonts |

**No React. No Next.js. No Tailwind. No Express. No database. No server-side login.**

This runs on a ₹0 VPS if you have credits. The entire backend is one file: [`server.js`](./server.js).

---

## Why Anakin

I tried building this with plain web scraping first. The NSP portal blocks bots. Vidyasaarathi needs JavaScript. Government `.gov.in` sites need Indian IP addresses.

Anakin's URL Scraper handles all of that — browser mode, residential Indian proxy, AI JSON extraction — in one API call. The Agentic Search does what would take 20 manual Google searches and 10 minutes of reading in about 60 seconds.

For a hackathon project that actually works on real data, in real time, for real students — that matters.

---

## Project structure

```
first-gen-navigator/
├── server.js        ← Node.js backend (URL Scraper + Agentic Search, fallback data)
├── index.html       ← Multi-step form UI
├── styles.css       ← Dark glassmorphism design system
├── app.js           ← Frontend logic (all features)
├── .env             ← Your Anakin API key (not committed)
├── .env.example     ← Template
├── start.bat        ← Windows one-click start
└── README.md        ← This file
```

---

## For the judges

This project was built for one specific person: the 17-year-old sitting at a shared computer in a small town who just got their JEE result and has no one to ask.

The AI isn't the product. The product is the answer to: *"What do I do now?"*

The Anakin API made it possible to give a real, live, personalized answer — not a template, not a guess, not a hallucination — in under 90 seconds, for free, with no login required.

That's the whole point.

---

## License

do whatever helps more first-generation students. Attribution appreciated but not required.

---

*Built in 2026 for the Anakin AI Hackathon.*
