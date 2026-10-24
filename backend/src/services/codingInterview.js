/**
 * Parse coding-interview Excel/CSV sheets and run stdin/stdout test cases.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const XLSX = require('xlsx');

const QUESTION_HEADERS = new Set(['question', 'questions', 'q', 'prompt', 'problem', 'title']);
const LANGUAGE_HEADERS = new Set(['language', 'lang', 'tech']);
const STARTER_HEADERS = new Set(['startercode', 'starter_code', 'starter', 'template', 'boilerplate', 'code']);
const TESTS_HEADERS = new Set(['tests', 'testcases', 'test_cases', 'test cases', 'cases']);
const EXPLANATION_HEADERS = new Set(['explanation', 'hint', 'notes', 'description']);
const MCQ_HEADERS = new Set([
  'optiona',
  'optionb',
  'optionc',
  'optiond',
  'option a',
  'option b',
  'option c',
  'option d',
  'option_a',
  'option_b',
  'answer',
  'correct',
  'correctanswer',
  'difficulty',
]);

const SUPPORTED_LANGS = new Set([
  'python',
  'javascript',
  'java',
  'html',
  'css',
  'react',
  'node',
  'express',
  'sql',
  'mssql',
]);

const LANG_ALIASES = {
  js: 'javascript',
  nodejs: 'node',
  ts: 'javascript',
  typescript: 'javascript',
};

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cell(value) {
  if (value == null) return '';
  return String(value).trim();
}

function readRows(filename, data) {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.csv')) {
    const text = Buffer.isBuffer(data)
      ? data.toString('utf8').replace(/^\uFEFF/, '')
      : String(data).replace(/^\uFEFF/, '');
    const wb = XLSX.read(text, { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }
  const wb = XLSX.read(data, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function detectSheetKind(filename, data) {
  let rows = [];
  try {
    rows = readRows(filename, data);
  } catch (_) {
    return 'coding';
  }
  if (!rows.length) return 'coding';

  const headers = (rows[0] || []).map((c) => norm(c).replace(/_/g, ' '));
  const compact = headers.map((h) => h.replace(/ /g, ''));
  const hasMcq = headers.some(
    (h, i) =>
      MCQ_HEADERS.has(h) ||
      ['optiona', 'optionb', 'optionc', 'optiond', 'answer'].includes(compact[i])
  );
  const hasCoding = headers.some(
    (h, i) =>
      ['startercode', 'starter', 'tests', 'testcases'].includes(compact[i]) ||
      TESTS_HEADERS.has(h) ||
      h === 'starter code'
  );
  if (hasMcq && !hasCoding) return 'mcq';
  return 'coding';
}

function parseMcqFile(filename, data, defaultRole = 'Custom Interview') {
  const rows = readRows(filename, data);
  if (!rows.length) return [];

  const headers = (rows[0] || []).map(norm);
  const headerMap = {};
  headers.forEach((h, idx) => {
    const hc = h.replace(/ /g, '').replace(/_/g, '');
    if (QUESTION_HEADERS.has(h) || ['question', 'q', 'prompt'].includes(hc)) {
      if (headerMap.question == null) headerMap.question = idx;
    } else if (hc === 'optiona' || hc === 'a' || h === 'option a') {
      if (headerMap.a == null) headerMap.a = idx;
    } else if (hc === 'optionb' || hc === 'b' || h === 'option b') {
      if (headerMap.b == null) headerMap.b = idx;
    } else if (hc === 'optionc' || hc === 'c' || h === 'option c') {
      if (headerMap.c == null) headerMap.c = idx;
    } else if (hc === 'optiond' || hc === 'd' || h === 'option d') {
      if (headerMap.d == null) headerMap.d = idx;
    } else if (['answer', 'correct', 'correctanswer'].includes(hc)) {
      if (headerMap.answer == null) headerMap.answer = idx;
    } else if (hc === 'difficulty' || hc === 'level') {
      if (headerMap.difficulty == null) headerMap.difficulty = idx;
    }
  });
  if (headerMap.question == null) headerMap.question = 0;

  const questions = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] || [];
    const qIdx = headerMap.question;
    const question = cell(qIdx < cells.length ? cells[qIdx] : '');
    if (!question) continue;

    const options = [];
    for (const [key, label] of [
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
      ['d', 'D'],
    ]) {
      if (headerMap[key] != null && headerMap[key] < cells.length) {
        const opt = cell(cells[headerMap[key]]);
        if (opt) options.push(`${label}) ${opt}`);
      }
    }

    let answer = '';
    if (headerMap.answer != null && headerMap.answer < cells.length) {
      answer = cell(cells[headerMap.answer]);
    }
    let difficulty = '';
    if (headerMap.difficulty != null && headerMap.difficulty < cells.length) {
      difficulty = cell(cells[headerMap.difficulty]);
    }

    let fullQ = question;
    if (options.length) fullQ = `${question}\n${options.join('\n')}`;
    if (answer) fullQ += `\n(Choose the correct option. Correct answer key for evaluator: ${answer})`;

    questions.push({
      id: questions.length + 1,
      question: fullQ,
      role: defaultRole,
      category: difficulty || 'MCQ',
      answer,
      is_coding: false,
    });
  }
  return questions;
}

function mapHeaders(headers) {
  const mapping = { inputs: [], outputs: [] };
  headers.forEach((header, idx) => {
    const key = norm(header).replace(/_/g, ' ');
    const keyCompact = key.replace(/ /g, '');
    if (QUESTION_HEADERS.has(key) || keyCompact === 'question' || keyCompact === 'problem') {
      if (mapping.question == null) mapping.question = idx;
    } else if (LANGUAGE_HEADERS.has(key) || keyCompact === 'language' || keyCompact === 'lang') {
      if (mapping.language == null) mapping.language = idx;
    } else if (STARTER_HEADERS.has(keyCompact) || key === 'starter code' || key === 'boilerplate') {
      if (mapping.starter_code == null) mapping.starter_code = idx;
    } else if (TESTS_HEADERS.has(key) || keyCompact === 'tests' || keyCompact === 'testcases') {
      if (mapping.tests == null) mapping.tests = idx;
    } else if (EXPLANATION_HEADERS.has(key)) {
      if (mapping.explanation == null) mapping.explanation = idx;
    } else if (/^input\s*\d+$/.test(key) || /^in\s*\d+$/.test(key)) {
      const n = parseInt(key.match(/\d+/)[0], 10);
      mapping.inputs.push([idx, n]);
    } else if (/^(expected|output|out)\s*\d+$/.test(key)) {
      const n = parseInt(key.match(/\d+/)[0], 10);
      mapping.outputs.push([idx, n]);
    }
  });
  return mapping;
}

function parseTestsCell(raw) {
  raw = String(raw || '').trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          input: String(item.input ?? item.stdin ?? ''),
          expected: String(item.expected ?? item.output ?? item.stdout ?? ''),
        }));
    }
  } catch (_) {
    /* fall through */
  }

  const tests = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.includes('=>')) {
      const [left, ...rest] = line.split('=>');
      tests.push({ input: left.trim(), expected: rest.join('=>').trim() });
    }
  }
  return tests;
}

