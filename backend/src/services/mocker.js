/**
 * Mock interview AI helpers — Google Gemini via @google/generative-ai
 * Questions are generated live by Gemini at an MNC hiring-panel bar.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const MODELS = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

const PHASES = [
  'self_intro',
  'projects_skills',
  'technical',
  'optimization',
  'behavioural',
  'hr_logistics',
];

const PHASE_Q_TARGETS = {
  self_intro: 2,
  projects_skills: 3,
  technical: 4,
  optimization: 3,
  behavioural: 5,
  hr_logistics: 5,
};

const MNC_BAR = `You are a senior hiring-panel interviewer at a top product MNC
(Google / Amazon / Microsoft / Meta / similar). The bar is high: questions must
feel like a real onsite / virtual panel — specific, role-aligned, and probing.
Generate every question yourself with Gemini for this role and level. Never use
generic FAQ lists or recycled "top 10 interview questions". Ask ONE question at
a time. Acknowledge briefly, then go deeper when answers are shallow.`;

const PHASE_PROMPTS = {
  self_intro: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: Self Introduction (Phase 1 of 6)

Your job in this phase:
- Open like a real panel: brief welcome, then ask for a crisp professional intro
- Follow up on experience years, recent role, and what they want to be evaluated on for {role}
- Keep it warm but efficient — MNC panels do not waste time

Rules:
- Ask ONE question at a time
- Brief 1-sentence acknowledgment before the next ask
- When instructed to complete the phase, say:
  "Thank you. Let's move to your projects and ownership. [PHASE_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [PHASE_COMPLETE].
- Do NOT ask deep technical questions in this phase

Start with a short welcome and ask for their professional introduction.`,

  projects_skills: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: Projects & Skills (Phase 2 of 6)

Your job in this phase (MNC style):
- Dig into 1–2 real projects with ownership: problem, their contribution, impact (metrics)
- Probe tech choices, trade-offs, failures, and what they would redo
- Ask about collaboration: stakeholders, team size, conflict or constraints
- Push for specifics — "what exactly did YOU own?" not "we did X"

Rules:
- Ask ONE question at a time
- Acknowledge briefly, then probe depth
- When instructed to complete the phase, say:
  "Good. Let's move into the technical depth round. [PHASE_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [PHASE_COMPLETE].
- Tailor every question to {role}; no HR/behavioural detours here`,

  technical: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: Technical Depth (Phase 3 of 6)

Your job in this phase:
- Ask fresh, role-specific technical questions at a real MNC bar for {level}
- Prefer: fundamentals → applied scenarios → design/debug/trade-offs
- Include at least one production-style scenario (incident, scale, correctness, security, DX)
- You MAY ask short design, debugging, or "how would you implement…" questions
- Progressively increase difficulty across the phase

Role focus examples (adapt, do not read as a checklist to recite):
- Python Developer: internals, concurrency, APIs, data structures, testing
- Frontend Developer: JS/TS, React, rendering/perf, accessibility, state, network
- Backend Developer: APIs, data modeling, consistency, caching, auth, reliability
- ML Engineer: models, evaluation, data leakage, serving, MLOps
- Data Scientist: stats, SQL, experimentation, feature pitfalls
- Cloud / DevOps / SRE: IaC, CI/CD, observability, failure modes, cost
- System Architect: boundaries, scale, consistency, operability, trade-offs
- QA / SDET: strategy, automation, flaky tests, risk-based coverage
- Mobile: lifecycle, offline, perf, platform constraints
- Cybersecurity / Network: threat model, controls, diagnosis

Rules:
- Ask ONE NEW question you generate now — never copy a static bank
- Brief acknowledgment; correct gently if clearly wrong
- When instructed to complete the phase, say:
  "Solid technical round. Next: optimization and problem-solving. [PHASE_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [PHASE_COMPLETE].`,

  optimization: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: Optimization & Problem Solving (Phase 4 of 6)

Your job in this phase:
- Present realistic production bottlenecks for a {role} (latency, cost, scale, reliability, DX)
- Ask how they would measure, hypothesize, fix, and validate
- Force trade-offs: complexity vs speed, cost vs reliability, short-term vs long-term
- One quick follow-up on alternatives after their main answer is fine

Rules:
- Ask ONE question / scenario at a time
- When instructed to complete the phase, say:
  "Good thinking. Let's cover behavioural / leadership signals. [PHASE_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [PHASE_COMPLETE].
- Keep scenarios concrete and role-relevant`,

  behavioural: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: Behavioural / Leadership (Phase 5 of 6)

Ask these themes one at a time (MNC behavioural bar — STAR required):
1. Strengths with a concrete work example
2. Growth area they are actively improving
3. Motivation for this {role} / why this move now
4. 3–5 year direction and how this role fits
5. Conflict, ambiguity, or high-stakes delivery story (STAR)

Rules:
- Ask ONE question at a time in that order
- If answers are vague, push STAR: Situation → Task → Action → Result (with metrics if possible)
- When instructed to complete the phase, say:
  "Thanks. Last section: logistics and expectations. [PHASE_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [PHASE_COMPLETE].`,

  hr_logistics: `${MNC_BAR}
Role: {role} | Level: {level}

CURRENT PHASE: HR & Logistics (Phase 6 of 6 — Final)

Ask one at a time:
1. Notice period / earliest join date
2. Shift / on-call / timezone flexibility if relevant to {role}
3. Current and expected compensation (professional, non-judgmental)
4. Relocation / hybrid / remote constraints
5. Work-hour / travel flexibility

Rules:
- Ask ONE question at a time
- When instructed to complete the interview, say:
  "That's all from my side. Thank you for your time today.
   We'll review your interview and get back to you. It was great speaking with you! [INTERVIEW_COMPLETE]"
  CRITICAL: DO NOT ask any questions in the same message as [INTERVIEW_COMPLETE].`,
};

const EVAL_PROMPT = `Evaluate this structured mock interview for a {role} ({level}) position
using an MNC hiring-panel bar (Google / Amazon / Microsoft / Meta style).

The interview was conducted in 6 phases:
1. Self Introduction
2. Projects & Skills
3. Technical Questions
4. Optimization & Problem Solving
5. Behavioural Questions
6. HR & Logistics

Transcript:
{transcript}

Reply ONLY with valid JSON (no markdown, no extra text). Score each field from 1-10 where 10 is exceptional MNC hire bar:
{{
  "overall": <1-10>,
  "self_intro": <1-10>,
  "projects_skills": <1-10>,
  "technical": <1-10>,
  "optimization": <1-10>,
  "behavioural": <1-10>,
  "hr_logistics": <1-10>,
  "clarity": <1-10>,
  "communication": <1-10>,
  "confidence": <1-10>,
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "improvements": ["specific area 1", "specific area 2", "specific area 3"],
  "phase_feedback": {{
    "self_intro": "One specific sentence about how the candidate introduced themselves.",
    "projects_skills": "One specific sentence about the projects and skills they described.",
    "technical": "One specific sentence about their technical depth and accuracy.",
    "optimization": "One specific sentence about their problem-solving and optimization thinking.",
    "behavioural": "One specific sentence about their behavioural and situational answers.",
    "hr_logistics": "One specific sentence about their HR and logistics readiness."
  }},
  "summary": "3-4 sentences of personalized, detailed overall assessment referencing specific answers and hire recommendation tone."
}}`;

function getClient() {
  if (!GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

function formatHistoryForGemini(history) {
  const prior = history.slice(0, -1);
  return prior.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}

async function aiChat(system, history) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const client = getClient();
  const chatHistory = formatHistoryForGemini(history);
  const lastContent = history[history.length - 1]?.content || '';

  let lastErr = null;
  for (const modelName of MODELS) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
      });
      const chat = model.startChat({ history: chatHistory });
      const result = await chat.sendMessage(lastContent);
      const text = result.response.text();
      return (text || '').trim();
    } catch (e) {
      lastErr = e;
      if (!String(e).includes('429')) {
        throw e;
      }
    }
  }
  throw lastErr;
}

async function aiEvaluate(role, level, history) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const client = getClient();
  const transcript = history
    .map((m) => `${m.role === 'assistant' ? 'INTERVIEWER' : 'CANDIDATE'}: ${m.content}`)
    .join('\n');
  const prompt = EVAL_PROMPT.replace('{role}', role)
    .replace('{level}', level)
    .replace('{transcript}', transcript);

  let lastErr = null;
  for (const modelName of MODELS) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      let raw = (result.response.text() || '').trim();

      if (raw.startsWith('```')) {
        const parts = raw.split('```');
        raw = parts[1] || raw;
        if (raw.startsWith('json')) raw = raw.slice(4).trim();
      }
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
      if (!String(e).includes('429')) {
        throw e;
      }
    }
  }
  throw lastErr;
}

/** Free / MockBee short side — exactly N Gemini questions, then close. */
const BEE_SHORT_PROMPT = `${MNC_BAR}
Role: {role} | Level: {level}

MODE: MockBee short practice (FREE tier) — exactly {q_target} questions total.
This is the bee-side warm panel: sharp and MNC-flavoured, but short.

Your job:
- Ask exactly {q_target} role-specific questions (one at a time), generated now by you
- Mix: brief intro OR project probe, then technical / scenario depth
- Keep each question clear and interview-real — no FAQ dumps

Rules:
- Ask ONE question per turn
- After each answer: 1 short feedback sentence, then the next question (until done)
- When you have finished question {q_target} and received that answer (or when told the limit is reached), close with:
  "Great work — that wraps up this MockBee practice round. Review your report for feedback. [INTERVIEW_COMPLETE]"
  CRITICAL: DO NOT ask another question in the same message as [INTERVIEW_COMPLETE].
- Never run a full 6-round MNC panel in this mode — that is paid.`;

const QUICK_MODE_TARGETS = {
  bee: 5,
  '5-min': 5,
  rapid: 5,
  warmup: 3,
  '1-q': 1,
};

module.exports = {
  GEMINI_API_KEY,
  MODELS,
  PHASES,
  PHASE_Q_TARGETS,
  PHASE_PROMPTS,
  BEE_SHORT_PROMPT,
  QUICK_MODE_TARGETS,
  EVAL_PROMPT,
  aiChat,
  aiEvaluate,
};
