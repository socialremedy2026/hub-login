const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOGIN_HTML  = path.join(__dirname, 'hub-login.html');
const SELECT_HTML = path.join(__dirname, 'hub-select.html');
const DASH_HTML   = path.join(__dirname, 'hub-dashboard.html');

// ── User config ──────────────────────────────────────────────
const USERS = {
  'info@socialremedy.com.au':    { password: process.env.PASS_ARDEN,   proxy: 'arden' },
  'hello@socialremedy.com.au':   { password: process.env.PASS_JULIA,   proxy: 'ops' },
  'hello@b3.fitness':            { password: process.env.PASS_BRIONY,  proxy: 'b3' },
  'benny@socialremedy.com.au':   { password: process.env.PASS_BENNY,   proxy: null, url: '/select' },
  'studio@socialremedy.com.au':  { password: process.env.PASS_NATALYA, proxy: 'natalya' },
};

// ── Proxy targets (internal ports) ───────────────────────────
const PROXY_TARGETS = {
  arden:   { host: 'localhost', port: 3003 },
  ops:     { host: 'localhost', port: 3001 },
  b3:      { host: 'localhost', port: 3002 },
  natalya: { host: 'localhost', port: 3005 },
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

function proxyRequest(req, res, target, stripPrefix) {
  let targetPath = req.url;
  if (stripPrefix) targetPath = targetPath.slice(stripPrefix.length) || '/';

  const options = {
    hostname: target.host,
    port: target.port,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  };

  const proxyReq = http.request(options, proxyRes => {
    // Remove X-Frame-Options so iframe works
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Dashboard unavailable');
  });

  req.pipe(proxyReq);
}

// ── Server ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // Serve login page
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(LOGIN_HTML).pipe(res);
    return;
  }

  // Serve dashboard iframe wrapper
  if (req.method === 'GET' && (req.url === '/dashboard' || req.url.startsWith('/dashboard?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(DASH_HTML).pipe(res);
    return;
  }

  // Serve Benny's dashboard selector
  if (req.method === 'GET' && req.url === '/select') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(SELECT_HTML).pipe(res);
    return;
  }

  // Proxy dashboard routes
  for (const [name, target] of Object.entries(PROXY_TARGETS)) {
    const prefix = `/proxy/${name}`;
    if (req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?')) {
      proxyRequest(req, res, target, prefix);
      return;
    }
  }

  // Login
  if (req.method === 'POST' && req.url === '/auth/login') {
    try {
      const { email, password } = await parseBody(req);
      const user = USERS[email?.toLowerCase()];
      if (!user || user.password !== password) {
        return json(res, 401, { ok: false });
      }
      if (user.url) {
        return json(res, 200, { ok: true, url: user.url });
      }
      json(res, 200, { ok: true, url: `/proxy/${user.proxy}/` });
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
