/**
 * Enterprise question-bank parsing for xlsx, csv, pdf, and docx.
 * Never invents questions when extraction fails.
 */
const XLSX = require('xlsx');
const path = require('path');

const QUESTION_HEADERS = new Set([
  'question',
  'questions',
  'q',
  'prompt',
  'interview question',
  'interview_question',
  'question text',
  'question_text',
]);
const CATEGORY_HEADERS = new Set(['category', 'topic', 'section', 'phase', 'type', 'skill']);
const DIFFICULTY_HEADERS = new Set(['difficulty', 'level', 'diff', 'complexity']);
const ANSWER_HEADERS = new Set([
  'expected answer',
  'expected_answer',
  'answer',
  'model answer',
  'model_answer',
  'rubric',
  'evaluation rubric',
  'evaluation_rubric',
  'expected',
]);
const MARKS_HEADERS = new Set(['marks', 'max marks', 'max_marks', 'maximum marks', 'score', 'points']);
const HINT_HEADERS = new Set(['hint', 'hints', 'optional hint']);
const FOLLOWUP_HEADERS = new Set(['follow up', 'follow-up', 'followup', 'follow_up', 'follow-up questions']);
const ROLE_HEADERS = new Set(['role', 'title', 'job', 'position', 'job role', 'job_role']);
const TOPIC_HEADERS = new Set(['topic', 'subtopic', 'sub-topic']);
const ORDER_HEADERS = new Set(['order', 'seq', 'sequence', 'sort', '#']);

const ALLOWED_EXT = new Set(['.xlsx', '.xlsm', '.csv', '.pdf', '.docx', '.doc']);

function normHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cellText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseDifficulty(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (!v) return 'medium';
  if (['easy', 'beginner', 'basic', '1'].includes(v)) return 'easy';
  if (['hard', 'advanced', 'expert', '3', 'difficult'].includes(v)) return 'hard';
  if (['medium', 'intermediate', 'moderate', '2'].includes(v)) return 'medium';
  return v.slice(0, 32) || 'medium';
}

