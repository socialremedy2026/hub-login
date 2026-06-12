const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGIN_HTML  = path.join(__dirname, 'hub-login.html');
const SELECT_HTML = path.join(__dirname, 'hub-select.html');

// Shared secret used by dashboards to verify the hub cookie
const HUB_SECRET = process.env.HUB_SECRET || 'sr-hub-secret-2026-change-me';

// ── User config ──────────────────────────────────────────────
const USERS = {
  'info@socialremedy.com.au':    { password: process.env.PASS_ARDEN,   url: 'https://performance.socialremedy.com.au/' },
  'hello@socialremedy.com.au':   { password: process.env.PASS_JULIA,   url: 'https://srops.socialremedy.com.au/' },
  'hello@b3.fitness':            { password: process.env.PASS_BRIONY,  url: 'https://b3ops.socialremedy.com.au/' },
  'benny@socialremedy.com.au':   { password: process.env.PASS_BENNY,   url: '/select' },
  'studio@socialremedy.com.au':  { password: process.env.PASS_NATALYA, url: 'https://pilatesheadteacher.socialremedy.com.au/' },
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Create a signed token (valid for 12 hours)
function createToken(email) {
  const expires = Date.now() + (12 * 60 * 60 * 1000);
  const payload = `${email}:${expires}`;
  const sig = crypto.createHmac('sha256', HUB_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

const server = http.createServer(async (req, res) => {

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(LOGIN_HTML).pipe(res);
    return;
  }

  if (req.method === 'GET' && req.url === '/select') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(SELECT_HTML).pipe(res);
    return;
  }

  // Login
  if (req.method === 'POST' && req.url === '/auth/login') {
    try {
      const { email, password } = await parseBody(req);
      const user = USERS[email?.toLowerCase()];
      if (!user || user.password !== password) {
        return json(res, 401, { ok: false });
      }
      // Set cookie on .socialremedy.com.au so all dashboards can read it
      const token = createToken(email.toLowerCase());
      res.setHeader('Set-Cookie', `sr_auth=${token}; Domain=.socialremedy.com.au; Path=/; Max-Age=43200; Secure; SameSite=Lax`);
      json(res, 200, { ok: true, url: user.url });
    } catch(e) {
      console.error('Login error:', e);
      json(res, 500, { ok: false });
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3004, () => {
  console.log('Hub login running at http://localhost:3004');
});
