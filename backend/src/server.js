/**
 * MockBee API — Express (port 8001)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const db = require('./config/db');
const emailService = require('./services/emailService');
const mocker = require('./services/mocker');
const excelInterview = require('./services/excelInterview');
const codingInterview = require('./services/codingInterview');
const questionBank = require('./services/questionBank');
const enterprise = require('./services/enterpriseInterview');
const reportExport = require('./services/reportExport');
const auditLog = require('./services/auditLog');
const providers = require('./providers');
const tts = require('./services/tts');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const ADMIN_DEFAULT_USERNAME = process.env.MOCKBEE_ADMIN_USERNAME || 'admin';
const ADMIN_DEFAULT_PASSWORD = process.env.MOCKBEE_ADMIN_PASSWORD || 'mockb@urban';

// ── Load question banks ──────────────────────────────────────────────────────
let CUSTOM_QUESTIONS = {};
try {
  CUSTOM_QUESTIONS = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'prep_questions', 'interview_question_bank.json'), 'utf8')
  );
} catch (_) {
  CUSTOM_QUESTIONS = {};
}

const COMPANY_PREP_COMPANIES = new Set(['google', 'amazon', 'meta']);
const COMPANY_QA_FILES = {
  amazon: 'from_amazon.json',
  google: 'from_google.json',
  meta: 'from_meta.json',
};

function httpError(res, status, detail) {
  return res.status(status).json({ detail });
}

function normaliseEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isStudentRole(role) {
  return role === 'STUDENT' || role === 'PREMIUM';
}

function tokenUrlsafe(nbytes = 16) {
  return crypto.randomBytes(nbytes).toString('base64url');
}

async function ensureAdminUser() {
  const users = await db.col('users');
  let admin = await users.findOne({ role: 'ADMIN' });
  if (admin) {
    if (!admin.admin_token) {
      await users.updateOne({ _id: admin._id }, { $set: { admin_token: tokenUrlsafe(32) } });
      admin = await users.findOne({ _id: admin._id });
    }
    return admin;
  }

  const adminId = normaliseEmail(ADMIN_DEFAULT_USERNAME);
  const adminDoc = {
    _id: adminId,
    name: 'Admin',
    username: ADMIN_DEFAULT_USERNAME,
    password: ADMIN_DEFAULT_PASSWORD,
    role: 'ADMIN',
    admin_token: tokenUrlsafe(32),
    created_by: 'system',
    created_at: db.now(),
    last_seen: db.now(),
  };
  await users.updateOne({ _id: adminId }, { $setOnInsert: adminDoc }, { upsert: true });
  return users.findOne({ _id: adminId });
}

async function requireAdmin(token) {
  await ensureAdminUser();
  if (!token) return false;
  const found = await (await db.col('users')).findOne({ role: 'ADMIN', admin_token: token });
  return Boolean(found);
}

function publicUserPayload(user, isAdmin = false) {
  const role = user.role || 'PUBLIC';
  return {
    status: 'success',
    name: user.name,
    email: user._id,
    is_admin: isAdmin,
    role: role === 'PREMIUM' ? 'STUDENT' : role,
    is_student: isStudentRole(role),
    admin_token: isAdmin ? user.admin_token : null,
  };
}

function normalisePrepItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return {
      id: item.id ?? null,
      year: item.year ?? null,
      company: String(item.company || '').trim(),
      category: String(item.category || item.topic || 'General').trim() || 'General',
      question: String(item.question || item.q || '').trim(),
      answer: String(item.answer || item.a || '').trim(),
      difficulty: String(item.difficulty || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
    };
  }
  return {
    id: null,
    year: null,
    company: '',
    category: 'General',
    question: String(item).trim(),
    answer: '',
    difficulty: '',
    tags: [],
  };
}

function loadCompanyPrepBank(company) {
  const filename = COMPANY_QA_FILES[String(company || '').toLowerCase()];
  const topics = {};
  if (!filename) return topics;

  const qaPath = path.join(__dirname, '..', 'data', 'company_qa', filename);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  } catch (_) {
    return topics;
  }
  if (!Array.isArray(data)) return topics;

  for (const item of data) {
    const normalised = normalisePrepItem(item);
    if (!normalised.question) continue;
    const category = normalised.category;
    if (!topics[category]) topics[category] = [];
    topics[category].push(normalised);
  }
  return topics;
}

// ── In-memory fallbacks ──────────────────────────────────────────────────────
const EXCEL_BANKS_MEMORY = {};
const CODING_BANKS_MEMORY = {};

async function saveExcelBank(doc) {
  try {
    await (await db.col('excel_question_banks')).insertOne(doc);
  } catch (_) {
    EXCEL_BANKS_MEMORY[doc._id] = doc;
  }
}

async function getExcelBank(bankId) {
  if (EXCEL_BANKS_MEMORY[bankId]) return EXCEL_BANKS_MEMORY[bankId];
  try {
    return await (await db.col('excel_question_banks')).findOne({ _id: bankId });
  } catch (_) {
    return null;
  }
}

async function saveCodingBank(doc) {
  try {
    await (await db.col('coding_question_banks')).insertOne(doc);
  } catch (_) {
    /* ignore */
  }
  CODING_BANKS_MEMORY[doc._id] = doc;
}

async function getCodingBank(bankId) {
  if (CODING_BANKS_MEMORY[bankId]) return CODING_BANKS_MEMORY[bankId];
  try {
    return await (await db.col('coding_question_banks')).findOne({ _id: bankId });
  } catch (_) {
    return null;
  }
}

async function updateCodingBank(bankId, patch) {
  const doc = await getCodingBank(bankId);
  if (!doc) return null;
  Object.assign(doc, patch || {});
  CODING_BANKS_MEMORY[bankId] = doc;
  try {
    await (await db.col('coding_question_banks')).updateOne({ _id: bankId }, { $set: patch }, { upsert: true });
  } catch (_) {
    /* ignore */
  }
  return doc;
}

function publicCodingQuestions(questions) {
  const publicQs = [];
  for (const q of questions || []) {
    const tests = q.tests || [];
    let isCoding = q.is_coding;
    if (isCoding == null) {
      if (!tests.length) {
        isCoding = false;
      } else if (
        tests.length === 1 &&
        String(tests[0].input || '').trim() === 'hello' &&
        String(tests[0].expected || '').trim() === 'hello'
      ) {
        isCoding = false;
      } else {
        isCoding = true;
      }
    }
    publicQs.push({
      id: q.id,
      question: q.question,
      language: q.language || (isCoding ? 'python' : 'text'),
      starter_code: isCoding ? q.starter_code || '' : '',
      sample_tests: isCoding
        ? tests.slice(0, 2).map((t, i) => ({ index: i + 1, input: t.input || '' }))
        : [],
      test_count: isCoding ? tests.length : 0,
      is_coding: Boolean(isCoding),
    });
  }
  return publicQs;
}