function parseMarks(raw, fallback = 10) {
  const n = Number(String(raw || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(100, Math.round(n));
}

function mapHeaders(headers) {
  const mapping = {};
  headers.forEach((header, idx) => {
    const key = normHeader(header);
    if (QUESTION_HEADERS.has(key) && mapping.question == null) mapping.question = idx;
    else if (CATEGORY_HEADERS.has(key) && mapping.category == null) mapping.category = idx;
    else if (TOPIC_HEADERS.has(key) && mapping.topic == null) mapping.topic = idx;
    else if (DIFFICULTY_HEADERS.has(key) && mapping.difficulty == null) mapping.difficulty = idx;
    else if (ANSWER_HEADERS.has(key) && mapping.expected_answer == null) mapping.expected_answer = idx;
    else if (MARKS_HEADERS.has(key) && mapping.max_marks == null) mapping.max_marks = idx;
    else if (HINT_HEADERS.has(key) && mapping.hint == null) mapping.hint = idx;
    else if (FOLLOWUP_HEADERS.has(key) && mapping.follow_up == null) mapping.follow_up = idx;
    else if (ROLE_HEADERS.has(key) && mapping.role == null) mapping.role = idx;
    else if (ORDER_HEADERS.has(key) && mapping.order == null) mapping.order = idx;
  });
  return mapping;
}

function sheetToRows(data) {
  const wb = XLSX.read(data, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function csvToRows(data) {
  const text = Buffer.isBuffer(data)
    ? data.toString('utf8').replace(/^\uFEFF/, '')
    : String(data).replace(/^\uFEFF/, '');
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function pick(cells, idx) {
  if (idx == null || idx >= cells.length) return '';
  return cellText(cells[idx]);
}

function normalizeQuestion(partial, index) {
  const question = cellText(partial.question);
  if (!question) return null;
  return {
    id: partial.id || index + 1,
    question,
    category: cellText(partial.category) || 'General',
    topic: cellText(partial.topic) || cellText(partial.category) || 'General',
    difficulty: parseDifficulty(partial.difficulty),
    expected_answer: cellText(partial.expected_answer),
    evaluation_rubric: cellText(partial.evaluation_rubric || partial.expected_answer),
    max_marks: parseMarks(partial.max_marks, 10),
    hint: cellText(partial.hint),
    follow_up: cellText(partial.follow_up),
    role: cellText(partial.role) || '',
    source: partial.source || 'admin_upload',
    approved: partial.approved !== false,
    order: Number.isFinite(Number(partial.order)) ? Number(partial.order) : index + 1,
  };
}

function rowsToQuestions(rows, defaults = {}) {
  if (!rows || !rows.length) return [];

  const first = (rows[0] || []).map(cellText);
  let headerMap = mapHeaders(first);
  let start = headerMap.question != null ? 1 : 0;

  if (headerMap.question == null) {
    headerMap = { question: 0 };
  }

  const questions = [];
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r] || [];
    const q = normalizeQuestion(
      {
        question: pick(cells, headerMap.question),
        category: pick(cells, headerMap.category) || defaults.category,
        topic: pick(cells, headerMap.topic),
        difficulty: pick(cells, headerMap.difficulty) || defaults.difficulty,
        expected_answer: pick(cells, headerMap.expected_answer),
        max_marks: pick(cells, headerMap.max_marks),
        hint: pick(cells, headerMap.hint),
        follow_up: pick(cells, headerMap.follow_up),
        role: pick(cells, headerMap.role) || defaults.role,
        order: pick(cells, headerMap.order),
        source: 'admin_upload',
      },
      questions.length
    );
    if (q) questions.push(q);
  }
  return questions;
}

function extractNumberedQuestions(text) {
  const cleaned = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return [];

  const blocks = cleaned.split(/\n(?=\s*(?:\d+[.)]|\d+\s*[-–]|Q\d+[.)]?|Question\s*\d+)\s*)/i);
  const questions = [];

  for (const block of blocks) {
    const line = block.trim();
    if (!line) continue;
    const stripped = line
      .replace(/^\s*(?:\d+[.)]|\d+\s*[-–]|Q\d+[.)]?|Question\s*\d+)\s*/i, '')
      .trim();
    const candidate = stripped || line;
    if (candidate.length < 8) continue;

    let expected = '';
    let followUp = '';
    let hint = '';
    const parts = candidate.split(/\n+/);
    const questionLines = [];
    for (const p of parts) {
      const low = p.toLowerCase();
      if (low.startsWith('expected:') || low.startsWith('answer:') || low.startsWith('rubric:')) {
        expected = p.replace(/^[^:]+:\s*/i, '').trim();
      } else if (low.startsWith('follow-up:') || low.startsWith('follow up:')) {
        followUp = p.replace(/^[^:]+:\s*/i, '').trim();
      } else if (low.startsWith('hint:')) {
        hint = p.replace(/^[^:]+:\s*/i, '').trim();
      } else {
        questionLines.push(p);
      }
    }
    const q = normalizeQuestion(
      {
        question: questionLines.join(' ').trim(),
        expected_answer: expected,
        follow_up: followUp,
        hint,
        source: 'admin_upload',
      },
      questions.length
    );
    if (q) questions.push(q);
  }

  if (!questions.length && cleaned.length >= 20) {
    const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length >= 12);
    for (const p of paragraphs) {
      const q = normalizeQuestion({ question: p.replace(/\s+/g, ' '), source: 'admin_upload' }, questions.length);
      if (q) questions.push(q);
    }
  }

  return questions;
}

async function extractPdfText(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (_) {
    throw new Error(
      'PDF support requires the pdf-parse package. Run: npm install pdf-parse — or upload .xlsx/.csv/.docx instead.'
    );
  }
  const result = await pdfParse(buffer);
  const text = String(result.text || '').trim();
  if (!text || text.length < 20) {
    const err = new Error(
      'No readable text found in this PDF. It may be a scanned image. Enable OCR (set PDF_OCR=1 and install tesseract.js) or upload a text-based PDF / Excel / Word file. Questions were not invented.'
    );
    err.code = 'PDF_NO_TEXT';
    throw err;
  }
  return text;
}