function normalizeLanguage(raw, defaultLang = 'javascript') {
  let lang = String(raw || defaultLang)
    .toLowerCase()
    .trim();
  lang = LANG_ALIASES[lang] || lang;
  if (!SUPPORTED_LANGS.has(lang)) return defaultLang;
  return lang;
}

function defaultStarter(language) {
  const lang = normalizeLanguage(language);
  const starters = {
    python:
      '# Read from stdin and write to stdout\n' +
      'import sys\n' +
      'data = sys.stdin.read().strip()\n' +
      'print(data)\n',
    javascript:
      "// Read from stdin and write to stdout\n" +
      "const fs = require('fs');\n" +
      "const input = fs.readFileSync(0, 'utf8').trim();\n" +
      'console.log(input);\n',
    node:
      "const fs = require('fs');\n" +
      "const input = fs.readFileSync(0, 'utf8').trim();\n" +
      'console.log(input);\n',
    express:
      "const express = require('express');\n" +
      'const app = express();\n' +
      "app.get('/', (req, res) => res.send('ok'));\n" +
      'app.listen(3000);\n',
    react: 'export default function App() {\n  return <div>Hello</div>;\n}\n',
    html: '<!DOCTYPE html>\n<html>\n<head><title>App</title></head>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>\n',
    css: 'body {\n  margin: 0;\n  font-family: sans-serif;\n}\n',
    sql: 'SELECT * FROM users WHERE id = 1;\n',
    mssql: 'SELECT TOP 10 * FROM dbo.Users;\n',
    java:
      'import java.util.*;\n' +
      'public class Main {\n' +
      '  public static void main(String[] args) {\n' +
      '    Scanner sc = new Scanner(System.in);\n' +
      '    String input = sc.hasNextLine() ? sc.nextLine() : "";\n' +
      '    System.out.println(input);\n' +
      '  }\n' +
      '}\n',
  };
  return starters[lang] || starters.javascript;
}

