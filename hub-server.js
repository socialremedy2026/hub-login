const http = require('http');
const fs   = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const LOGIN_HTML  = path.join(__dirname, 'hub-login.html');
const SELECT_HTML = path.join(__dirname, 'hub-select.html');

// ── User config ──────────────────────────────────────────────
const USERS = {
  'info@socialremedy.com.au':    { password: process.env.PASS_ARDEN,    url: 'http://lz131lg6ykxav5xdpqsmmmho.170.64.219.239.sslip.io/' },
  'hello@socialremedy.com.au':   { password: process.env.PASS_JULIA,    url: 'http://hm4zp8jkuc3qz0ayiw7uhcks.170.64.219.239.sslip.io/' },
  'hello@b3.fitness':            { password: process.env.PASS_BRIONY,   url: 'http://kofzgzd044zhbdltv8a4q0qi.170.64.219.239.sslip.io/' },
  'benny@socialremedy.com.au':   { password: process.env.PASS_BENNY,    url: '/select' },
  'studio@socialremedy.com.au':  { password: process.env.PASS_NATALYA,  url: 'http://y10kl24t4oq7ght4jx21cal1.170.64.219.239.sslip.io/' },
};

// ── Gmail config ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: 'hello@socialremedy.com.au',
    pass: 'qqjpkymxhbwqgra',
  },
  tls: { rejectUnauthorized: false }
});

// ── In-memory code store ──────────────────────────────────────
// { email: { code, expires } }
const pendingCodes = {};

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

// ── Server ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // Serve login page
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(LOGIN_HTML).pipe(res);
    return;
  }

  // Serve Benny's dashboard selector
  if (req.method === 'GET' && req.url === '/select') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(SELECT_HTML).pipe(res);
    return;
  }

  // Step 1: Check email + password — redirect directly
  if (req.method === 'POST' && req.url === '/auth/login') {
    try {
      const { email, password } = await parseBody(req);
      const user = USERS[email?.toLowerCase()];
      if (!user || user.password !== password) {
        return json(res, 401, { ok: false });
      }
      json(res, 200, { ok: true, url: user.url });
    } catch(e) {
      console.error('Login error:', e);
      json(res, 500, { ok: false });
    }
    return;
  }

  // Step 2: Verify code
  if (req.method === 'POST' && req.url === '/auth/verify') {
    try {
      const { email, code } = await parseBody(req);
      const pending = pendingCodes[email?.toLowerCase()];
      if (!pending || pending.code !== code || Date.now() > pending.expires) {
        return json(res, 401, { ok: false });
      }
      // Code is valid — clear it and redirect
      delete pendingCodes[email.toLowerCase()];
      const user = USERS[email.toLowerCase()];
      json(res, 200, { ok: true, url: user.url });
    } catch(e) {
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
