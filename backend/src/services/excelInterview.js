/**
 * Parse Excel/CSV interview question sheets into a normalised question list.
 */
const XLSX = require('xlsx');

const QUESTION_HEADERS = new Set([
  'question',
  'questions',
  'q',
  'prompt',
  'interview question',
  'interview_question',
]);
const ROLE_HEADERS = new Set(['role', 'title', 'job', 'position', 'job role', 'job_role']);
const CATEGORY_HEADERS = new Set(['category', 'topic', 'section', 'phase', 'type']);

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

function mapHeaders(headers) {
  const mapping = {};
  headers.forEach((header, idx) => {
    const key = normHeader(header);
    if (QUESTION_HEADERS.has(key) && mapping.question == null) {
      mapping.question = idx;
    } else if (ROLE_HEADERS.has(key) && mapping.role == null) {
      mapping.role = idx;
    } else if (CATEGORY_HEADERS.has(key) && mapping.category == null) {
      mapping.category = idx;
    }
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

function rowsToQuestions(rows, defaultRole = 'Custom Interview') {
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
    const qIdx = headerMap.question;
    const question = cellText(cells[qIdx] != null ? cells[qIdx] : '');
    if (!question) continue;

    let role = defaultRole;
    if (headerMap.role != null && headerMap.role < cells.length) {
      role = cellText(cells[headerMap.role]) || defaultRole;
    }

    let category = 'General';
    if (headerMap.category != null && headerMap.category < cells.length) {
      category = cellText(cells[headerMap.category]) || 'General';
    }

    questions.push({
      id: questions.length + 1,
      question,
      role,
      category,
    });
  }
  return questions;
}

function parseExcelBytes(data, defaultRole = 'Custom Interview') {
  return rowsToQuestions(sheetToRows(data), defaultRole);
}

function parseCsvBytes(data, defaultRole = 'Custom Interview') {
  return rowsToQuestions(csvToRows(data), defaultRole);
}

function parseQuestionFile(filename, data, defaultRole = 'Custom Interview') {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xltx') || name.endsWith('.xltm')) {
    return parseExcelBytes(data, defaultRole);
  }
  if (name.endsWith('.csv')) {
    return parseCsvBytes(data, defaultRole);
  }
  try {
    return parseExcelBytes(data, defaultRole);
  } catch (_) {
    return parseCsvBytes(data, defaultRole);
  }
}

module.exports = {
  parseQuestionFile,
  parseExcelBytes,
  parseCsvBytes,
};
