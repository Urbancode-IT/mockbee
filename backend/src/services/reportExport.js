/**
 * Report export helpers — CSV / Excel / simple text PDF payload.
 */
const XLSX = require('xlsx');

function flattenReportRows(report) {
  const rows = [
    ['Field', 'Value'],
    ['Interview ID', report.interview_id || ''],
    ['Session ID', report.session_id || ''],
    ['Candidate', report.candidate_name || ''],
    ['Email', report.candidate_email || ''],
    ['Job Role', report.job_role || ''],
    ['Date', report.interview_date || ''],
    ['Duration (seconds)', report.duration_seconds ?? ''],
    ['Total Score', `${report.total_score ?? ''}/${report.max_score ?? ''}`],
    ['Percentage', report.percentage ?? ''],
    ['Passing Score', report.passing_score ?? ''],
    ['Result Status', report.result_status || ''],
    ['Recommendation', report.recommendation || ''],
    ['Incomplete', report.incomplete ? 'yes' : 'no'],
    ['Advisory Notice', report.advisory_notice || ''],
    [],
    ['Question #', 'Question', 'Category', 'Source', 'AI Follow-up', 'Score', 'Max', 'Transcript', 'Feedback'],
  ];

  for (const q of report.question_wise || []) {
    const ev = q.evaluation || {};
    rows.push([
      q.index,
      q.question || '',
      q.category || '',
      q.source || '',
      q.is_ai_followup ? 'yes' : 'no',
      ev.score ?? '',
      ev.max_marks ?? '',
      q.transcript || '',
      ev.explanation || ev.technical_accuracy_feedback || '',
    ]);
  }

  rows.push([]);
  rows.push(['Category', 'Obtained', 'Max', 'Percentage']);
  for (const c of report.category_performance || []) {
    rows.push([c.category, c.obtained, c.max, c.percentage]);
  }

  return rows;
}

function toCsv(report) {
  const rows = flattenReportRows(report);
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(',')
    )
    .join('\n');
}

function toXlsxBuffer(report) {
  const rows = flattenReportRows(report);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function toPdfText(report) {
  const lines = [
    'MockBee Enterprise Interview Report',
    '===================================',
    `Candidate: ${report.candidate_name || ''}`,
    `Interview ID: ${report.interview_id || ''}`,
    `Session ID: ${report.session_id || ''}`,
    `Job Role: ${report.job_role || ''}`,
    `Date: ${report.interview_date || ''}`,
    `Score: ${report.total_score ?? '—'}/${report.max_score ?? '—'} (${report.percentage ?? '—'}%)`,
    `Passing threshold: ${report.passing_score ?? '—'}%`,
    `Result: ${report.result_status || 'incomplete'}`,
    `Recommendation: ${report.recommendation || ''}`,
    '',
    report.advisory_notice || '',
    '',
    'Question-wise',
    '-------------',
  ];
  for (const q of report.question_wise || []) {
    const ev = q.evaluation || {};
    lines.push(`Q${q.index}. ${q.question || ''}`);
    lines.push(`   Source: ${q.source || 'admin'}${q.is_ai_followup ? ' (AI follow-up)' : ''}`);
    lines.push(`   Score: ${ev.score ?? '—'}/${ev.max_marks ?? '—'}`);
    lines.push(`   Answer: ${q.transcript || ''}`);
    lines.push(`   Feedback: ${ev.explanation || ev.technical_accuracy_feedback || ''}`);
    lines.push('');
  }
  lines.push('Strengths');
  for (const s of report.technical_strengths || []) lines.push(`- ${s}`);
  lines.push('');
  lines.push('Areas for improvement');
  for (const s of report.areas_for_improvement || []) lines.push(`- ${s}`);
  return lines.join('\n');
}

/**
 * Minimal PDF (text-only) without external deps — enough for downloadable reports.
 */
function toSimplePdfBuffer(report) {
  const text = toPdfText(report)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  const escapedLines = text.split('\n').slice(0, 120);
  let y = 750;
  const contentParts = ['BT /F1 10 Tf 40 770 Td 14 TL'];
  for (const line of escapedLines) {
    contentParts.push(`(${line.slice(0, 110)}) Tj T*` );
    y -= 14;
    if (y < 40) break;
  }
  contentParts.push('ET');
  const stream = contentParts.join('\n');
  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n'
  );
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream)} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

module.exports = {
  toCsv,
  toXlsxBuffer,
  toPdfText,
  toSimplePdfBuffer,
};
