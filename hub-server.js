const http = require('http');
const fs   = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const LOGIN_HTML  = path.join(__dirname, 'hub-login.html');
const SELECT_HTML = path.join(__dirname, 'hub-select.html');

// ── User config ──────────────────────────────────────────────
const USERS = {
  'info@socialremedy.com.au':  { password: 'Remedy2481#!',   url: 'http://lz131lg6ykxav5xdpqsmmmho.170.64.219.239.sslip.io/' },
  'hello@socialremedy.com.au': { password: 'SRSocial2481#!', url: 'http://hm4zp8jkuc3qz0ayiw7uhcks.170.64.219.239.sslip.io/' },
  'hello@b3.fitness':          { password: 'B3Social2481#!', url: 'http://kofzgzd044zhbdltv8a4q0qi.170.64.219.239.sslip.io/' },
  'benny@socialremedy.com.au': { password: 'Remedy2481#!',   url: '/select' },
};

// ── Gmail config ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'hello@socialremedy.com.au',
    pass: 'qqjp pkym xhbw qgra',
  }
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

  // Step 1: Check email + password, send code
  if (req.method === 'POST' && req.url === '/auth/login') {
    try {
      const { email, password } = await parseBody(req);
      const user = USERS[email?.toLowerCase()];
      if (!user || user.password !== password) {
        return json(res, 401, { ok: false });
      }
      // Generate and store code (expires in 10 minutes)
      const code = generateCode();
      pendingCodes[email.toLowerCase()] = {
        code,
        expires: Date.now() + 10 * 60 * 1000
      };
      // Send email
      await transporter.sendMail({
        from: '"Social Remedy Hub" <hello@socialremedy.com.au>',
        to: email,
        subject: 'Your Staff Hub verification code',
        html: `
          <div style="font-family:Montserrat,Arial,sans-serif;max-width:400px;margin:0 auto;padding:40px 20px;background:#000;color:#f5f0e8">
            <div style="text-align:center;margin-bottom:32px">
              <div style="font-size:13px;font-weight:600;letter-spacing:4px;color:#f5f0e8">SOCIAL REMEDY</div>
              <div style="font-size:10px;letter-spacing:4px;color:#b5a06a;margin-top:4px">STAFF HUB</div>
            </div>
            <div style="background:#3d3d38;border-radius:4px;padding:32px;text-align:center;border:1px solid rgba(181,160,106,0.2)">
              <p style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:24px;letter-spacing:1px">YOUR VERIFICATION CODE</p>
              <div style="font-size:40px;font-weight:600;letter-spacing:12px;color:#b5a06a">${code}</div>
              <p style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:24px">Expires in 10 minutes</p>
            </div>
            <p style="text-align:center;font-size:11px;color:rgba(255,255,255,0.2);margin-top:24px">If you did not request this code, please ignore this email.</p>
          </div>
        `
      });
      json(res, 200, { ok: true });
    } catch(e) {
      console.error('Login error:', e);
      json(res, 500, { ok: false, error: e.message });
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
