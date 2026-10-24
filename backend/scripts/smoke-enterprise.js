/**
 * Smoke test: question bank upload → publish interview → answer → report
 * Usage: node scripts/smoke-enterprise.js
 */
const http = require('http');

function req(method, urlPath, { json, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, 'http://127.0.0.1:8001');
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {},
    };
    let body;
    if (json) {
      body = Buffer.from(JSON.stringify(json));
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = body.length;
    }
    if (form) {
      body = form.buf;
      opts.headers['Content-Type'] = `multipart/form-data; boundary=${form.boundary}`;
      opts.headers['Content-Length'] = form.buf.length;
    }
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, body: d });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function multipart(fields, fileField, filename, content, contentType) {
  const boundary = `----bound${Date.now()}`;
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      )
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    )
  );
  chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { boundary, buf: Buffer.concat(chunks) };
}

(async () => {
  const login = await req('POST', '/api/login', {
    json: { email: 'admin', password: process.env.MOCKBEE_ADMIN_PASSWORD || 'mockb@urban' },
  });
  const key = login.body.admin_token;
  if (!key) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
  console.log('OK login');

  const csv = [
    'Question,Category,Topic,Difficulty,Expected Answer,Max Marks,Hint,Follow-up',
    'What is React?,Technical,React,easy,UI library for building UIs with components and virtual DOM,10,,',
    'Explain Node event loop,Technical,Node,medium,libuv phases timers poll check close,10,,',
    '',
  ].join('\n');

  const upload = await req('POST', '/api/enterprise/question-banks/upload', {
    form: multipart({ key, title: 'Smoke Bank' }, 'file', 'smoke.csv', csv, 'text/csv'),
  });
  if (upload.body.status !== 'success') throw new Error(`Upload failed: ${JSON.stringify(upload.body)}`);
  console.log('OK upload', upload.body.bank_id, upload.body.question_count);

  const bankId = upload.body.bank_id;
  const approve = await req('POST', `/api/enterprise/question-banks/${bankId}/approve`, { json: { key } });
  if (approve.body.status !== 'success') throw new Error(JSON.stringify(approve.body));
  console.log('OK approve');

  const iv = await req('POST', '/api/enterprise/interviews', {
    json: {
      key,
      title: 'Smoke Interview',
      question_bank_id: bankId,
      config: {
        job_role: 'React Developer',
        experience_level: 'fresher',
        duration_minutes: 20,
        question_count: 2,
        passing_score: 50,
        interview_mode: 'text',
        allow_follow_ups: false,
      },
    },
  });
  if (iv.body.status !== 'success') throw new Error(JSON.stringify(iv.body));
  const id = iv.body.interview.id;
  console.log('OK interview', id);

  const pub = await req('POST', `/api/enterprise/interviews/${id}/publish`, { json: { key } });
  if (pub.body.status !== 'success') throw new Error(JSON.stringify(pub.body));
  console.log('OK publish', pub.body.invite_url_path);

  const start = await req('POST', `/api/enterprise/invite/${id}/start`, {
    json: { candidate_name: 'Test Candidate', candidate_email: 'test@example.com' },
  });
  if (start.body.status !== 'success') throw new Error(JSON.stringify(start.body));
  const sid = start.body.session_id;
  const token = start.body.submission_token;
  console.log('OK start', sid);

  const a1 = await req('POST', `/api/enterprise/sessions/${sid}/answer`, {
    json: {
      answer:
        'React is a JavaScript library for building user interfaces with components and a virtual DOM.',
      question_index: 0,
      submission_token: token,
    },
  });
  if (a1.body.status !== 'success') throw new Error(JSON.stringify(a1.body));
  console.log('OK answer1', a1.body.evaluation.score, '/', a1.body.evaluation.max_marks);

  const a2 = await req('POST', `/api/enterprise/sessions/${sid}/answer`, {
    json: {
      answer:
        'The Node event loop uses libuv phases including timers, poll, check, and close callbacks for async IO.',
      question_index: 1,
      submission_token: token,
    },
  });
  if (a2.body.status !== 'success') throw new Error(JSON.stringify(a2.body));
  console.log('OK answer2 done=', a2.body.done);

  const done = await req('POST', `/api/enterprise/sessions/${sid}/complete`, {
    json: { duration_seconds: 120 },
  });
  if (done.body.status !== 'success') throw new Error(JSON.stringify(done.body));
  console.log(
    'OK report',
    done.body.report.percentage + '%',
    done.body.report.result_status,
    done.body.report.recommendation
  );

  const analytics = await req('GET', `/api/admin/analytics?key=${encodeURIComponent(key)}`);
  console.log('OK analytics total=', analytics.body.analytics?.total_interviews_conducted);
  console.log('SMOKE PASS');
})().catch((e) => {
  console.error('SMOKE FAIL', e.message || e);
  process.exit(1);
});