function rowsToQuestions(rows) {
  if (!rows || !rows.length) return [];

  const first = (rows[0] || []).map(cell);
  let headerMap = mapHeaders(first);
  let start = headerMap.question != null ? 1 : 0;
  if (headerMap.question == null) {
    headerMap = { question: 0, inputs: [], outputs: [] };
    if (first.length > 1) headerMap.language = 1;
  }

  const questions = [];
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r] || [];
    const qIdx = headerMap.question;
    const question = cell(qIdx < cells.length ? cells[qIdx] : '');
    if (!question) continue;

    let language = 'python';
    if (typeof headerMap.language === 'number' && headerMap.language < cells.length) {
      language = cell(cells[headerMap.language]) || 'python';
    }
    language = normalizeLanguage(language, 'python');

    let starter = '';
    if (typeof headerMap.starter_code === 'number' && headerMap.starter_code < cells.length) {
      starter = cell(cells[headerMap.starter_code]);
    }

    let tests = [];
    if (typeof headerMap.tests === 'number' && headerMap.tests < cells.length) {
      tests = parseTestsCell(cell(cells[headerMap.tests]));
    }

    if (!tests.length) {
      const inputs = [...(headerMap.inputs || [])].sort((a, b) => a[1] - b[1]);
      const outputs = {};
      for (const [idx, n] of headerMap.outputs || []) {
        outputs[n] = idx;
      }
      for (const [idx, n] of inputs) {
        const inp = cell(idx < cells.length ? cells[idx] : '');
        const outIdx = outputs[n];
        const exp = cell(outIdx != null && outIdx < cells.length ? cells[outIdx] : '');
        if (inp || exp) tests.push({ input: inp, expected: exp });
      }
    }

    const hasExplicitTests = tests.length > 0;
    const hasExplicitStarter = Boolean(starter);
    let isCoding = hasExplicitTests || hasExplicitStarter;

    if (!isCoding) {
      starter = '';
      tests = [];
      language = 'text';
    } else if (!starter) {
      starter = defaultStarter(language);
    }

    let explanation = '';
    if (typeof headerMap.explanation === 'number' && headerMap.explanation < cells.length) {
      explanation = cell(cells[headerMap.explanation]);
    }

    questions.push({
      id: questions.length + 1,
      question,
      language,
      starter_code: starter,
      tests,
      explanation,
      is_coding: isCoding,
    });
  }
  return questions;
}

function parseCodingFile(filename, data) {
  return rowsToQuestions(readRows(filename, data));
}