async function extractPdfWithOcr(buffer) {
  if (process.env.PDF_OCR !== '1' && String(process.env.PDF_OCR || '').toLowerCase() !== 'true') {
    return null;
  }
  try {
    const Tesseract = require('tesseract.js');
    // Best-effort: OCR the raw buffer as an image-like input when possible.
    // Full page-render OCR needs pdfjs; this path covers simple image PDFs when tesseract can read them.
    const { data } = await Tesseract.recognize(buffer, 'eng');
    const text = String(data?.text || '').trim();
    return text.length >= 20 ? text : null;
  } catch (_) {
    return null;
  }
}

async function extractDocxText(buffer) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    throw new Error(
      'Word (.docx) support requires the mammoth package. Run: npm install mammoth — or upload .xlsx/.csv instead.'
    );
  }
  const result = await mammoth.extractRawText({ buffer });
  const text = String(result.value || '').trim();
  if (!text || text.length < 12) {
    throw new Error('No readable text found in this Word document. Questions were not invented.');
  }
  return text;
}

async function parseUploadBuffer(filename, buffer, defaults = {}) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (!ALLOWED_EXT.has(ext) && ext !== '.doc') {
    throw new Error(`Unsupported file type "${ext || 'unknown'}". Allowed: .xlsx, .csv, .pdf, .docx`);
  }

  if (ext === '.xlsx' || ext === '.xlsm') {
    const questions = rowsToQuestions(sheetToRows(buffer), defaults);
    if (!questions.length) {
      throw new Error('No questions found in the spreadsheet. Ensure a Question column exists.');
    }
    return { questions, format: 'xlsx', ocr_used: false };
  }

  if (ext === '.csv') {
    const questions = rowsToQuestions(csvToRows(buffer), defaults);
    if (!questions.length) {
      throw new Error('No questions found in the CSV. Ensure a Question column exists.');
    }
    return { questions, format: 'csv', ocr_used: false };
  }

  if (ext === '.docx') {
    const text = await extractDocxText(buffer);
    const questions = extractNumberedQuestions(text);
    if (!questions.length) {
      throw new Error('Could not extract questions from the Word document. Use numbered questions (1. …).');
    }
    return { questions, format: 'docx', ocr_used: false };
  }

  if (ext === '.doc') {
    throw new Error('Legacy .doc is not supported. Please save as .docx, .pdf, .xlsx, or .csv.');
  }

  if (ext === '.pdf') {
    let text = '';
    let ocrUsed = false;
    try {
      text = await extractPdfText(buffer);
    } catch (e) {
      if (e.code === 'PDF_NO_TEXT') {
        const ocrText = await extractPdfWithOcr(buffer);
        if (ocrText) {
          text = ocrText;
          ocrUsed = true;
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    const questions = extractNumberedQuestions(text);
    if (!questions.length) {
      throw new Error(
        'Could not extract questions from the PDF. Use numbered questions (1. …) or upload Excel/CSV. Questions were not invented.'
      );
    }
    return { questions, format: 'pdf', ocr_used: ocrUsed };
  }

  throw new Error(`Unsupported file type "${ext}".`);
}

function buildQuestionTemplateBuffer() {
  const rows = [
    ['Question', 'Category', 'Topic', 'Difficulty', 'Expected Answer', 'Max Marks', 'Hint', 'Follow-up'],
    [
      'Explain the virtual DOM in React and why it improves performance.',
      'Technical',
      'React',
      'medium',
      'Diffing between virtual trees; batch updates; avoid direct DOM thrashing',
      10,
      'Mention reconciliation',
      'How does React.memo relate to this?',
    ],
    [
      'What is the difference between let, const, and var in JavaScript?',
      'Technical',
      'JavaScript',
      'easy',
      'Scope differences; temporal dead zone; reassignment rules',
      8,
      '',
      '',
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Questions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  ALLOWED_EXT,
  parseUploadBuffer,
  extractNumberedQuestions,
  normalizeQuestion,
  buildQuestionTemplateBuffer,
  rowsToQuestions,
};
