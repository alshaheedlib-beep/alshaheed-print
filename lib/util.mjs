import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- HTML helpers ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Tagged template that escapes interpolations unless they are wrapped with raw(). */
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += renderVal(vals[i]);
  });
  return new Raw(out);
}
function renderVal(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}

/* ---------- misc ---------- */
export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const num = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };

export function money(n) {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2)) + ' ₪';
}

/* ---------- secrets / signing ---------- */
function loadSecret(name, make) {
  const p = path.join(DATA_DIR, name);
  try { return fs.readFileSync(p, 'utf8').trim(); } catch {}
  const v = make();
  fs.writeFileSync(p, v, { mode: 0o600 });
  return v;
}
export const SECRET = process.env.ADMIN_SECRET || loadSecret('.secret', () => crypto.randomBytes(32).toString('hex'));

export function sign(value) {
  const mac = crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
  return `${value}.${mac}`;
}
export function unsign(signed) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expect = sign(value);
  const a = Buffer.from(signed), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}
export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ---------- request helpers ---------- */
export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function cookieHeader(name, value, opts = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${opts.path || '/'}; SameSite=${opts.sameSite || 'Lax'}`;
  if (opts.httpOnly !== false) c += '; HttpOnly';
  if (opts.maxAge != null) c += `; Max-Age=${opts.maxAge}`;
  if (opts.secure) c += '; Secure';
  return c;
}

export function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseUrlEncoded(str) {
  const out = {};
  for (const [k, v] of new URLSearchParams(str)) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** Minimal multipart/form-data parser (fields + files). */
export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: {} };
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const fields = {}, files = {};
  let pos = buf.indexOf(boundary);
  while (pos >= 0) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next < 0) break;
    let part = buf.subarray(pos + boundary.length, next);
    if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) part = part.subarray(0, part.length - 2);
    const sep = part.indexOf('\r\n\r\n');
    if (sep >= 0) {
      const head = part.subarray(0, sep).toString('utf8');
      const body = part.subarray(sep + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      const ctype = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1];
      if (name) {
        if (filename !== undefined) { if (filename) files[name] = { filename, type: ctype, data: body }; }
        else {
          const val = body.toString('utf8');
          if (name in fields) fields[name] = [].concat(fields[name], val); else fields[name] = val;
        }
      }
    }
    pos = next;
  }
  return { fields, files };
}

export async function parseBody(req, limit = 256 * 1024) {
  const ct = req.headers['content-type'] || '';
  if (req.method === 'GET' || req.method === 'HEAD') return { fields: {}, files: {} };
  const buf = await readBody(req, limit);
  if (ct.includes('multipart/form-data')) return parseMultipart(buf, ct);
  if (ct.includes('application/json')) { try { return { fields: JSON.parse(buf.toString('utf8') || '{}'), files: {} }; } catch { return { fields: {}, files: {} }; } }
  return { fields: parseUrlEncoded(buf.toString('utf8')), files: {} };
}

/* ---------- image upload ---------- */
const IMG_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: null },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46] },
};
export function saveImage(file) {
  if (!file || !file.data?.length) return null;
  const spec = IMG_TYPES[file.type];
  if (!spec) throw new Error('Unsupported image type (use JPG, PNG, WEBP or GIF)');
  if (file.data.length > 10 * 1024 * 1024) throw new Error('Image is larger than 10MB');
  if (spec.magic && !spec.magic.every((b, i) => file.data[i] === b)) throw new Error('File content does not match image type');
  if (file.type === 'image/webp' && file.data.subarray(8, 12).toString() !== 'WEBP') throw new Error('File content does not match image type');
  const name = crypto.randomBytes(10).toString('hex') + '.' + spec.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  return '/uploads/' + name;
}

/** Customer artwork (logo / design / shop photo): images or PDF, up to 10MB. Returns { path, name } or null. */
export function saveArtwork(file) {
  if (!file || !file.data?.length) return null;
  const isPdf = file.data.subarray(0, 4).toString() === '%PDF';
  if (!isPdf) {
    const p = saveImage(file);
    return p ? { path: p, name: String(file.filename || '').slice(0, 120) } : null;
  }
  if (file.data.length > 10 * 1024 * 1024) throw new Error('File is larger than 10MB');
  const name = crypto.randomBytes(10).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
  return { path: '/uploads/' + name, name: String(file.filename || '').slice(0, 120) };
}

/* ---------- response helpers ---------- */
export function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { 'Content-Length': buf.length, ...headers });
  res.end(buf);
}
export const sendHtml = (res, body, status = 200, headers = {}) =>
  send(res, status, '<!doctype html>' + body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
export const sendJson = (res, data, status = 200) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
export function redirect(res, to, status = 303, headers = {}) {
  res.writeHead(status, { Location: to, ...headers });
  res.end();
}

export const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf',
};

/* ---------- tiny rate limiter ---------- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++;
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return b.n <= max;
}

/* ---------- shared security helpers ---------- */
export const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; form-action 'self' https://wa.me; base-uri 'self'",
};
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
export const isHttps = (req) => !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
export const clientIp = (req) =>
  (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