function normalizeManualQuestions(rawQuestions) {
  const questions = [];
  for (const item of rawQuestions || []) {
    if (!item || typeof item !== 'object') continue;
    const question = String(item.question || '').trim();
    if (!question) continue;

    const language = normalizeLanguage(String(item.language || 'javascript'), 'javascript');
    let starter = String(item.starter_code || item.starter || '').trim();
    const testsRaw = item.tests;
    let tests = [];
    if (typeof testsRaw === 'string') {
      tests = parseTestsCell(testsRaw);
    } else if (Array.isArray(testsRaw)) {
      for (const t of testsRaw) {
        if (t && typeof t === 'object') {
          tests.push({
            input: String(t.input ?? t.stdin ?? ''),
            expected: String(t.expected ?? t.output ?? t.stdout ?? ''),
          });
        } else if (typeof t === 'string' && t.includes('=>')) {
          const [left, ...rest] = t.split('=>');
          tests.push({ input: left.trim(), expected: rest.join('=>').trim() });
        }
      }
    }

    const isCoding = SUPPORTED_LANGS.has(language);
    if (!starter) starter = defaultStarter(language);

    questions.push({
      id: questions.length + 1,
      question,
      language,
      starter_code: starter,
      tests,
      explanation: String(item.explanation || '').trim(),
      is_coding: isCoding,
    });
  }
  return questions;
}

