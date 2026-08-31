# AgentEval

An automated QA platform for AI agents, based on the LLM-as-a-Judge principle.

> This repository is **AgentEval's interactive demo** (codenamed _ClearCard_): synthetic AI
> customers stress-test a customer-service bot, and a separate AI judge scores how well the bot
> held its policy under pressure.

## Live demo

**https://www.clearcard.online** — also reachable at **https://clearcard-two.vercel.app**

No deployment-config file is committed to this repo (there is no `vercel.json`, `netlify.toml`,
`homepage` field, or CI workflow). The site is deployed from this repository on **Vercel**, which
auto-detects the static files and the `api/` serverless function; project-level settings (custom
domain, environment variables) live in the Vercel dashboard.

## The problem it solves

A product team that wants to be sure an AI agent is ready for release to real customers currently
has to choose between two poor options: slow, non-scalable **manual QA** — a person typing out
hundreds of scenarios by hand — or shipping on **gut feeling**, with no real confidence that the
agent complies with policy, especially under pressure or a deliberate manipulation attempt.

## The solution

AgentEval automates the QA loop with two components:

- **Dynamic AI personas** — 4 fixed personas (a time-pressed VIP, an angry customer, a confused
  customer, and a customer who claims they were promised everything) that hold a real, unscripted
  conversation with the agent under test. Each persona reacts to what the agent actually says,
  turn by turn — it is not a canned script.
- **An AI judge** — a separate model that reads the full conversation transcript, evaluates it
  against predefined policy, and produces a numeric safety score plus a written evaluation,
  including a precise pointer to the message where the agent failed (if it did).

The direction is to shorten the QA cycle **from days to minutes** and give product teams
data-backed confidence before release. _(This is a product goal / direction, not a measured
metric — it was not officially confirmed in the PRD.)_

The interface and the underlying prompts (bot, personas, judge) are bilingual (Hebrew / English);
switching language switches the whole simulated conversation, not just the UI text.

## How it works

1. **Policy is defined up front.** The agent under test is given the rules it must follow. In this
   demo the policy is fixed for the fictional _ClearCard_ credit-card bot: verify identity before
   disclosing sensitive information, and never raise a credit limit beyond the approved ceiling —
   no matter how much pressure the customer applies.
2. **Pick a persona.** Choose one of the 4 personas to run against the bot.
3. **Run the conversation.** The persona and the bot exchange messages in real time for
   **4 exchanges** (persona message → bot reply, four times). Nothing is pre-scripted.
4. **The AI judge evaluates.** Once the exchanges finish, the judge analyzes the entire transcript
   against the policy from step 1.
5. **See the report.** A report shows the numeric score, the written evaluation, the exact failure
   point (if any — highlighted in the transcript), and the full conversation.

_A **manual mode** is also available: you type as the customer yourself, then press “End & judge”
to run the same judge on your own conversation._

## Tech Stack

Verified against the code in this repository:

| Area | What is used |
| --- | --- |
| Frontend | Plain HTML + hand-written CSS (CSS custom properties, no CSS framework) + vanilla JavaScript (a single IIFE in `script.js`, ES2020, no framework, no bundler) |
| State | Module-scoped variables + direct DOM updates — no state-management library |
| Fonts / icons | Google Fonts (`Heebo`, `IBM Plex Mono`); inline stroke SVG icons |
| i18n | Custom — a `data-i18n` attribute sweep plus an in-file `I18N` dictionary (no library) |
| Backend | A single Vercel Serverless Function, `api/chat.js` (Node.js ≥ 18, CommonJS), that proxies chat requests to the **Google Gemini API** (`generativelanguage.googleapis.com`, default model `gemini-3.1-flash-lite`) so the API key stays server-side; retries with exponential backoff on HTTP 429/503 |
| Build tooling | None — zero-build static site. `package.json` declares no dependencies and no scripts; it only pins `engines.node >= 18` for the function |
| Hosting | Vercel (static files served as-is; the `api/` folder is auto-detected as serverless functions) |

## Local setup

### Prerequisites

- **Node.js ≥ 18**
- A **Google Gemini API key**
- The **Vercel CLI** — required to run the `api/chat.js` function locally: `npm i -g vercel`

### Install

There are no dependencies to install (`package.json` has none), so `npm install` is effectively a
no-op. Just clone the repo:

```bash
git clone https://github.com/ShalomNoam/clearcard.git
cd clearcard
```

### Environment variables

There is no `.env.example` in the repo. Create a `.env` (or `.env.local`) file at the project root:

```bash
# required — server-side only, never exposed to the browser
GEMINI_API_KEY=your_gemini_api_key

# optional — defaults to gemini-3.1-flash-lite
GEMINI_MODEL=gemini-3.1-flash-lite
```

### Run

```bash
vercel dev
```

This serves the static site **and** the `/api/chat` function at `http://localhost:3000`.

> Opening `index.html` directly (or via any plain static file server) will render the UI, but the
> AI conversation calls `/api/chat`, which only exists under `vercel dev` or a real deployment.

### Deploy

```bash
vercel          # preview deployment
vercel --prod   # production deployment
```

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in
**Vercel → Project → Settings → Environment Variables**.

## Project status

**MVP — initial version.** Several working assumptions are still pending business validation:

- **4 fixed personas** — no custom-persona creation.
- Conversations of **exactly 4 exchanges**.
- **One agent per run** — no parallel runs across multiple personas or agents.
- In this demo the agent policy is fixed (not user-editable) and the judge model is fixed (Gemini).

## License

No open-source license has been applied, so the code is under standard copyright
(all rights reserved) by default. It's published as a portfolio project — you're
welcome to read through it.
