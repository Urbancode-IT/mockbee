/**
 * Enterprise interview configuration, evaluation, and report builders.
 */
const crypto = require('crypto');
const db = require('../config/db');
const mocker = require('./mocker');
const { DEMO_MODE } = require('../providers');

const DEFAULT_RUBRIC = {
  technical_correctness: 0.4,
  problem_solving: 0.25,
  relevance_completeness: 0.2,
  clarity: 0.15,
};

const PRESET_ROLES = [
  'MERN Stack Developer',
  'React Developer',
  'Node.js Developer',
  'Java Developer',
  'Python Developer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'Data Scientist',
  'DevOps Engineer',
];

const MEMORY_BANKS = new Map();
const MEMORY_INTERVIEWS = new Map();
const MEMORY_SESSIONS = new Map();

function tokenUrlsafe(nbytes = 12) {
  return crypto.randomBytes(nbytes).toString('base64url');
}

function nowIso() {
  return new Date().toISOString();
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizeRubric(input) {
  const src = input && typeof input === 'object' ? input : {};
  const rubric = {
    technical_correctness: clamp01(src.technical_correctness ?? DEFAULT_RUBRIC.technical_correctness),
    problem_solving: clamp01(src.problem_solving ?? DEFAULT_RUBRIC.problem_solving),
    relevance_completeness: clamp01(src.relevance_completeness ?? DEFAULT_RUBRIC.relevance_completeness),
    clarity: clamp01(src.clarity ?? DEFAULT_RUBRIC.clarity),
  };
  const sum =
    rubric.technical_correctness +
    rubric.problem_solving +
    rubric.relevance_completeness +
    rubric.clarity;
  if (sum <= 0) return { ...DEFAULT_RUBRIC };
  return {
    technical_correctness: rubric.technical_correctness / sum,
    problem_solving: rubric.problem_solving / sum,
    relevance_completeness: rubric.relevance_completeness / sum,
    clarity: rubric.clarity / sum,
  };
}

function defaultConfig(overrides = {}) {
  return {
    job_role: overrides.job_role || 'MERN Stack Developer',
    job_description: overrides.job_description || '',
    required_skills: Array.isArray(overrides.required_skills)
      ? overrides.required_skills
      : String(overrides.required_skills || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    experience_level: overrides.experience_level === 'experienced' ? 'experienced' : 'fresher',
    duration_minutes: Math.max(5, Math.min(180, Number(overrides.duration_minutes) || 45)),
    question_count: Math.max(1, Math.min(50, Number(overrides.question_count) || 8)),
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(overrides.difficulty)
      ? overrides.difficulty
      : 'mixed',
    passing_score: Math.max(0, Math.min(100, Number(overrides.passing_score) || 60)),
    randomize_questions: Boolean(overrides.randomize_questions),
    interview_mode: overrides.interview_mode === 'text' ? 'text' : 'voice',
    allow_follow_ups: overrides.allow_follow_ups !== false,
    max_follow_ups_per_question: Math.max(0, Math.min(3, Number(overrides.max_follow_ups_per_question) ?? 1)),
    instructions:
      overrides.instructions ||
      'Speak clearly, take a moment to think, and answer with concrete examples where possible.',
    evaluation_criteria:
      overrides.evaluation_criteria ||
      'Evaluate technical correctness, problem-solving, completeness, and clarity. Accept valid alternative solutions.',
    rubric: normalizeRubric(overrides.rubric),
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectQuestions(questions, config) {
  let pool = (questions || []).filter((q) => q && q.approved !== false && q.question);
  if (config.difficulty && config.difficulty !== 'mixed') {
    const filtered = pool.filter((q) => q.difficulty === config.difficulty);
    if (filtered.length) pool = filtered;
  }
  pool = [...pool].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (config.randomize_questions) pool = shuffle(pool);
  const count = Math.min(config.question_count || pool.length, pool.length);
  return pool.slice(0, count).map((q, i) => ({ ...q, order: i + 1 }));
}

function recommendationFromScore(pct, passingScore) {
  if (pct == null || Number.isNaN(pct)) return 'Incomplete';
  if (pct >= Math.max(passingScore + 15, 85)) return 'Strong';
  if (pct >= passingScore) return 'Meets Expectations';
  return 'Needs Improvement';
}

function resultStatus(pct, passingScore, incomplete) {
  if (incomplete) return 'incomplete';
  if (pct == null) return 'incomplete';
  return pct >= passingScore ? 'pass' : 'fail';
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function heuristicAnswerEval(question, answer, rubric) {
  const expected = question.expected_answer || question.evaluation_rubric || '';
  const answerTokens = new Set(tokenize(answer));
  const expectedTokens = tokenize(expected);
  const overlap =
    expectedTokens.length === 0
      ? Math.min(1, answerTokens.size / 12)
      : expectedTokens.filter((t) => answerTokens.has(t)).length / expectedTokens.length;

  const lengthScore = Math.min(1, tokenize(answer).length / 40);
  const hasContent = String(answer || '').trim().length >= 20;

  const technical = hasContent ? 0.35 + overlap * 0.55 + lengthScore * 0.1 : 0.15;
  const problemSolving = hasContent ? 0.3 + lengthScore * 0.4 + overlap * 0.3 : 0.1;
  const relevance = hasContent ? 0.25 + overlap * 0.6 + lengthScore * 0.15 : 0.1;
  const clarity = hasContent ? 0.4 + lengthScore * 0.45 : 0.15;

  const weights = normalizeRubric(rubric);
  const weighted =
    technical * weights.technical_correctness +
    problemSolving * weights.problem_solving +
    relevance * weights.relevance_completeness +
    clarity * weights.clarity;

  const maxMarks = Number(question.max_marks) || 10;
  const score = Math.round(weighted * maxMarks * 10) / 10;
  const pct = Math.round(weighted * 100);

  const missing = expectedTokens.filter((t) => !answerTokens.has(t)).slice(0, 6);
  return {
    scores: {
      technical_correctness: Math.round(technical * 100),
      problem_solving: Math.round(problemSolving * 100),
      relevance_completeness: Math.round(relevance * 100),
      clarity: Math.round(clarity * 100),
    },
    score,
    max_marks: maxMarks,
    percentage: pct,
    technical_accuracy_feedback: hasContent
      ? overlap > 0.45
        ? 'Answer covers several expected concepts.'
        : 'Answer is partial relative to the expected concepts.'
      : 'Answer was too short to assess technical accuracy.',
    missing_concepts: missing.length ? missing : expected ? ['Key expected concepts were not clearly covered'] : [],
    expected_concepts: expected || 'No admin-provided expected answer for this question.',
    strengths: hasContent
      ? ['Attempted a structured response', overlap > 0.4 ? 'Referenced relevant terminology' : 'Provided some relevant context'].filter(
          Boolean
        )
      : ['Candidate attempted the question'],
    improvements: hasContent
      ? [
          missing.length ? `Cover missing concepts: ${missing.slice(0, 3).join(', ')}` : 'Add concrete examples or edge cases',
          'Tighten structure: approach → solution → trade-offs',
        ]
      : ['Provide a fuller technical explanation'],
    explanation: `Heuristic semantic overlap score ${pct}% against admin expected concepts (demo/fallback evaluator).`,
    source: DEMO_MODE || !mocker.GEMINI_API_KEY ? 'heuristic' : 'heuristic',
    is_ai_generated_followup: Boolean(question.is_ai_followup),
    advisory: true,
  };
}

async function aiAnswerEval(question, answer, config) {
  const rubric = normalizeRubric(config.rubric);
  const maxMarks = Number(question.max_marks) || 10;
  const fallback = heuristicAnswerEval(question, answer, rubric);

  if (!mocker.GEMINI_API_KEY) {
    fallback.source = 'heuristic';
    fallback.demo_mode = true;
    fallback.explanation = `${fallback.explanation} GEMINI_API_KEY not configured — demo heuristic scoring.`;
    return fallback;
  }

  const prompt = `Evaluate this interview answer using semantic understanding (not exact keyword match).
Accept valid alternative solutions and equivalent technical terminology.
Do NOT penalize accent or minor grammar. Do NOT infer personality, honesty, intelligence, or suitability from appearance.

Job role: ${config.job_role}
Experience level: ${config.experience_level}
Question (admin-provided): ${question.question}
Category/Topic: ${question.category || ''} / ${question.topic || ''}
Expected answer / rubric (admin-provided): ${question.expected_answer || question.evaluation_rubric || '(none provided)'}
Max marks: ${maxMarks}
Candidate answer transcript: ${answer || '(empty)'}

Rubric weights (must sum to 1):
- technical_correctness: ${rubric.technical_correctness}
- problem_solving: ${rubric.problem_solving}
- relevance_completeness: ${rubric.relevance_completeness}
- clarity: ${rubric.clarity}

Reply ONLY valid JSON:
{
  "scores": {
    "technical_correctness": <0-100>,
    "problem_solving": <0-100>,
    "relevance_completeness": <0-100>,
    "clarity": <0-100>
  },
  "score": <number 0-${maxMarks}>,
  "percentage": <0-100>,
  "technical_accuracy_feedback": "1-2 sentences",
  "missing_concepts": ["..."],
  "expected_concepts": "short summary of expected ideas",
  "strengths": ["..."],
  "improvements": ["..."],
  "explanation": "evidence-based reason for the score",
  "ask_follow_up": <true|false>,
  "follow_up_question": "optional relevant follow-up or empty string"
}`;

  try {
    let reply = await mocker.aiChat(
      'You are a fair enterprise interview evaluator. Reply with JSON only. Assessments are advisory.',
      [{ role: 'user', content: prompt }]
    );
    let cleaned = reply.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);
    const scores = parsed.scores || {};
    const weighted =
      (Number(scores.technical_correctness) || 0) * rubric.technical_correctness +
      (Number(scores.problem_solving) || 0) * rubric.problem_solving +
      (Number(scores.relevance_completeness) || 0) * rubric.relevance_completeness +
      (Number(scores.clarity) || 0) * rubric.clarity;
    const percentage = Math.round(
      Number.isFinite(Number(parsed.percentage)) ? Number(parsed.percentage) : weighted
    );
    const score = Number.isFinite(Number(parsed.score))
      ? Number(parsed.score)
      : Math.round((percentage / 100) * maxMarks * 10) / 10;

    return {
      scores: {
        technical_correctness: Math.round(Number(scores.technical_correctness) || 0),
        problem_solving: Math.round(Number(scores.problem_solving) || 0),
        relevance_completeness: Math.round(Number(scores.relevance_completeness) || 0),
        clarity: Math.round(Number(scores.clarity) || 0),
      },
      score,
      max_marks: maxMarks,
      percentage,
      technical_accuracy_feedback: parsed.technical_accuracy_feedback || fallback.technical_accuracy_feedback,
      missing_concepts: Array.isArray(parsed.missing_concepts) ? parsed.missing_concepts : fallback.missing_concepts,
      expected_concepts: parsed.expected_concepts || fallback.expected_concepts,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : fallback.strengths,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : fallback.improvements,
      explanation: parsed.explanation || fallback.explanation,
      ask_follow_up: Boolean(parsed.ask_follow_up),
      follow_up_question: String(parsed.follow_up_question || '').trim(),
      source: 'gemini',
      demo_mode: false,
      advisory: true,
      is_ai_generated_followup: Boolean(question.is_ai_followup),
    };
  } catch (_) {
    fallback.source = 'heuristic';
    fallback.demo_mode = DEMO_MODE;
    fallback.explanation = `${fallback.explanation} AI evaluation unavailable — used heuristic fallback.`;
    return fallback;
  }
}

function buildReport(session, interview) {
  const config = interview?.config || defaultConfig();
  const answers = session.answers || [];
  const incomplete = Boolean(session.incomplete) || answers.some((a) => !a.evaluation);
  let obtained = 0;
  let maxTotal = 0;
  const categoryMap = {};

  for (const a of answers) {
    const ev = a.evaluation || {};
    const maxM = Number(ev.max_marks || a.question?.max_marks || 10);
    const sc = Number(ev.score || 0);
    obtained += sc;
    maxTotal += maxM;
    const cat = a.question?.category || a.question?.topic || 'General';
    if (!categoryMap[cat]) categoryMap[cat] = { obtained: 0, max: 0, count: 0 };
    categoryMap[cat].obtained += sc;
    categoryMap[cat].max += maxM;
    categoryMap[cat].count += 1;
  }

  const percentage = maxTotal > 0 ? Math.round((obtained / maxTotal) * 100) : null;
  const passing = config.passing_score;
  const recommendation = recommendationFromScore(percentage, passing);
  const status = resultStatus(percentage, passing, incomplete);

  const strengths = [];
  const improvements = [];
  for (const a of answers) {
    for (const s of a.evaluation?.strengths || []) if (strengths.length < 6) strengths.push(s);
    for (const s of a.evaluation?.improvements || []) if (improvements.length < 6) improvements.push(s);
  }

  return {
    interview_id: interview?._id || session.interview_id,
    session_id: session.id,
    candidate_name: session.candidate_name,
    candidate_email: session.candidate_email,
    job_role: config.job_role,
    interview_date: session.started_at || session.saved_at,
    duration_seconds: session.duration_seconds || null,
    total_score: Math.round(obtained * 10) / 10,
    max_score: maxTotal,
    percentage,
    passing_score: passing,
    result_status: status,
    recommendation,
    incomplete,
    advisory_notice:
      'AI assessments are advisory. Human reviewers may override scores. Do not treat incomplete evaluations as a pass.',
    rubric: config.rubric,
    category_performance: Object.entries(categoryMap).map(([name, v]) => ({
      category: name,
      obtained: Math.round(v.obtained * 10) / 10,
      max: v.max,
      percentage: v.max ? Math.round((v.obtained / v.max) * 100) : null,
      question_count: v.count,
    })),
    technical_strengths: [...new Set(strengths)],
    areas_for_improvement: [...new Set(improvements)],
    question_wise: answers.map((a, i) => ({
      index: i + 1,
      question: a.question?.question,
      category: a.question?.category,
      topic: a.question?.topic,
      source: a.question?.source || 'admin_upload',
      is_ai_followup: Boolean(a.question?.is_ai_followup),
      transcript: a.transcript || a.answer || '',
      evaluation: a.evaluation || null,
      human_override: a.human_override || null,
    })),
    human_reviewer_notes: session.human_reviewer_notes || '',
    override_history: session.override_history || [],
    demo_mode: Boolean(session.demo_mode) || DEMO_MODE,
    source: answers.find((a) => a.evaluation?.source === 'gemini') ? 'gemini' : 'heuristic',
  };
}

async function saveBank(doc) {
  try {
    await (await db.col('enterprise_question_banks')).updateOne(
      { _id: doc._id },
      { $set: doc },
      { upsert: true }
    );
  } catch (_) {
    MEMORY_BANKS.set(doc._id, doc);
  }
  return doc;
}

async function getBank(id) {
  try {
    const doc = await (await db.col('enterprise_question_banks')).findOne({ _id: id });
    if (doc) return doc;
  } catch (_) {
    /* fall through */
  }
  return MEMORY_BANKS.get(id) || null;
}

async function listBanks({ adminEmail } = {}) {
  try {
    const query = adminEmail ? { admin_email: adminEmail } : {};
    return await (await db.col('enterprise_question_banks')).find(query).sort({ updated_at: -1 }).toArray();
  } catch (_) {
    return [...MEMORY_BANKS.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
}

async function saveInterview(doc) {
  try {
    await (await db.col('enterprise_interviews')).updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
  } catch (_) {
    MEMORY_INTERVIEWS.set(doc._id, doc);
  }
  return doc;
}

async function getInterview(id) {
  try {
    const doc = await (await db.col('enterprise_interviews')).findOne({ _id: id });
    if (doc) return doc;
  } catch (_) {
    /* fall through */
  }
  return MEMORY_INTERVIEWS.get(id) || null;
}

async function listInterviews() {
  try {
    return await (await db.col('enterprise_interviews')).find({}).sort({ updated_at: -1 }).toArray();
  } catch (_) {
    return [...MEMORY_INTERVIEWS.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
}

async function saveSession(doc) {
  try {
    await (await db.col('interview_sessions')).updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
  } catch (_) {
    MEMORY_SESSIONS.set(doc.id, doc);
  }
  return doc;
}

async function getSession(id) {
  try {
    const doc = await (await db.col('interview_sessions')).findOne({ id });
    if (doc) return doc;
  } catch (_) {
    /* fall through */
  }
  return MEMORY_SESSIONS.get(id) || null;
}

async function buildAnalytics() {
  let sessions = [];
  let interviews = [];
  try {
    sessions = await (await db.col('interview_sessions')).find({}).toArray();
  } catch (_) {
    sessions = [...MEMORY_SESSIONS.values()];
  }
  try {
    interviews = await listInterviews();
  } catch (_) {
    interviews = [];
  }

  const enterprise = sessions.filter((s) => s.mode === 'enterprise' || s.interview_id);
  const scored = sessions.filter((s) => typeof s.score === 'number');
  const completed = sessions.filter((s) => s.status === 'completed' || s.analysis || typeof s.score === 'number');
  const scheduled = interviews.filter((i) => i.status === 'published' || i.status === 'scheduled').length;
  const avg =
    scored.length > 0 ? Math.round(scored.reduce((a, s) => a + Number(s.score), 0) / scored.length) : null;

  const roleMap = {};
  const skillMap = {};
  for (const s of sessions) {
    const role = s.role || s.job_role || 'Unknown';
    if (!roleMap[role]) roleMap[role] = { role, count: 0, totalScore: 0, scored: 0 };
    roleMap[role].count += 1;
    if (typeof s.score === 'number') {
      roleMap[role].totalScore += s.score;
      roleMap[role].scored += 1;
    }
    const skills = s.required_skills || s.analysis?.skills || [];
    for (const sk of skills) {
      const key = String(sk);
      if (!skillMap[key]) skillMap[key] = { skill: key, count: 0 };
      skillMap[key].count += 1;
    }
  }

  const recent = [...sessions]
    .sort((a, b) => String(b.saved_at || b.date || '').localeCompare(String(a.saved_at || a.date || '')))
    .slice(0, 12)
    .map((s) => ({
      id: s.id,
      candidate_name: s.candidate_name || s.user_email,
      role: s.role,
      score: s.score,
      date: s.date || s.saved_at,
      status: s.status || (s.score != null ? 'completed' : 'in_progress'),
      mode: s.mode || 'mock',
      interview_id: s.interview_id || null,
    }));

  return {
    total_interviews_conducted: sessions.length,
    enterprise_sessions: enterprise.length,
    scheduled_interviews: scheduled,
    completed_interviews: completed.length,
    average_score: avg,
    published_interview_templates: interviews.filter((i) => i.status === 'published').length,
    role_wise: Object.values(roleMap).map((r) => ({
      role: r.role,
      count: r.count,
      average_score: r.scored ? Math.round(r.totalScore / r.scored) : null,
    })),
    skill_wise: Object.values(skillMap).sort((a, b) => b.count - a.count).slice(0, 20),
    recent_interviews: recent,
    candidate_performance: scored
      .slice()
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 10)
      .map((s) => ({
        candidate: s.candidate_name || s.user_email,
        role: s.role,
        score: s.score,
        date: s.date || s.saved_at,
        session_id: s.id,
      })),
  };
}

module.exports = {
  DEFAULT_RUBRIC,
  PRESET_ROLES,
  DEMO_MODE,
  tokenUrlsafe,
  nowIso,
  defaultConfig,
  normalizeRubric,
  selectQuestions,
  heuristicAnswerEval,
  aiAnswerEval,
  buildReport,
  recommendationFromScore,
  saveBank,
  getBank,
  listBanks,
  saveInterview,
  getInterview,
  listInterviews,
  saveSession,
  getSession,
  buildAnalytics,
};