function normalizeOutput(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

function runWithTempFile(filename, code, stdinData, cmd, args, timeoutMs = 3000) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mockbee-'));
  const filePath = path.join(tmp, filename);
  try {
    fs.writeFileSync(filePath, code, 'utf8');
    const result = spawnSync(cmd, [...args, filePath], {
      input: stdinData || '',
      encoding: 'utf8',
      timeout: timeoutMs,
      cwd: tmp,
      maxBuffer: 1024 * 1024,
    });
    if (result.error && result.error.code === 'ETIMEDOUT') {
      return ['', 'Time Limit Exceeded', 124];
    }
    if (result.error && result.error.code === 'ENOENT') {
      return ['', `${cmd} is not installed on the server`, 1];
    }
    return [result.stdout || '', result.stderr || '', result.status == null ? 1 : result.status];
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

function runPython(code, stdinData, timeout = 3.0) {
  const blocked = ['os.system', 'subprocess', 'socket', 'shutil.rmtree', "__import__('os')"];
  if (blocked.some((b) => code.includes(b))) {
    return ['', 'Blocked potentially unsafe code', 1];
  }
  return runWithTempFile('solution.py', code, stdinData, 'python', [], timeout * 1000);
}

function runJavascript(code, stdinData, timeout = 3.0) {
  return runWithTempFile('solution.js', code, stdinData, 'node', [], timeout * 1000);
}

function runCodeAgainstTests(language, code, tests) {
  const lang = normalizeLanguage(language, 'python');
  const runnable = new Set(['python', 'javascript', 'node']);
  if (!runnable.has(lang)) {
    return {
      passed: 0,
      total: (tests || []).length,
      all_passed: false,
      pass_rate: 0,
      duration_ms: 0,
      message: `Auto-run is not available for ${lang}. Code will still be submitted for review.`,
      results: (tests || []).map((t, i) => ({
        index: i + 1,
        input: String(t.input || ''),
        expected: String(t.expected || ''),
        actual: '',
        stderr: `Runner not available for ${lang}`,
        passed: false,
        exit_code: -1,
      })),
    };
  }

  const runner = lang === 'javascript' || lang === 'js' || lang === 'node' ? runJavascript : runPython;
  const results = [];
  let passed = 0;
  const started = Date.now();

  for (let i = 0; i < (tests || []).length; i++) {
    const test = tests[i];
    const stdin = String(test.input || '');
    const expected = normalizeOutput(test.expected || '');
    const [stdout, stderr, codeRc] = runner(code, stdin);
    const actual = normalizeOutput(stdout);
    let ok = codeRc === 0 && actual === expected && !String(stderr || '').trim();
    if (codeRc === 0 && actual === expected) ok = true;
    if (ok) passed += 1;
    results.push({
      index: i + 1,
      input: stdin,
      expected,
      actual,
      stderr: String(stderr || '').trim().slice(0, 500),
      passed: ok,
      exit_code: codeRc,
    });
  }

  const total = results.length || 1;
  return {
    passed,
    total: results.length,
    all_passed: passed === results.length && results.length > 0,
    pass_rate: Math.round((passed / total) * 1000) / 10,
    duration_ms: Date.now() - started,
    results,
  };
}

function heuristicCodeEval(question, code, runResult, explanation = '') {
  const passRate = Number(runResult.pass_rate || 0);
  let correctness = Math.max(1, Math.min(10, Math.round(passRate / 10)));

  const lines = String(code || '')
    .split(/\r?\n/)
    .filter((ln) => ln.trim());
  let quality = 6;
  if (lines.length >= 5) quality += 1;
  const codeLower = String(code || '').toLowerCase();
  if (['def ', 'function ', 'const ', 'class '].some((k) => codeLower.includes(k))) quality += 1;
  if (lines.length > 80) quality -= 1;
  quality = Math.max(1, Math.min(10, quality));

  let timeC = code.includes('for ') || code.includes('while ') ? 7 : 8;
  let spaceC = 7;
  if (code.includes('sort(') || code.includes('.sort(')) timeC = 6;

  let explainScore = 4;
  if (explanation && explanation.trim().length > 40) explainScore = 8;
  else if (explanation && explanation.trim().length > 10) explainScore = 6;

  const overall =
    Math.round((correctness * 0.4 + quality * 0.2 + timeC * 0.15 + spaceC * 0.15 + explainScore * 0.1) * 10) /
    10;

  return {
    correctness,
    code_quality: quality,
    time_complexity: timeC,
    space_complexity: spaceC,
    explanation: explainScore,
    overall,
    summary:
      `Passed ${runResult.passed || 0}/${runResult.total || 0} test cases (${passRate}%). ` +
      (runResult.all_passed ? 'All tests passed.' : 'Some tests failed — review edge cases.'),
    feedback: {
      correctness: runResult.all_passed
        ? 'Matches expected outputs on the provided tests.'
        : 'One or more test cases failed.',
      code_quality: 'Structure looks reasonable for an interview solution.',
      time_complexity: 'Estimated from control-flow patterns in the submitted code.',
      space_complexity: 'Estimated from data-structure usage in the submitted code.',
      explanation: explanation
        ? 'Candidate explanation was considered in scoring.'
        : 'No written explanation was provided.',
    },
    question,
  };
}

function heuristicTheoryEval(question, answer, expectedAnswer = '') {
  const text = String(answer || '').trim();
  const q = String(question || '').toLowerCase();
  const expected = String(expectedAnswer || '')
    .trim()
    .toLowerCase();

  if (!text || text.startsWith('(No answer')) {
    return {
      correctness: 2,
      clarity: 2,
      depth: 1,
      relevance: 1,
      overall: 2,
      summary: 'No meaningful answer was provided for this question.',
      feedback: {
        correctness: 'Empty or missing answer.',
        clarity: 'N/A',
        depth: 'N/A',
        relevance: 'N/A',
      },
      strengths: [],
      improvements: ['Provide a complete spoken or typed answer.', 'Cover key concepts from the question.'],
    };
  }

  const words = text.match(/[a-zA-Z0-9]+/g) || [];
  const wordCount = words.length;
  let clarity = 5;
  let depth = 4;
  let relevance = 5;
  let correctness = 5;

  if (wordCount >= 12) {
    clarity += 1;
    depth += 1;
  }
  if (wordCount >= 30) {
    clarity += 1;
    depth += 2;
  }
  if (wordCount >= 60) depth += 1;
  if (wordCount < 6) {
    clarity -= 2;
    depth -= 2;
    correctness -= 1;
  }

  const qWords = new Set((q.match(/[a-z0-9]+/g) || []).filter((w) => w.length > 3));
  const aWords = new Set(words.filter((w) => w.length > 3).map((w) => w.toLowerCase()));
  if (qWords.size) {
    let overlapCount = 0;
    for (const w of qWords) if (aWords.has(w)) overlapCount += 1;
    const overlap = overlapCount / Math.max(1, qWords.size);
    if (overlap >= 0.15) {
      relevance += 2;
      correctness += 1;
    } else if (overlap < 0.05) {
      relevance -= 1;
    }
  }

  if (expected) {
    const ansL = text.toLowerCase().trim();
    if (ansL.includes(expected) || expected.includes(ansL)) {
      correctness = 9;
      relevance = 9;
    } else if (new RegExp(`\\b${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(ansL)) {
      correctness = 8;
      relevance = 8;
    } else if (expected.length === 1 && 'abcd'.includes(expected)) {
      if (new RegExp(`\\b${expected}\\b`).test(ansL) || ansL.includes(`option ${expected}`)) {
        correctness = 9;
        relevance = 9;
      }
    }
  }

  clarity = Math.max(1, Math.min(10, clarity));
  depth = Math.max(1, Math.min(10, depth));
  relevance = Math.max(1, Math.min(10, relevance));
  correctness = Math.max(1, Math.min(10, correctness));
  const overall = Math.round((correctness * 0.35 + clarity * 0.25 + depth * 0.2 + relevance * 0.2) * 10) / 10;

  const strengths = [];
  const improvements = [];
  if (clarity >= 7) strengths.push('Answer was reasonably clear and readable.');
  if (depth >= 7) strengths.push('Included decent detail / explanation.');
  if (relevance >= 7) strengths.push('Stayed relevant to the question topic.');
  if (wordCount < 15) improvements.push('Expand the answer with more concrete detail.');
  if (correctness < 7) improvements.push('Improve technical accuracy of the response.');
  if (!strengths.length) strengths.push('Attempted the question.');
  if (!improvements.length) improvements.push('Add examples to strengthen the answer.');

  return {
    correctness,
    clarity,
    depth,
    relevance,
    overall,
    summary: `Scored ${overall}/10 based on clarity, depth, and relevance (${wordCount} words).`,
    feedback: {
      correctness: 'Accuracy relative to the question topic.',
      clarity: 'How clearly the idea was communicated.',
      depth: 'Level of detail and reasoning.',
      relevance: 'How directly the answer addressed the question.',
    },
    strengths,
    improvements,
  };
}

function buildFinalReport(title, candidateName, transcript) {
  const items = transcript || [];
  const scores = items.map((i) => Number((i.analysis || {}).overall || 0));
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  const codingN = items.filter((i) => i.mode === 'coding').length;
  const theoryN = items.length - codingN;
  let passedTests = 0;
  let totalTests = 0;
  for (const i of items) {
    const run = i.run || {};
    passedTests += Number(run.passed || 0);
    totalTests += Number(run.total || 0);
  }

  const strengths = [];
  const improvements = [];
  for (const i of items) {
    const analysis = i.analysis || {};
    for (const s of analysis.strengths || []) {
      if (s && !strengths.includes(s)) strengths.push(s);
    }
    for (const s of analysis.improvements || []) {
      if (s && !improvements.includes(s)) improvements.push(s);
    }
  }

  let grade;
  let recommendation;
  if (avg >= 8) {
    grade = 'Excellent';
    recommendation = 'Strong performance. Ready for the next interview round.';
  } else if (avg >= 6.5) {
    grade = 'Good';
    recommendation = 'Solid foundation. Polish weak areas and retry similar questions.';
  } else if (avg >= 5) {
    grade = 'Average';
    recommendation = 'Needs more practice on core concepts and clearer explanations.';
  } else {
    grade = 'Needs Improvement';
    recommendation = 'Revise fundamentals and practice answering out loud with structure.';
  }

  if (!strengths.length) strengths.push('Completed the interview session.');
  if (!improvements.length) improvements.push('Review incorrect or shallow answers and practice again.');

  const summary =
    `${candidateName || 'Candidate'} completed ${items.length} question(s) ` +
    `(${theoryN} theory, ${codingN} coding) for "${title || 'Interview'}". ` +
    `Overall score ${avg}/10 (${grade}). ${recommendation}`;

  return {
    overall: avg,
    grade,
    recommendation,
    summary,
    totalQuestions: items.length,
    theoryCount: theoryN,
    codingCount: codingN,
    testsPassed: passedTests,
    testsTotal: totalTests,
    strengths: strengths.slice(0, 6),
    improvements: improvements.slice(0, 6),
    items,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

module.exports = {
  detectSheetKind,
  parseMcqFile,
  parseCodingFile,
  normalizeManualQuestions,
  runCodeAgainstTests,
  heuristicCodeEval,
  heuristicTheoryEval,
  buildFinalReport,
};