function buildXlsxBuffer(sheetName, rows, colWidths) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) {
    ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email: rawEmail, password } = req.body || {};
    const users = await db.col('users');
    const email = normaliseEmail(rawEmail);
    const user = await users.findOne({ _id: email });
    if (user) return httpError(res, 400, 'Account already exists. Try logging in.');
    await db.upsertUser(email, String(name || '').trim(), 'PUBLIC');
    await users.updateOne({ _id: email }, { $set: { password } });
    emailService.sendWelcomeEmail(email, String(name || '').trim()).catch(() => {});
    return res.json({
      status: 'success',
      message: 'Account created',
      email,
      name: String(name || '').trim(),
      role: 'PUBLIC',
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const users = await db.col('users');
    await ensureAdminUser();
    const identifier = String((req.body || {}).email || '').trim();
    const identifierLc = identifier.toLowerCase();
    const password = (req.body || {}).password;

    let candidates;
    if (identifierLc.includes('@')) {
      candidates = await users.find({ _id: identifierLc }).toArray();
    } else {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      candidates = await users
        .find({
          $or: [
            { username: { $regex: `^${escaped}$`, $options: 'i' } },
            { name: { $regex: `^${escaped}$`, $options: 'i' } },
          ],
        })
        .toArray();
    }

    if (!candidates.length) {
      return httpError(res, 400, 'No account found with this email or username.');
    }

    const passwordMatches = candidates.filter((u) => u.password === password);
    if (!passwordMatches.length) {
      return httpError(res, 400, 'Incorrect password.');
    }

    if (!identifierLc.includes('@') && passwordMatches.length > 1) {
      return httpError(
        res,
        409,
        'Multiple users match that username and password. Please log in with your email address.'
      );
    }

    const user = passwordMatches[0];
    await users.updateOne({ _id: user._id }, { $set: { last_seen: db.now() } });
    return res.json(publicUserPayload(user, user.role === 'ADMIN'));
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/oauth-login', async (req, res) => {
  try {
    const body = req.body || {};
    const email = normaliseEmail(body.email);
    if (!email || !email.includes('@')) {
      return httpError(res, 400, 'A valid email is required for social login.');
    }

    const provider = String(body.provider || 'google')
      .trim()
      .toLowerCase();
    const name = String(body.name || email.split('@')[0]).trim();
    const users = await db.col('users');
    let existing = await users.findOne({ _id: email });

    if (existing && existing.role === 'ADMIN') {
      return httpError(res, 400, 'Admin accounts must use password login.');
    }

    if (!existing) {
      await db.upsertUser(email, name, 'PUBLIC');
      await users.updateOne(
        { _id: email },
        { $set: { auth_provider: provider, password: `oauth:${provider}:${email}` } }
      );
      existing = await users.findOne({ _id: email });
      emailService.sendWelcomeEmail(email, name).catch(() => {});
    } else {
      await users.updateOne(
        { _id: email },
        {
          $set: {
            last_seen: db.now(),
            auth_provider: existing.auth_provider || provider,
          },
        }
      );
      existing = await users.findOne({ _id: email });
    }

    return res.json(publicUserPayload(existing, false));
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  INTERVIEW
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/interview/chat', async (req, res) => {
  try {
    const body = req.body || {};
    let phase = body.phase || 'self_intro';
    const role = body.role;
    const level = body.level;
    const history = body.history || [];
    const questionsInPhase = body.questions_in_phase || 0;
    const mode = String(body.mode || 'standard').toLowerCase();
    const quickTarget = mocker.QUICK_MODE_TARGETS[mode];

    let systemPrompt;
    if (phase === 'pro_feedback') {
      systemPrompt = `You are an expert technical interviewer providing concise feedback.
Role: ${role} | Level: ${level}

The candidate has just answered a technical or behavioural question.
Your job:
- Provide a brief 1-2 sentence feedback on their last answer.
- Praise strong points or highlight what is missing.
- CRITICAL: DO NOT ask any new questions. ONLY provide feedback on their answer.
`;
    } else if (quickTarget) {
      // Free MockBee / quick side — hard cap (default 5). Full MNC panel is paid.
      systemPrompt = mocker.BEE_SHORT_PROMPT
        .replace(/\{role\}/g, role)
        .replace(/\{level\}/g, level)
        .replace(/\{q_target\}/g, String(quickTarget));

      if (history.length > 1) {
        systemPrompt +=
          '\n\nCRITICAL INSTRUCTION: First give brief constructive feedback on the last answer, then continue.';
      }
      if (questionsInPhase >= quickTarget) {
        systemPrompt +=
          `\n\nCRITICAL: You already asked ${quickTarget} questions. DO NOT ask another. Feedback only, then close with [INTERVIEW_COMPLETE].`;
      } else {
        systemPrompt +=
          `\n\nPROGRESS: ${questionsInPhase} of ${quickTarget} questions asked. Ask exactly ONE new question now (Gemini-generated, role-specific).`;
      }
    } else {
      if (!mocker.PHASES.includes(phase)) phase = 'self_intro';
      const qTarget = mocker.PHASE_Q_TARGETS[phase];
      systemPrompt = mocker.PHASE_PROMPTS[phase]
        .replace(/\{role\}/g, role)
        .replace(/\{level\}/g, level)
        .replace(/\{q_target\}/g, String(qTarget));

      if (history.length > 1) {
        systemPrompt +=
          '\n\nCRITICAL INSTRUCTION: First, carefully analyze the candidate\'s last answer and provide brief, constructive feedback before moving to the next point.';
      }

      if (questionsInPhase >= qTarget) {
        systemPrompt +=
          '\n\nCRITICAL INSTRUCTION: You have reached the required number of questions for this phase. DO NOT ask any more questions. ONLY provide your feedback on their last answer (if applicable), state your transition sentence, and end with [PHASE_COMPLETE].';
      } else {
        systemPrompt += `\n\nPROGRESS: You have asked ${questionsInPhase} questions out of ${qTarget} in this phase. You MUST ask exactly ONE new question now.`;
      }

      // Questions are generated live by Gemini (MNC bar) — do NOT inject static bank questions.

      if (phase !== 'self_intro') {
        systemPrompt +=
          '\n\nCRITICAL RULE: DO NOT ask the candidate to introduce themselves or ask for their background. That was already done. Focus ONLY on your current phase.';
      }

      systemPrompt +=
        '\n\nMNC INTERVIEW BAR: Conduct this exactly like a hiring panel at Google, Amazon, Microsoft, Meta, or a similar product MNC. ' +
        'Ask fresh, role-specific questions generated for THIS candidate and THIS turn. ' +
        'No generic textbook quizzes, no recycled FAQ lists, no repeating earlier questions. ' +
        'Probe depth with follow-ups when answers are shallow. Prefer real production scenarios, trade-offs, and ownership.';
    }

    const reply = await mocker.aiChat(systemPrompt, history);
    return res.json({ status: 'success', reply });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/interview/evaluate', async (req, res) => {
  try {
    const body = req.body || {};
    const evaluation = await mocker.aiEvaluate(body.role, body.level, body.history || []);
    return res.json({ status: 'success', evaluation });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/interview/save', async (req, res) => {
  try {
    const body = req.body || {};
    const col = await db.col('interview_sessions');
    const userEmail = normaliseEmail(body.email);
    const quickModes = new Set(['1-q', '5-min', 'rapid', 'warmup']);
    const isQuick =
      body.isQuick != null ? body.isQuick : quickModes.has(body.mode);
    const isPro = body.isPro != null ? body.isPro : !isQuick;
    const doc = {
      user_email: userEmail,
      role: body.role,
      mode: body.mode,
      date: body.date,
      score: body.score,
      analysis: body.analysis || {},
      transcript: body.transcript,
      conversationHistory: body.conversationHistory || [],
      totalQuestions: body.totalQuestions,
      isQuick,
      isPro,
      topic: body.topic,
      saved_at: db.now(),
      id: body.session_id || String(Date.now()),
    };

    await col.updateOne({ user_email: userEmail, id: doc.id }, { $set: doc }, { upsert: true });

    if (body.analysis && body.score != null) {
      const users = await db.col('users');
      const user = (await users.findOne({ _id: userEmail })) || {};
      const sentReportIds = user.report_email_session_ids || [];
      const shouldSend = !sentReportIds.includes(doc.id);
      if (shouldSend) {
        const event = await emailService.sendInterviewReportEmail(userEmail, user.name || '', doc);
        if (event.status === 'sent' || event.status === 'skipped') {
          await users.updateOne(
            { _id: userEmail },
            {
              $addToSet: { report_email_session_ids: doc.id },
              $set: { last_report_email_at: db.now() },
            }
          );
        }
      }
    }
    return res.json({ status: 'success', message: 'Performance saved to DB' });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/interview/history', async (req, res) => {
  try {
    const email = req.query.email;
    const docs = await (await db.col('interview_sessions'))
      .find({ user_email: email }, { projection: { _id: 0 } })
      .sort({ saved_at: -1 })
      .toArray();
    return res.json({ status: 'success', history: docs });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/email/task-completed', async (req, res) => {
  try {
    const body = req.body || {};
    const email = normaliseEmail(body.email);
    const user = await (await db.col('users')).findOne({ _id: email });
    if (!user) return httpError(res, 404, 'User not found');
    const event = await emailService.sendTaskCompletionEmail(
      email,
      user.name || '',
      body.task_name,
      body.detail || ''
    );
    return res.json({ status: 'success', email_status: event.status });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/admin/email/reminders', async (req, res) => {
  try {
    const key = req.query.key;
    const inactiveDays = Number(req.query.inactive_days ?? 7);
    const limit = Number(req.query.limit ?? 100);

    if (!(await requireAdmin(key))) return httpError(res, 403, 'Unauthorized');
    if (inactiveDays < 1) return httpError(res, 400, 'inactive_days must be at least 1');

    const cutoff = new Date(emailService.utcNow().getTime() - inactiveDays * 24 * 60 * 60 * 1000);
    const users = await db.col('users');
    const candidates = await users
      .find({ role: { $ne: 'ADMIN' } }, { projection: { password: 0 } })
      .limit(Math.max(1, Math.min(limit, 500)))
      .toArray();
    const results = [];

    for (const user of candidates) {
      const email = user._id;
      const lastSeen = emailService.parseDbDatetime(user.last_seen || user.created_at);
      if (!lastSeen || lastSeen > cutoff) continue;

      const lastReminder = emailService.parseDbDatetime(user.last_inactivity_reminder_at);
      if (lastReminder && lastReminder > cutoff) continue;

      const inactiveFor = Math.max(
        inactiveDays,
        Math.floor((emailService.utcNow() - lastSeen) / (24 * 60 * 60 * 1000))
      );
      const event = await emailService.sendInactivityReminderEmail(email, user.name || '', inactiveFor);
      if (event.status === 'sent' || event.status === 'skipped') {
        await users.updateOne({ _id: email }, { $set: { last_inactivity_reminder_at: db.now() } });
      }
      results.push({ email, status: event.status });
    }

    return res.json({
      status: 'success',
      checked: candidates.length,
      queued: results.length,
      results,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/company-prep/questions', (req, res) => {
  try {
    const company = req.query.company || 'Google';
    const topic = req.query.topic;
    if (!COMPANY_PREP_COMPANIES.has(String(company).toLowerCase())) {
      return httpError(res, 404, 'Company prep is available for Google, Amazon, and Meta.');
    }

    let topics = loadCompanyPrepBank(company);
    if (topic) {
      const matchedKey = Object.keys(topics).find((key) => key.toLowerCase() === String(topic).toLowerCase());
      if (!matchedKey) return httpError(res, 404, 'No questions found for this topic.');
      topics = { [matchedKey]: topics[matchedKey] };
    }

    const totalQuestions = Object.values(topics).reduce((sum, items) => sum + items.length, 0);
    return res.json({
      status: 'success',
      company,
      topics,
      topic_count: Object.keys(topics).length,
      question_count: totalQuestions,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  EXCEL INTERVIEW
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/excel-interview/template', (_req, res) => {
  const rows = [
    ['Question', 'Role', 'Category'],
    ['Tell me about yourself and why you are interested in this role.', 'Python Developer', 'Introduction'],
    ['Explain the difference between a list and a tuple in Python.', 'Python Developer', 'Technical'],
    [
      'Describe a challenging bug you fixed recently. How did you approach it?',
      'Python Developer',
      'Behavioural',
    ],
    ['How would you optimise a slow API endpoint?', 'Python Developer', 'Problem Solving'],
    ['Do you have any questions for us?', 'Python Developer', 'Closing'],
  ];
  const buf = buildXlsxBuffer('Questions', rows, [80, 22, 18]);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="mockbee_interview_questions.xlsx"');
  return res.send(buf);
});

app.post('/api/excel-interview/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const title = req.body.title || 'Custom AI Interview';
    const email = req.body.email || '';
    const filename = (file && file.originalname) || 'questions.xlsx';

    if (!file) return httpError(res, 400, 'Please upload an .xlsx or .csv file.');
    if (!filename.toLowerCase().match(/\.(xlsx|xlsm|csv)$/)) {
      return httpError(res, 400, 'Please upload an .xlsx or .csv file.');
    }
    if (!file.buffer || !file.buffer.length) {
      return httpError(res, 400, 'Uploaded file is empty.');
    }

    let questions;
    try {
      questions = excelInterview.parseQuestionFile(
        filename,
        file.buffer,
        String(title).trim() || 'Custom Interview'
      );
    } catch (exc) {
      return httpError(res, 400, `Could not read the sheet: ${exc.message || exc}`);
    }

    if (!questions.length) {
      return httpError(
        res,
        400,
        "No questions found. Add a 'Question' column (or put one question per row in column A)."
      );
    }

    const bankId = tokenUrlsafe(10);
    const doc = {
      _id: bankId,
      title: (title || 'Custom AI Interview').trim() || 'Custom AI Interview',
      email: email ? normaliseEmail(email) : '',
      filename,
      questions,
      question_count: questions.length,
      created_at: db.now(),
    };
    await saveExcelBank(doc);
    EXCEL_BANKS_MEMORY[bankId] = doc;

    return res.json({
      status: 'success',
      bank_id: bankId,
      title: doc.title,
      question_count: questions.length,
      questions,
      interview_path: `/interview/excel/${bankId}`,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/excel-interview/:bankId', async (req, res) => {
  try {
    const doc = await getExcelBank(req.params.bankId);
    if (!doc) {
      return httpError(res, 404, 'Interview question set not found. Please upload the Excel sheet again.');
    }
    return res.json({
      status: 'success',
      bank_id: req.params.bankId,
      title: doc.title || 'Custom AI Interview',
      question_count: doc.question_count || (doc.questions || []).length,
      questions: doc.questions || [],
      created_at: doc.created_at,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CODING INTERVIEW
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/coding-interview/template', (_req, res) => {
  const sampleTests = JSON.stringify([
    { input: '2 3', expected: '5' },
    { input: '10 15', expected: '25' },
  ]);
  const sampleCode =
    'import sys\n' + 'a, b = map(int, sys.stdin.read().split())\n' + 'print(a + b)\n';
  const rows = [
    ['Question', 'Language', 'StarterCode', 'Tests'],
    [
      'Write a program that reads two integers and prints their sum.',
      'python',
      sampleCode,
      sampleTests,
    ],
    [
      'Read a string and print it reversed.',
      'python',
      'import sys\ns = sys.stdin.read().strip()\nprint(s[::-1])\n',
      JSON.stringify([
        { input: 'hello', expected: 'olleh' },
        { input: 'ai', expected: 'ia' },
      ]),
    ],
  ];
  const buf = buildXlsxBuffer('CodingQuestions', rows, [70, 12, 40, 50]);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="mockbee_coding_questions.xlsx"');
  return res.send(buf);
});

app.post('/api/coding-interview/upload', upload.single('file'), async (req, res) => {
  try {
    let cleanTitle = String(req.body.title || 'Coding AI Interview').trim();
    if (cleanTitle.length > 80 || cleanTitle.slice(0, 40).includes(',')) {
      cleanTitle = 'Coding AI Interview';
    }
    cleanTitle = cleanTitle.slice(0, 80) || 'Coding AI Interview';

    const introOn = ['1', 'true', 'yes', 'on'].includes(
      String(req.body.self_intro_enabled || 'true')
        .trim()
        .toLowerCase()
    );
    const introPrompt = 'Please introduce yourself.';
    const email = req.body.email || '';
    const manualQuestionsRaw = req.body.manual_questions || '';

    let fileQuestions = [];
    let manualList = [];
    let filename = 'manual';
    let kind = 'coding';

    const file = req.file;
    if (file && file.originalname) {
      filename = file.originalname || 'coding.xlsx';
      if (!filename.toLowerCase().match(/\.(xlsx|xlsm|csv)$/)) {
        return httpError(res, 400, 'Please upload an .xlsx or .csv file.');
      }
      if (!file.buffer || !file.buffer.length) {
        return httpError(res, 400, 'Uploaded file is empty.');
      }

      kind = codingInterview.detectSheetKind(filename, file.buffer);
      if (kind === 'mcq') {
        try {
          fileQuestions = codingInterview.parseMcqFile(filename, file.buffer, cleanTitle);
        } catch (exc) {
          return httpError(res, 400, `Could not read MCQ sheet: ${exc.message || exc}`);
        }
        fileQuestions = fileQuestions.map((q) => ({
          ...q,
          is_coding: false,
          language: 'text',
          starter_code: '',
          tests: [],
        }));
      } else {
        try {
          fileQuestions = codingInterview.parseCodingFile(filename, file.buffer);
        } catch (exc) {
          return httpError(res, 400, `Could not read the sheet: ${exc.message || exc}`);
        }
        kind = 'coding';
      }
    }

    if (String(manualQuestionsRaw || '').trim()) {
      try {
        const parsed = JSON.parse(manualQuestionsRaw);
        if (!Array.isArray(parsed)) throw new Error('manual_questions must be a JSON array');
        manualList = codingInterview.normalizeManualQuestions(parsed);
      } catch (exc) {
        return httpError(res, 400, `Invalid manual questions: ${exc.message || exc}`);
      }
    }

    const questions = [];
    for (const q of [...fileQuestions, ...manualList]) {
      const copy = { ...q, id: questions.length + 1 };
      questions.push(copy);
    }

    if (!questions.length) {
      return httpError(
        res,
        400,
        'Add at least one coding question manually, or upload an Excel/CSV file.'
      );
    }

    if (questions.some((q) => q.is_coding)) {
      kind = 'coding';
    } else if (kind !== 'mcq') {
      kind = 'coding';
    }

    const bankId = tokenUrlsafe(10);
    const doc = {
      _id: bankId,
      title: cleanTitle,
      email: email ? normaliseEmail(email) : '',
      filename,
      questions,
      question_count: questions.length,
      self_intro_enabled: introOn,
      self_intro_prompt: introPrompt,
      created_at: db.now(),
      kind,
    };
    await saveCodingBank(doc);

    if (kind === 'mcq' && !questions.some((q) => q.is_coding)) {
      try {
        await saveExcelBank({
          ...doc,
          questions: questions.map((q) => {
            const { is_coding, language, starter_code, tests, ...rest } = q;
            return rest;
          }),
        });
      } catch (_) {
        /* ignore */
      }
    }

    const hasManual = Boolean(manualList.length);
    const hasFile = Boolean(fileQuestions.length);
    let message;
    if (hasManual && hasFile) {
      message = 'Excel first, then coding — merged into one interview link.';
    } else if (hasManual) {
      message = 'Manual coding questions saved. Candidate will use Monaco when needed.';
    } else if (kind === 'mcq') {
      message = 'MCQ/theory sheet detected. AI asks your questions (no Monaco).';
    } else {
      message = 'Coding sheet detected. Candidate will use Monaco editor + test cases.';
    }

    return res.json({
      status: 'success',
      kind,
      bank_id: bankId,
      title: cleanTitle,
      self_intro_enabled: introOn,
      self_intro_prompt: introPrompt,
      question_count: questions.length,
      interview_path: `/coding/${bankId}`,
      message,
      questions_preview:
        kind !== 'mcq'
          ? publicCodingQuestions(questions)
          : questions.slice(0, 5).map((q) => ({
              id: q.id,
              question: String(q.question || '').slice(0, 120),
            })),
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/coding-interview/create-manual', async (req, res) => {
  try {
    const body = req.body || {};
    let cleanTitle = String(body.title || 'Coding AI Interview').trim();
    if (cleanTitle.length > 80 || cleanTitle.slice(0, 40).includes(',')) {
      cleanTitle = 'Coding AI Interview';
    }
    cleanTitle = cleanTitle.slice(0, 80) || 'Coding AI Interview';

    const questions = codingInterview.normalizeManualQuestions(body.questions || []);
    if (!questions.length) {
      return httpError(res, 400, 'Add at least one coding question with a problem statement.');
    }

    const introOn = body.self_intro_enabled != null ? Boolean(body.self_intro_enabled) : true;
    const introPrompt = 'Please introduce yourself.';
    const bankId = tokenUrlsafe(10);
    const doc = {
      _id: bankId,
      title: cleanTitle,
      email: body.email ? normaliseEmail(body.email) : '',
      filename: 'manual',
      questions,
      question_count: questions.length,
      self_intro_enabled: introOn,
      self_intro_prompt: introPrompt,
      created_at: db.now(),
      kind: 'coding',
    };
    await saveCodingBank(doc);
    return res.json({
      status: 'success',
      kind: 'coding',
      bank_id: bankId,
      title: cleanTitle,
      self_intro_enabled: introOn,
      self_intro_prompt: introPrompt,
      question_count: questions.length,
      interview_path: `/coding/${bankId}`,
      message: 'Manual coding questions saved. Candidate will use Monaco editor + test cases.',
      questions_preview: publicCodingQuestions(questions),
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/coding-interview/run', async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await getCodingBank(body.bank_id);
    if (!doc) return httpError(res, 404, 'Coding interview not found.');
    const question = (doc.questions || []).find((q) => Number(q.id) === Number(body.question_id));
    if (!question) return httpError(res, 404, 'Question not found.');
    const language = String(body.language || question.language || 'python').toLowerCase();
    const result = codingInterview.runCodeAgainstTests(language, body.code || '', question.tests || []);
    return res.json({ status: 'success', question_id: body.question_id, ...result });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/coding-interview/evaluate', async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await getCodingBank(body.bank_id);
    if (!doc) return httpError(res, 404, 'Coding interview not found.');
    const question = (doc.questions || []).find((q) => Number(q.id) === Number(body.question_id));
    if (!question) return httpError(res, 404, 'Question not found.');

    if (String(body.mode || '').toLowerCase() === 'theory' || !question.is_coding) {
      let expected = String(question.answer || '');
      if (!expected) {
        const m = String(question.question || '').match(
          /Correct answer key for evaluator:\s*([^\n)]+)/i
        );
        if (m) expected = m[1].trim();
      }
      const answerText = String(body.answer || body.explanation || '').trim();
      const analysis = codingInterview.heuristicTheoryEval(
        question.question || '',
        answerText,
        expected
      );

      if (mocker.GEMINI_API_KEY) {
        try {
          const prompt = `Evaluate this theory/MCQ interview answer.
Question: ${question.question}
Expected answer key (if any): ${expected || '(none)'}
Candidate answer: ${answerText || '(empty)'}

Reply ONLY valid JSON:
{
  "correctness": <1-10>,
  "clarity": <1-10>,
  "depth": <1-10>,
  "relevance": <1-10>,
  "overall": <1-10>,
  "summary": "2-3 sentences",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "feedback": {
    "correctness": "...",
    "clarity": "...",
    "depth": "...",
    "relevance": "..."
  }
}`;
          let reply = await mocker.aiChat(
            'You are a strict interview evaluator. Reply JSON only.',
            [{ role: 'user', content: prompt }]
          );
          let cleaned = reply.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
          }
          Object.assign(analysis, JSON.parse(cleaned));
          analysis.source = 'gemini';
        } catch (_) {
          analysis.source = 'heuristic';
        }
      } else {
        analysis.source = 'heuristic';
      }

      return res.json({
        status: 'success',
        question_id: body.question_id,
        run: null,
        analysis,
      });
    }

    const language = String(body.language || question.language || 'python').toLowerCase();
    let runResult = body.run_result;
    if (!runResult) {
      runResult = codingInterview.runCodeAgainstTests(language, body.code || '', question.tests || []);
    }

    const analysis = codingInterview.heuristicCodeEval(
      question.question || '',
      body.code || '',
      runResult,
      body.explanation || ''
    );

    if (mocker.GEMINI_API_KEY) {
      try {
        const prompt = `Evaluate this coding interview submission.
Question: ${question.question}
Language: ${language}
Code:
\`\`\`${language}
${body.code}
\`\`\`
Candidate explanation: ${body.explanation || '(none)'}
Test results: passed ${runResult.passed}/${runResult.total} (${runResult.pass_rate}%)
Details: ${JSON.stringify(runResult.results || []).slice(0, 2000)}

Reply ONLY valid JSON:
{
  "correctness": <1-10>,
  "code_quality": <1-10>,
  "time_complexity": <1-10>,
  "space_complexity": <1-10>,
  "explanation": <1-10>,
  "overall": <1-10>,
  "summary": "2-3 sentences",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "feedback": {
    "correctness": "...",
    "code_quality": "...",
    "time_complexity": "e.g. O(n) estimate",
    "space_complexity": "e.g. O(1) estimate",
    "explanation": "..."
  }
}`;
        let reply = await mocker.aiChat(
          'You are a strict coding interview evaluator. Reply JSON only.',
          [{ role: 'user', content: prompt }]
        );
        let cleaned = reply.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        Object.assign(analysis, JSON.parse(cleaned));
        analysis.source = 'gemini';
      } catch (_) {
        analysis.source = 'heuristic';
      }
    } else {
      analysis.source = 'heuristic';
    }

    return res.json({
      status: 'success',
      question_id: body.question_id,
      run: runResult,
      analysis,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/coding-interview/final-report', async (req, res) => {
  try {
    const body = req.body || {};
    const bank = await getCodingBank(body.bank_id);
    if (bank && (bank.expired || bank.status === 'expired')) {
      return httpError(res, 410, 'This interview link has already been used and expired.');
    }

    const report = codingInterview.buildFinalReport(
      body.title || '',
      body.candidate_name || '',
      body.transcript || []
    );

    if (mocker.GEMINI_API_KEY && (body.transcript || []).length) {
      try {
        const compact = (body.transcript || []).slice(0, 20).map((item, i) => ({
          q: i + 1,
          mode: item.mode,
          question: String(item.question || '').slice(0, 200),
          answer: String(item.explanation || item.code || '').slice(0, 300),
          score: (item.analysis || {}).overall,
        }));
        const prompt = `Create a final interview report for ${body.candidate_name || 'candidate'}.
Title: ${body.title}
Per-question data: ${JSON.stringify(compact)}
Current overall: ${report.overall}

Reply ONLY valid JSON:
{
  "overall": <1-10>,
  "grade": "Excellent|Good|Average|Needs Improvement",
  "summary": "4-5 sentence personalized report",
  "recommendation": "one sentence next step",
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."]
}`;
        let reply = await mocker.aiChat('You are an interview report writer. Reply JSON only.', [
          { role: 'user', content: prompt },
        ]);
        let cleaned = reply.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        const aiJson = JSON.parse(cleaned);
        for (const key of ['overall', 'grade', 'summary', 'recommendation', 'strengths', 'improvements']) {
          if (aiJson[key] != null) report[key] = aiJson[key];
        }
        report.source = 'gemini';
      } catch (_) {
        report.source = 'heuristic';
      }
    } else {
      report.source = 'heuristic';
    }

    let adminEmail = '';
    if (bank && bank.email) adminEmail = normaliseEmail(bank.email);
    const candidateEmail = body.candidate_email ? normaliseEmail(body.candidate_email) : '';

    const sessionId = tokenUrlsafe(8);
    const doc = {
      id: sessionId,
      mode: 'coding',
      role: body.title || 'Coding AI Interview',
      user_email: adminEmail || candidateEmail,
      admin_email: adminEmail,
      candidate_email: candidateEmail,
      candidate_name: String(body.candidate_name || '').trim(),
      bank_id: body.bank_id,
      transcript: body.transcript || [],
      analysis: report,
      score: report.overall,
      totalQuestions: report.totalQuestions || (body.transcript || []).length,
      saved_at: db.now(),
      date: new Date().toISOString().slice(0, 10),
    };
    try {
      await (await db.col('interview_sessions')).insertOne(doc);
    } catch (_) {
      /* ignore */
    }

    await updateCodingBank(body.bank_id, {
      expired: true,
      status: 'expired',
      expired_at: db.now(),
      completed_session_id: sessionId,
      completed_by: String(body.candidate_name || '').trim(),
    });

    return res.json({
      status: 'success',
      session_id: sessionId,
      report,
      link_expired: true,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/coding-interview/save', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = tokenUrlsafe(8);
    const doc = {
      id: sessionId,
      mode: 'coding',
      role: body.title || 'Coding AI Interview',
      user_email: body.candidate_email ? normaliseEmail(body.candidate_email) : '',
      candidate_name: String(body.candidate_name || '').trim(),
      bank_id: body.bank_id,
      transcript: body.transcript || [],
      analysis: body.analysis || {},
      score: body.score,
      totalQuestions: (body.transcript || []).length,
      saved_at: db.now(),
      date: new Date().toISOString().slice(0, 10),
    };
    try {
      await (await db.col('interview_sessions')).insertOne(doc);
    } catch (_) {
      /* ignore */
    }
    return res.json({ status: 'success', session_id: sessionId });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/coding-interview/bank/:bankId', async (req, res) => {
  try {
    const doc = await getCodingBank(req.params.bankId);
    if (!doc) {
      return httpError(res, 404, 'Coding interview not found. Ask admin to upload questions again.');
    }
    if (doc.expired || doc.status === 'expired') {
      return httpError(
        res,
        410,
        'This interview link has expired. The candidate already completed the interview.'
      );
    }
    const questions = doc.questions || [];
    return res.json({
      status: 'success',
      bank_id: req.params.bankId,
      title: doc.title || 'Coding AI Interview',
      kind: doc.kind || 'coding',
      self_intro_enabled: Boolean(doc.self_intro_enabled),
      self_intro_prompt: doc.self_intro_prompt || '',
      question_count: questions.length,
      questions: publicCodingQuestions(questions),
      created_at: doc.created_at,
      expired: false,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/users', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    const users = await (await db.col('users')).find({}, { projection: { password: 0 } }).toArray();
    for (const u of users) {
      u.email = u._id;
      delete u._id;
      if (u.role === 'PREMIUM') u.role = 'STUDENT';
    }
    return res.json({ status: 'success', users });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const body = req.body || {};
    if (!(await requireAdmin(body.key))) return httpError(res, 403, 'Unauthorized');
    const users = await db.col('users');
    const email = normaliseEmail(body.email);
    if (await users.findOne({ _id: email })) {
      return httpError(res, 400, 'User already exists');
    }
    await db.upsertUser(email, String(body.name || '').trim(), 'STUDENT', 'admin');
    await users.updateOne({ _id: email }, { $set: { password: body.password, student_access: true } });
    return res.json({ status: 'success', message: 'Student created successfully' });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/admin/sessions', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    const docs = await (await db.col('interview_sessions'))
      .find({}, { projection: { _id: 0 } })
      .sort({ saved_at: -1 })
      .toArray();

    const usersList = await (await db.col('users')).find({}).toArray();
    const usersDict = {};
    for (const u of usersList) usersDict[u._id] = u;

    for (const d of docs) {
      const userEmail = d.user_email;
      if (usersDict[userEmail]) {
        const role = usersDict[userEmail].role || 'PUBLIC';
        d.user_role = isStudentRole(role) ? 'STUDENT' : role;
      } else {
        d.user_role = 'PUBLIC';
      }
      if (!d.candidate_name && usersDict[userEmail]) {
        d.candidate_name = usersDict[userEmail].name || '';
      }
    }

    return res.json({ status: 'success', sessions: docs });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.delete('/api/admin/users/:email', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    await (await db.col('users')).deleteOne({ _id: req.params.email });
    await (await db.col('interview_sessions')).deleteMany({ user_email: req.params.email });
    return res.json({ status: 'success', message: 'User and their sessions deleted' });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.delete('/api/admin/sessions/:sessionId', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    await (await db.col('interview_sessions')).deleteOne({ id: req.params.sessionId });
    return res.json({ status: 'success', message: 'Session deleted' });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ENTERPRISE AI INTERVIEW PLATFORM
// ══════════════════════════════════════════════════════════════════════════════

const enterpriseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const ok = ['.xlsx', '.xlsm', '.csv', '.pdf', '.docx'].some((ext) => name.endsWith(ext));
    if (!ok) return cb(new Error('Allowed file types: .xlsx, .csv, .pdf, .docx'));
    cb(null, true);
  },
});

function adminKeyFrom(req) {
  return req.query.key || req.body?.key || req.headers['x-admin-key'];
}

const rateBuckets = new Map();
function rateLimit(key, max = 60, windowMs = 60_000) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= max;
}

app.get('/api/enterprise/status', (_req, res) => {
  return res.json({ status: 'success', ...providers.platformStatus() });
});

// Human-like neural voice (Gemini TTS) — returns audio/wav.
// Frontend falls back to browser TTS when this is unavailable.
app.post('/api/tts', async (req, res) => {
  try {
    if (!rateLimit(`tts:${req.ip}`, 60)) return httpError(res, 429, 'Too many voice requests. Please wait a minute.');
    const text = String((req.body || {}).text || '').trim();
    if (!text) return httpError(res, 400, 'text is required');
    const audio = await tts.synthSpeech(text);
    if (!audio?.buffer?.length) return httpError(res, 503, 'Human voice unavailable');
    res.setHeader('Content-Type', audio.mime || 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (audio.provider) res.setHeader('X-TTS-Provider', audio.provider);
    return res.send(audio.buffer);
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/admin/analytics', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    const analytics = await enterprise.buildAnalytics();
    return res.json({ status: 'success', analytics, providers: providers.platformStatus() });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/admin/audit-logs', async (req, res) => {
  try {
    if (!(await requireAdmin(req.query.key))) return httpError(res, 403, 'Unauthorized');
    const logs = await auditLog.listAudit({ limit: req.query.limit, action: req.query.action });
    return res.json({ status: 'success', logs });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ── Question banks ───────────────────────────────────────────────────────────

app.get('/api/enterprise/question-banks/template', (_req, res) => {
  const buf = questionBank.buildQuestionTemplateBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mockbee_question_bank_template.xlsx"');
  return res.send(buf);
});

app.get('/api/enterprise/question-banks', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const banks = await enterprise.listBanks();
    return res.json({
      status: 'success',
      banks: banks.map((b) => ({
        id: b._id,
        title: b.title,
        question_count: (b.questions || []).length,
        status: b.status || 'draft',
        filename: b.filename,
        updated_at: b.updated_at,
        created_at: b.created_at,
      })),
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/enterprise/question-banks/:bankId', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const bank = await enterprise.getBank(req.params.bankId);
    if (!bank) return httpError(res, 404, 'Question bank not found');
    return res.json({ status: 'success', bank: { ...bank, id: bank._id } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/question-banks/upload', (req, res) => {
  enterpriseUpload.single('file')(req, res, async (err) => {
    try {
      if (err) return httpError(res, 400, err.message || 'Upload failed');
      if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
      if (!rateLimit(`qb-upload:${adminKeyFrom(req)}`, 20)) {
        return httpError(res, 429, 'Too many uploads. Please wait a minute.');
      }
      if (!req.file) return httpError(res, 400, 'No file uploaded');

      const title = String(req.body.title || req.file.originalname || 'Question Bank').slice(0, 120);
      let parsed;
      try {
        parsed = await questionBank.parseUploadBuffer(req.file.originalname, req.file.buffer, {
          role: req.body.role || '',
          difficulty: req.body.difficulty || 'medium',
        });
      } catch (parseErr) {
        await auditLog.writeAudit({
          action: 'question_bank.upload_failed',
          actor: 'admin',
          metadata: { filename: req.file.originalname, error: String(parseErr.message || parseErr) },
        });
        return httpError(res, 400, String(parseErr.message || parseErr));
      }

      const bankId = enterprise.tokenUrlsafe(10);
      const doc = {
        _id: bankId,
        title,
        filename: req.file.originalname,
        format: parsed.format,
        ocr_used: Boolean(parsed.ocr_used),
        questions: parsed.questions.map((q, i) => ({ ...q, id: i + 1, approved: false })),
        status: 'pending_review',
        created_at: enterprise.nowIso(),
        updated_at: enterprise.nowIso(),
      };
      await enterprise.saveBank(doc);
      await auditLog.writeAudit({
        action: 'question_bank.uploaded',
        actor: 'admin',
        target_type: 'question_bank',
        target_id: bankId,
        metadata: { count: doc.questions.length, format: parsed.format, ocr_used: doc.ocr_used },
      });

      return res.json({
        status: 'success',
        bank_id: bankId,
        title,
        format: parsed.format,
        ocr_used: doc.ocr_used,
        question_count: doc.questions.length,
        questions: doc.questions,
        message:
          'Questions extracted for review. Preview, edit, approve, then publish. AI did not invent questions.',
      });
    } catch (e) {
      return httpError(res, 500, String(e.message || e));
    }
  });
});

app.post('/api/enterprise/question-banks/manual', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const body = req.body || {};
    const questions = (body.questions || [])
      .map((q, i) => questionBank.normalizeQuestion({ ...q, source: 'admin_manual', approved: false }, i))
      .filter(Boolean);
    if (!questions.length) return httpError(res, 400, 'Add at least one question');
    const bankId = enterprise.tokenUrlsafe(10);
    const doc = {
      _id: bankId,
      title: String(body.title || 'Manual Question Bank').slice(0, 120),
      filename: 'manual',
      format: 'manual',
      ocr_used: false,
      questions: questions.map((q, i) => ({ ...q, id: i + 1 })),
      status: 'pending_review',
      created_at: enterprise.nowIso(),
      updated_at: enterprise.nowIso(),
    };
    await enterprise.saveBank(doc);
    return res.json({ status: 'success', bank_id: bankId, questions: doc.questions, question_count: questions.length });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.put('/api/enterprise/question-banks/:bankId', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const bank = await enterprise.getBank(req.params.bankId);
    if (!bank) return httpError(res, 404, 'Question bank not found');
    const body = req.body || {};
    if (body.title) bank.title = String(body.title).slice(0, 120);
    if (Array.isArray(body.questions)) {
      bank.questions = body.questions
        .map((q, i) => questionBank.normalizeQuestion(q, i))
        .filter(Boolean)
        .map((q, i) => ({ ...q, id: i + 1 }));
    }
    if (body.status) bank.status = body.status;
    bank.updated_at = enterprise.nowIso();
    await enterprise.saveBank(bank);
    await auditLog.writeAudit({
      action: 'question_bank.updated',
      actor: 'admin',
      target_type: 'question_bank',
      target_id: bank._id,
    });
    return res.json({ status: 'success', bank: { ...bank, id: bank._id } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/question-banks/:bankId/approve', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const bank = await enterprise.getBank(req.params.bankId);
    if (!bank) return httpError(res, 404, 'Question bank not found');
    bank.questions = (bank.questions || []).map((q) => ({ ...q, approved: true }));
    bank.status = 'approved';
    bank.updated_at = enterprise.nowIso();
    await enterprise.saveBank(bank);
    await auditLog.writeAudit({
      action: 'question_bank.approved',
      actor: 'admin',
      target_type: 'question_bank',
      target_id: bank._id,
      metadata: { count: bank.questions.length },
    });
    return res.json({ status: 'success', bank: { ...bank, id: bank._id } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.delete('/api/enterprise/question-banks/:bankId', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    try {
      await (await db.col('enterprise_question_banks')).deleteOne({ _id: req.params.bankId });
    } catch (_) {
      /* memory fallback handled by overwrite absence */
    }
    return res.json({ status: 'success', message: 'Question bank deleted' });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ── Interview templates ──────────────────────────────────────────────────────

app.get('/api/enterprise/roles', (_req, res) => {
  return res.json({ status: 'success', roles: enterprise.PRESET_ROLES, default_rubric: enterprise.DEFAULT_RUBRIC });
});

app.get('/api/enterprise/interviews', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const interviews = await enterprise.listInterviews();
    return res.json({
      status: 'success',
      interviews: interviews.map((i) => ({
        id: i._id,
        title: i.title,
        status: i.status,
        config: i.config,
        question_bank_id: i.question_bank_id,
        invite_path: `/panel/${i._id}`,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })),
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

/** Public: published MNC panels (admin question banks) for a role — used by Roles page. */
app.get('/api/enterprise/published', async (req, res) => {
  try {
    const roleQ = String(req.query.role || '').trim().toLowerCase();
    const interviews = await enterprise.listInterviews();
    const published = interviews
      .filter((i) => i.status === 'published' || i.status === 'scheduled')
      .filter((i) => {
        if (!roleQ) return true;
        const job = String(i.config?.job_role || i.title || '').toLowerCase();
        return job.includes(roleQ) || roleQ.includes(job);
      })
      .map((i) => ({
        id: i._id,
        title: i.title,
        job_role: i.config?.job_role || '',
        question_count: i.config?.question_count || null,
        duration_minutes: i.config?.duration_minutes || null,
        invite_path: `/panel/${i._id}`,
      }));
    return res.json({ status: 'success', interviews: published });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/interviews', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const body = req.body || {};
    const bankId = body.question_bank_id;
    if (!bankId) return httpError(res, 400, 'question_bank_id is required');
    const bank = await enterprise.getBank(bankId);
    if (!bank) return httpError(res, 404, 'Question bank not found');

    const id = enterprise.tokenUrlsafe(10);
    const config = enterprise.defaultConfig(body.config || body);
    const doc = {
      _id: id,
      title: String(body.title || `${config.job_role} Interview`).slice(0, 120),
      status: body.status === 'published' ? 'published' : 'draft',
      question_bank_id: bankId,
      config,
      created_at: enterprise.nowIso(),
      updated_at: enterprise.nowIso(),
    };
    await enterprise.saveInterview(doc);
    await auditLog.writeAudit({
      action: 'interview.created',
      actor: 'admin',
      target_type: 'interview',
      target_id: id,
      metadata: { status: doc.status, role: config.job_role },
    });
    return res.json({
      status: 'success',
      interview: { ...doc, id, invite_path: `/panel/${id}` },
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.put('/api/enterprise/interviews/:id', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const interview = await enterprise.getInterview(req.params.id);
    if (!interview) return httpError(res, 404, 'Interview not found');
    const body = req.body || {};
    if (body.title) interview.title = String(body.title).slice(0, 120);
    if (body.status) interview.status = body.status;
    if (body.question_bank_id) interview.question_bank_id = body.question_bank_id;
    if (body.config) interview.config = enterprise.defaultConfig({ ...interview.config, ...body.config });
    interview.updated_at = enterprise.nowIso();
    await enterprise.saveInterview(interview);
    await auditLog.writeAudit({
      action: 'interview.updated',
      actor: 'admin',
      target_type: 'interview',
      target_id: interview._id,
      metadata: { status: interview.status },
    });
    return res.json({ status: 'success', interview: { ...interview, id: interview._id, invite_path: `/panel/${interview._id}` } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/interviews/:id/duplicate', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const interview = await enterprise.getInterview(req.params.id);
    if (!interview) return httpError(res, 404, 'Interview not found');
    const id = enterprise.tokenUrlsafe(10);
    const copy = {
      ...interview,
      _id: id,
      title: `${interview.title} (Copy)`,
      status: 'draft',
      created_at: enterprise.nowIso(),
      updated_at: enterprise.nowIso(),
    };
    await enterprise.saveInterview(copy);
    return res.json({ status: 'success', interview: { ...copy, id, invite_path: `/panel/${id}` } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/interviews/:id/publish', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const interview = await enterprise.getInterview(req.params.id);
    if (!interview) return httpError(res, 404, 'Interview not found');
    const bank = await enterprise.getBank(interview.question_bank_id);
    if (!bank || !(bank.questions || []).length) {
      return httpError(res, 400, 'Cannot publish: question bank is empty');
    }
    const approved = (bank.questions || []).filter((q) => q.approved !== false);
    if (!approved.length) return httpError(res, 400, 'Approve at least one question before publishing');
    interview.status = 'published';
    interview.updated_at = enterprise.nowIso();
    await enterprise.saveInterview(interview);
    await auditLog.writeAudit({
      action: 'interview.published',
      actor: 'admin',
      target_type: 'interview',
      target_id: interview._id,
    });
    return res.json({
      status: 'success',
      interview: { ...interview, id: interview._id, invite_path: `/panel/${interview._id}` },
      invite_url_path: `/panel/${interview._id}`,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/interviews/:id/archive', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const interview = await enterprise.getInterview(req.params.id);
    if (!interview) return httpError(res, 404, 'Interview not found');
    interview.status = 'archived';
    interview.updated_at = enterprise.nowIso();
    await enterprise.saveInterview(interview);
    return res.json({ status: 'success', interview: { ...interview, id: interview._id } });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ── Candidate session flow ───────────────────────────────────────────────────

app.get('/api/enterprise/invite/:interviewId', async (req, res) => {
  try {
    const interview = await enterprise.getInterview(req.params.interviewId);
    if (!interview) return httpError(res, 404, 'Interview invitation not found');
    if (interview.status === 'archived') return httpError(res, 410, 'This interview has been archived');
    if (interview.status !== 'published' && interview.status !== 'scheduled') {
      return httpError(res, 403, 'This interview is not published yet');
    }
    const bank = await enterprise.getBank(interview.question_bank_id);
    const config = interview.config || enterprise.defaultConfig();
    return res.json({
      status: 'success',
      interview: {
        id: interview._id,
        title: interview.title,
        config: {
          job_role: config.job_role,
          job_description: config.job_description,
          required_skills: config.required_skills,
          experience_level: config.experience_level,
          duration_minutes: config.duration_minutes,
          question_count: config.question_count,
          interview_mode: config.interview_mode,
          instructions: config.instructions,
          passing_score: config.passing_score,
        },
        question_count: Math.min(config.question_count, (bank?.questions || []).filter((q) => q.approved !== false).length),
      },
      providers: providers.platformStatus(),
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/invite/:interviewId/start', async (req, res) => {
  try {
    if (!rateLimit(`invite-start:${req.ip}`, 30)) return httpError(res, 429, 'Too many start attempts');
    const interview = await enterprise.getInterview(req.params.interviewId);
    if (!interview) return httpError(res, 404, 'Interview not found');
    if (interview.status !== 'published' && interview.status !== 'scheduled') {
      return httpError(res, 403, 'Interview is not available');
    }
    const body = req.body || {};
    const name = String(body.candidate_name || '').trim();
    const email = normaliseEmail(body.candidate_email);
    if (!name) return httpError(res, 400, 'Candidate name is required');

    const bank = await enterprise.getBank(interview.question_bank_id);
    if (!bank) return httpError(res, 400, 'Question bank missing');
    const config = interview.config || enterprise.defaultConfig();
    const selected = enterprise.selectQuestions(bank.questions || [], config);
    if (!selected.length) return httpError(res, 400, 'No approved questions available for this interview');

    const sessionId = enterprise.tokenUrlsafe(10);
    const session = {
      id: sessionId,
      mode: 'enterprise',
      interview_id: interview._id,
      role: config.job_role,
      job_role: config.job_role,
      required_skills: config.required_skills,
      user_email: email,
      candidate_email: email,
      candidate_name: name,
      status: 'in_progress',
      started_at: enterprise.nowIso(),
      saved_at: enterprise.nowIso(),
      date: new Date().toISOString().slice(0, 10),
      questions: selected,
      answers: [],
      current_index: 0,
      follow_ups_asked: {},
      submission_token: enterprise.tokenUrlsafe(8),
      config_snapshot: config,
      demo_mode: providers.DEMO_MODE,
      incomplete: true,
      score: null,
      analysis: null,
    };
    await enterprise.saveSession(session);
    await auditLog.writeAudit({
      action: 'session.started',
      actor: email || name,
      target_type: 'session',
      target_id: sessionId,
      metadata: { interview_id: interview._id },
    });

    const intro = `Hello ${name}, I am your AI interviewer for the ${config.job_role} role. This is an AI-assisted interview, not a live human. We will go through ${selected.length} questions. ${config.instructions}`;

    return res.json({
      status: 'success',
      session_id: sessionId,
      submission_token: session.submission_token,
      intro,
      question_count: selected.length,
      duration_minutes: config.duration_minutes,
      interview_mode: config.interview_mode,
      providers: providers.platformStatus(),
      first_question: {
        index: 0,
        id: selected[0].id,
        question: selected[0].question,
        category: selected[0].category,
        topic: selected[0].topic,
        difficulty: selected[0].difficulty,
        max_marks: selected[0].max_marks,
        hint: selected[0].hint || '',
        source: selected[0].source || 'admin_upload',
        is_ai_followup: false,
      },
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/enterprise/sessions/:sessionId', async (req, res) => {
  try {
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session || session.mode !== 'enterprise') return httpError(res, 404, 'Session not found');
    return res.json({
      status: 'success',
      session: {
        id: session.id,
        interview_id: session.interview_id,
        candidate_name: session.candidate_name,
        status: session.status,
        current_index: session.current_index,
        question_count: (session.questions || []).length,
        answers_count: (session.answers || []).length,
        incomplete: session.incomplete,
        score: session.score,
      },
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/sessions/:sessionId/answer', async (req, res) => {
  try {
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session || session.mode !== 'enterprise') return httpError(res, 404, 'Session not found');
    if (session.status === 'completed') return httpError(res, 409, 'Interview already completed');
    const body = req.body || {};
    if (body.submission_token && body.submission_token !== session.submission_token) {
      return httpError(res, 409, 'Invalid submission token — possible duplicate or stale client');
    }

    const answerText = String(body.answer || body.transcript || '').trim();
    const idx = Number(body.question_index != null ? body.question_index : session.current_index);
    const question = (session.questions || [])[idx];
    if (!question) return httpError(res, 400, 'Question not found for this index');

    // Idempotency: same index already answered → return stored evaluation
    const existing = (session.answers || []).find((a) => a.question_index === idx && !a.question?.is_ai_followup);
    if (existing && !body.force) {
      return res.json({
        status: 'success',
        duplicate: true,
        evaluation: existing.evaluation,
        next: null,
        message: 'Answer already recorded for this question',
      });
    }

    const config = session.config_snapshot || enterprise.defaultConfig();
    const evaluation = await enterprise.aiAnswerEval(question, answerText, config);
    const answerRecord = {
      question_index: idx,
      question: { ...question, is_ai_followup: Boolean(question.is_ai_followup) },
      answer: answerText,
      transcript: answerText,
      answered_at: enterprise.nowIso(),
      evaluation,
    };
    session.answers = [...(session.answers || []).filter((a) => a.question_index !== idx || a.question?.is_ai_followup), answerRecord];
    session.saved_at = enterprise.nowIso();

    let followUp = null;
    const followKey = String(question.id);
    const asked = session.follow_ups_asked?.[followKey] || 0;
    const canFollow =
      config.allow_follow_ups &&
      asked < (config.max_follow_ups_per_question || 0) &&
      (evaluation.ask_follow_up || question.follow_up);

    if (canFollow) {
      const followText =
        question.follow_up ||
        evaluation.follow_up_question ||
        `Can you elaborate on one technical detail from your previous answer related to ${question.topic || question.category || 'this topic'}?`;
      followUp = {
        index: idx,
        id: `${question.id}-fu-${asked + 1}`,
        question: followText,
        category: question.category,
        topic: question.topic,
        difficulty: question.difficulty,
        max_marks: Math.max(5, Math.round((question.max_marks || 10) * 0.5)),
        source: question.follow_up ? 'admin_upload' : 'ai_generated',
        is_ai_followup: !question.follow_up,
        parent_question_id: question.id,
      };
      session.follow_ups_asked = { ...(session.follow_ups_asked || {}), [followKey]: asked + 1 };
      // Inject follow-up as temporary current question marker
      session.pending_follow_up = followUp;
    } else {
      session.pending_follow_up = null;
      session.current_index = idx + 1;
    }

    await enterprise.saveSession(session);

    const nextIndex = session.current_index;
    const nextQuestion = session.pending_follow_up
      ? session.pending_follow_up
      : (session.questions || [])[nextIndex]
        ? {
            index: nextIndex,
            id: session.questions[nextIndex].id,
            question: session.questions[nextIndex].question,
            category: session.questions[nextIndex].category,
            topic: session.questions[nextIndex].topic,
            difficulty: session.questions[nextIndex].difficulty,
            max_marks: session.questions[nextIndex].max_marks,
            hint: session.questions[nextIndex].hint || '',
            source: session.questions[nextIndex].source || 'admin_upload',
            is_ai_followup: false,
          }
        : null;

    return res.json({
      status: 'success',
      evaluation,
      next: nextQuestion,
      progress: {
        answered: (session.answers || []).length,
        total: (session.questions || []).length,
        current_index: session.current_index,
      },
      done: !nextQuestion,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/sessions/:sessionId/follow-up-answer', async (req, res) => {
  try {
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session || session.mode !== 'enterprise') return httpError(res, 404, 'Session not found');
    if (!session.pending_follow_up) return httpError(res, 400, 'No pending follow-up');
    const body = req.body || {};
    const answerText = String(body.answer || body.transcript || '').trim();
    const fu = session.pending_follow_up;
    const config = session.config_snapshot || enterprise.defaultConfig();
    const evaluation = await enterprise.aiAnswerEval(
      {
        ...fu,
        expected_answer: '',
        max_marks: fu.max_marks || 5,
      },
      answerText,
      config
    );
    session.answers = [
      ...(session.answers || []),
      {
        question_index: fu.index,
        question: fu,
        answer: answerText,
        transcript: answerText,
        answered_at: enterprise.nowIso(),
        evaluation,
      },
    ];
    session.pending_follow_up = null;
    session.current_index = Number(fu.index) + 1;
    session.saved_at = enterprise.nowIso();
    await enterprise.saveSession(session);

    const nextIndex = session.current_index;
    const nq = (session.questions || [])[nextIndex];
    const next = nq
      ? {
          index: nextIndex,
          id: nq.id,
          question: nq.question,
          category: nq.category,
          topic: nq.topic,
          difficulty: nq.difficulty,
          max_marks: nq.max_marks,
          hint: nq.hint || '',
          source: nq.source || 'admin_upload',
          is_ai_followup: false,
        }
      : null;

    return res.json({
      status: 'success',
      evaluation,
      next,
      done: !next,
    });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/sessions/:sessionId/complete', async (req, res) => {
  try {
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session || session.mode !== 'enterprise') return httpError(res, 404, 'Session not found');
    if (session.status === 'completed' && session.analysis && !req.body?.force) {
      return res.json({
        status: 'success',
        duplicate: true,
        session_id: session.id,
        report: session.analysis,
        message: 'Interview already completed',
      });
    }

    const interview = (await enterprise.getInterview(session.interview_id)) || {
      _id: session.interview_id,
      config: session.config_snapshot,
    };
    const body = req.body || {};
    if (body.duration_seconds != null) session.duration_seconds = Number(body.duration_seconds);
    session.incomplete = (session.answers || []).length < (session.questions || []).length;
    session.status = 'completed';
    session.completed_at = enterprise.nowIso();
    session.saved_at = enterprise.nowIso();
    session.demo_mode = providers.DEMO_MODE;

    const report = enterprise.buildReport(session, interview);
    session.analysis = report;
    session.score = report.percentage;
    session.totalQuestions = (session.questions || []).length;
    await enterprise.saveSession(session);
    await auditLog.writeAudit({
      action: 'session.completed',
      actor: session.candidate_email || session.candidate_name,
      target_type: 'session',
      target_id: session.id,
      metadata: { percentage: report.percentage, result_status: report.result_status },
    });

    return res.json({ status: 'success', session_id: session.id, report });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/enterprise/sessions/:sessionId/report', async (req, res) => {
  try {
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session) return httpError(res, 404, 'Session not found');
    const interview = (await enterprise.getInterview(session.interview_id)) || {
      _id: session.interview_id,
      config: session.config_snapshot,
    };
    const report = session.analysis || enterprise.buildReport(session, interview);
    return res.json({ status: 'success', report });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.get('/api/enterprise/sessions/:sessionId/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const isAdmin = await requireAdmin(adminKeyFrom(req));
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session) return httpError(res, 404, 'Session not found');
    if (!isAdmin && session.status !== 'completed') {
      return httpError(res, 403, 'Report not available until interview is completed');
    }
    const interview = (await enterprise.getInterview(session.interview_id)) || {
      _id: session.interview_id,
      config: session.config_snapshot,
    };
    const report = session.analysis || enterprise.buildReport(session, interview);
    const base = `mockbee_report_${session.id}`;

    if (format === 'xlsx' || format === 'excel') {
      const buf = reportExport.toXlsxBuffer(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      return res.send(buf);
    }
    if (format === 'pdf') {
      const buf = reportExport.toSimplePdfBuffer(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      return res.send(buf);
    }
    const csv = reportExport.toCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send(csv);
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

app.post('/api/enterprise/sessions/:sessionId/override', async (req, res) => {
  try {
    if (!(await requireAdmin(adminKeyFrom(req)))) return httpError(res, 403, 'Unauthorized');
    const session = await enterprise.getSession(req.params.sessionId);
    if (!session) return httpError(res, 404, 'Session not found');
    const body = req.body || {};
    const qIndex = Number(body.question_index);
    const answer = (session.answers || []).find((a) => a.question_index === qIndex);
    if (!answer) return httpError(res, 404, 'Answer not found');

    const prev = answer.evaluation?.score;
    answer.human_override = {
      score: Number(body.score),
      max_marks: Number(body.max_marks || answer.evaluation?.max_marks || 10),
      notes: String(body.notes || ''),
      reviewer: String(body.reviewer || 'admin'),
      at: enterprise.nowIso(),
    };
    if (answer.evaluation) {
      answer.evaluation.score = answer.human_override.score;
      answer.evaluation.percentage = Math.round(
        (answer.human_override.score / answer.human_override.max_marks) * 100
      );
      answer.evaluation.human_overridden = true;
    }
    session.override_history = [
      ...(session.override_history || []),
      {
        question_index: qIndex,
        previous_score: prev,
        new_score: answer.human_override.score,
        notes: answer.human_override.notes,
        reviewer: answer.human_override.reviewer,
        at: answer.human_override.at,
      },
    ];
    if (body.human_reviewer_notes) session.human_reviewer_notes = String(body.human_reviewer_notes);
    const interview = (await enterprise.getInterview(session.interview_id)) || {
      _id: session.interview_id,
      config: session.config_snapshot,
    };
    session.analysis = enterprise.buildReport(session, interview);
    session.score = session.analysis.percentage;
    session.saved_at = enterprise.nowIso();
    await enterprise.saveSession(session);
    await auditLog.writeAudit({
      action: 'session.score_override',
      actor: 'admin',
      target_type: 'session',
      target_id: session.id,
      metadata: { question_index: qIndex, previous_score: prev, new_score: answer.human_override.score },
    });
    return res.json({ status: 'success', report: session.analysis });
  } catch (e) {
    return httpError(res, 500, String(e.message || e));
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
// Linode / VPS: set HOST=127.0.0.1 behind nginx, or 0.0.0.0 if exposed directly.
const PORT = Number(process.env.PORT) || 8001;
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`MockBee API listening on http://${HOST}:${PORT}`);
  if (providers.DEMO_MODE) {
    console.log('⚠ DEMO MODE: GEMINI_API_KEY not set — evaluation uses heuristic scoring.');
  }
});

