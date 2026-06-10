const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOGIN_HTML  = path.join(__dirname, 'hub-login.html');
const SELECT_HTML = path.join(__dirname, 'hub-select.html');
const DASH_HTML   = path.join(__dirname, 'hub-dashboard.html');

const USERS = {
  'info@socialremedy.com.au':    { password: process.env.PASS_ARDEN,   proxy: 'arden' },
  'hello@socialremedy.com.au':   { password: process.env.PASS_JULIA,   proxy: 'ops' },
  'hello@b3.fitness':            { password: process.env.PASS_BRIONY,  proxy: 'b3' },
  'benny@socialremedy.com.au':   { password: process.env.PASS_BENNY,   proxy: null, url: '/select' },
  'studio@socialremedy.com.au':  { password: process.env.PASS_NATALYA, proxy: 'natalya' },
};

const PROXY_TARGETS = {
  arden:   { host: '10.0.1.9',  port: 3003 },
  ops:     { host: '10.0.1.14', port: 3001 },
  b3:      { host: '10.0.1.4',  port: 3002 },
  natalya: { host: '10.0.1.13', port: 3005 },
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

function getCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k.trim()] = (v || '').trim();
  });
  return cookies;
}

function proxyRequest(req, res, target, stripPrefix) {
  let targetPath = req.url;
  if (stripPrefix) targetPath = targetPath.slice(stripPrefix.length) || '/';
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  const options = {
    hostname: target.host,
    port: target.port,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  };

  const proxyReq = http.request(options, proxyRes => {
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

const server = http.createServer(async (req, res) => {

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(LOGIN_HTML).pipe(res);
    return;
  }

  if (req.method === 'GET' && (req.url === '/dashboard' || req.url.startsWith('/dashboard?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(DASH_HTML).pipe(res);
    return;
  }

  if (req.method === 'GET' && req.url === '/select') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(SELECT_HTML).pipe(res);
    return;
  }

  for (const [name, target] of Object.entries(PROXY_TARGETS)) {
    const prefix = `/proxy/${name}`;
    if (req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?')) {
      proxyRequest(req, res, target, prefix);
      return;
    }
  }

  const cookies = getCookies(req);
  const sessionProxy = cookies['sr_proxy'];
  if (sessionProxy && PROXY_TARGETS[sessionProxy]) {
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/') || req.url.startsWith('/public/')) {
      proxyRequest(req, res, PROXY_TARGETS[sessionProxy], null);
      return;
    }
  }

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
      res.setHeader('Set-Cookie', `sr_proxy=${user.proxy}; Path=/; HttpOnly; SameSite=Lax`);
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
