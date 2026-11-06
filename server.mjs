import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UPLOAD_DIR, MIME, SEC_HEADERS, clientIp, send, sendHtml, sendJson, redirect, parseBody, parseCookies, cookieHeader, int, num, rateLimit, saveArtwork } from './lib/util.mjs';
import { getSettings, db, all, run } from './lib/db.mjs';
import { seedIfEmpty } from './lib/seed.mjs';
import { makeCtx, productCard } from './lib/render.mjs';
import { LANGS } from './lib/i18n.mjs';
import * as cat from './lib/catalog.mjs';
import * as cartLib from './lib/cart.mjs';
import * as views from './lib/views.mjs';
import { handleAdmin } from './lib/admin.mjs';
import { notifyNewOrder, notifyNewQuote } from './lib/notify.mjs';
import * as design from './lib/design.mjs';
import { siteUrl } from './lib/seo.mjs';

const PORT = int(process.env.PORT, 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_LIMIT = 12 * 1024 * 1024;

if (seedIfEmpty()) console.log('Seeded demo catalogue (edit it from /admin).');

/* ---------- static files ---------- */
function serveFile(req, res, file, { cache = 'public, max-age=3600' } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext];
  if (!type) return false;
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': type, 'Cache-Control': cache, ETag: etag, ...SEC_HEADERS };
  if (ext === '.pdf') headers['Content-Disposition'] = 'attachment';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}
function safeJoin(base, rel) {
  if (rel.includes('\0')) return null;
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) ? p : null;
}

/* ---------- helpers ---------- */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
}
const wantsJson = (req) => (req.headers.accept || '').includes('application/json') || req.headers['x-requested-with'] === 'fetch';
const str = (v, max = 300) => String(Array.isArray(v) ? v[0] : v ?? '').trim().slice(0, max);
const absoluteSite = (req) => {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return siteUrl(getSettings(), `${proto}://${req.headers.host || 'localhost'}`);
};
/* One address for Google: alshaheed.ps:8081 and www.alshaheed.ps → https://alshaheed.ps (same path). */
function canonicalHostRedirect(req) {
  const target = siteUrl(getSettings(), '');
  if (!/^https:\/\/[^/]+$/.test(target)) return null;
  const want = target.slice(8).toLowerCase(), host = String(req.headers.host || '').toLowerCase();
  if (host === want || !(host === 'www.' + want || host.startsWith(want + ':') || host.startsWith('www.' + want + ':'))) return null;
  return target + req.url;
}
const phoneOk = (p) => { const d = String(p).replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; };

function detectLang(req) {
  const c = parseCookies(req).sh_lang;
  return LANGS.includes(c) ? c : 'ar'; // Arabic by default; English only when the visitor picked it
}
// Temporary links (bare IP / sslip.io / nip.io) or NOINDEX=1 must not be indexed by search engines.
const isTempHost = (req) => {
  if (process.env.NOINDEX === '1') return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  return /(^|\.)(sslip|nip)\.io$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost';
};

function baseCtx(req, lang, extra = {}) {
  const ctx = makeCtx(req, { lang, settings: getSettings(), cartCount: 0, pathAfterLang: '/', query: {}, ...extra });
  ctx.depts = cat.departments();
  ctx.cats = cat.categories();
  return ctx;
}

/* ---------- main router ---------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (isTempHost(req)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const hostFix = canonicalHostRedirect(req);
  if (hostFix && (req.method === 'GET' || req.method === 'HEAD')) return redirect(res, hostFix, 301);
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (pathname.length > 1 && pathname.endsWith('/')) return redirect(res, pathname.slice(0, -1) + url.search, 301);

  const isRead = req.method === 'GET' || req.method === 'HEAD';
  if (!isRead && req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD, POST' });
  if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, 'Forbidden');

  if (isRead) {
    if (pathname === '/healthz') return sendJson(res, { ok: true });
    if (/^\/(css|js|img)\//.test(pathname)) {
      const f = safeJoin(PUBLIC_DIR, pathname.slice(1));
      // same picture, ~6× lighter: browsers that take WebP get the .webp twin of a .png when one exists
      if (f && f.endsWith('.png') && /image\/webp/.test(req.headers.accept || '')) {
        res.setHeader('Vary', 'Accept');
        if (serveFile(req, res, f.slice(0, -4) + '.webp', { cache: 'public, max-age=86400' })) return;
      }
      if (f && serveFile(req, res, f, { cache: 'public, max-age=86400' })) return;
      return send(res, 404, 'Not found');
    }
    if (pathname.startsWith('/uploads/')) {
      const f = safeJoin(UPLOAD_DIR, pathname.slice('/uploads/'.length));
      if (f && serveFile(req, res, f, { cache: 'public, max-age=604800' })) return;
      return send(res, 404, 'Not found');
    }
    if (pathname === '/favicon.ico') return redirect(res, '/img/favicon.png', 301);
    if (pathname === '/robots.txt') {
      if (isTempHost(req)) return send(res, 200, 'User-agent: *\nDisallow: /\n', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /designer\nDisallow: /*/design/\nDisallow: /*/cart\nDisallow: /*/checkout\nDisallow: /*/track\nDisallow: /*/search\nSitemap: ${absoluteSite(req)}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (pathname === '/sitemap.xml') return sitemap(req, res);
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const handled = await handleAdmin(req, res, url, pathname.slice('/admin'.length) || '/');
    if (handled || res.headersSent) return;
    return send(res, 404, 'Not found');
  }

  if (pathname === '/designer' || pathname.startsWith('/designer/')) {
    const handled = await design.handleDesigner(req, res, url, pathname.slice('/designer'.length) || '/');
    if (handled || res.headersSent) return;
    return send(res, 404, 'Not found');
  }

  if (pathname === '/') return redirect(res, `/${detectLang(req)}${url.search}`, 302);

  const m = /^\/(ar|en)(\/.*)?$/.exec(pathname);
  if (!m) return sendHtml(res, views.notFoundPage(baseCtx(req, detectLang(req))).toString(), 404, SEC_HEADERS);

  const lang = m[1];
  const sub = m[2] || '/';
  const query = Object.fromEntries(url.searchParams);
  const lines = cartLib.readCartCookie(req);
  const ctx = baseCtx(req, lang, { cartCount: lines.length, pathAfterLang: sub, query });
  const page = (raw, status = 200, headers = {}) =>
    raw == null ? notFound() : sendHtml(res, raw.toString(), status, { ...SEC_HEADERS, ...headers, 'Set-Cookie': [cookieHeader('sh_lang', lang, { maxAge: 31536000, httpOnly: false }), ...[].concat(headers['Set-Cookie'] || [])] });
  const notFound = () => sendHtml(res, views.notFoundPage(ctx).toString(), 404, SEC_HEADERS);
  const go = (to, cookies = []) => redirect(res, to, 303, { 'Set-Cookie': cookies });

  let mm;
  if (isRead) {
    if (sub === '/') return page(views.home(ctx));
    if (sub === '/shop') return page(views.listing(ctx, { kind: 'shop' }));
    if (sub === '/search') return page(views.listing(ctx, { kind: 'search' }));
    if ((mm = /^\/dept\/([^/]+)$/.exec(sub))) return page(views.department(ctx, mm[1]));
    if ((mm = /^\/category\/([^/]+)$/.exec(sub))) return page(views.listing(ctx, { kind: 'category', slug: mm[1] }));
    if ((mm = /^\/product\/([^/]+)$/.exec(sub))) return page(views.product(ctx, mm[1]));
    if (sub === '/quote') return page(views.quotePage(ctx));
    if (sub === '/quote/success') {
      const q = cartLib.quoteByNumber(str(query.n, 40));
      return q ? page(views.quoteSuccess(ctx, q)) : notFound();
    }
    if (sub === '/cart') {
      const cart = cartLib.hydrate(lines);
      const notice = cart.removed ? ctx.t('cart.unavailable') : cart.adjusted ? ctx.t('cart.adjusted') : '';
      const fix = cart.adjusted || cart.removed ? { 'Set-Cookie': cartLib.cartCookie(cart.items.map((i) => ({ vid: i.vid, qty: i.qty }))) } : {};
      return page(views.cartPage(ctx, cart, notice), 200, fix);
    }
    if (sub === '/checkout') {
      const cart = cartLib.hydrate(lines);
      if (!cart.items.length) return go(ctx.L('/cart'));
      return page(views.checkoutPage(ctx, cart));
    }
    if (sub === '/order/success') {
      const order = cartLib.orderByNumber(str(query.n, 40));
      return order ? page(views.successPage(ctx, order)) : notFound();
    }
    if (sub === '/track') return page(views.trackPage(ctx));
    if ((mm = /^\/design\/([^/]+)$/.exec(sub))) {
      const o = design.customerOrder(mm[1], str(query.k, 64));
      return o ? page(design.customerPage(ctx, o, { flash: design.okMessage(ctx, query.ok) })) : notFound();
    }
    if (sub === '/wishlist') return page(views.wishlistPage(ctx));
    if (sub === '/wishlist/items') {
      const ids = String(query.ids || '').split(',').map((x) => int(x)).filter((x) => x > 0).slice(0, 60);
      const items = ids.length ? cat.listProducts({ ids, limit: 60 }).items : [];
      const frag = items.length ? `<div class="grid">${items.map((p) => productCard(ctx, p)).join('')}</div>` : '';
      return send(res, 200, frag, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (sub === '/about') return page(views.aboutPage(ctx));
    if (sub === '/contact') return page(views.contactPage(ctx));
    if ((mm = /^\/policy\/([a-z]+)$/.exec(sub))) return page(views.policyPage(ctx, mm[1]));
    return notFound();
  }

  /* POST */
  const big = sub === '/checkout' || sub === '/quote' || sub.startsWith('/design/');
  const { fields, files } = await parseBody(req, big ? UPLOAD_LIMIT : 64 * 1024);

  if (sub === '/cart/add') {
    const vid = int(fields.variant), qty = Math.max(1, int(fields.qty, 1));
    const r = cartLib.addToCart(lines, vid, qty);
    const cookie = cartLib.cartCookie(r.lines);
    if (wantsJson(req)) {
      return send(res, r.ok ? 200 : 409, JSON.stringify({ ok: r.ok, count: r.lines.length }), { 'Content-Type': 'application/json', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' });
    }
    return go(ctx.L('/cart'), [cookie]);
  }

  if (sub === '/cart/update') {
    const remove = int(fields.remove);
    const next = lines.filter((l) => l.vid !== remove).map((l) => ({ vid: l.vid, qty: Math.max(1, int(fields['qty_' + l.vid], l.qty)) }));
    const cart = cartLib.hydrate(next);
    return go(ctx.L('/cart'), [cartLib.cartCookie(cart.items.map((i) => ({ vid: i.vid, qty: i.qty })))]);
  }

  if (sub === '/checkout') return checkoutPost();
  if (sub === '/quote') return quotePost();
  if (sub === '/track') return trackPost();
  if ((mm = /^\/design\/([^/]+)$/.exec(sub))) {
    const o = design.customerOrder(mm[1], str(fields.k, 64));
    if (!o) return notFound();
    const r = design.customerPost(req, o, fields, files);
    if (r.error) return page(design.customerPage(ctx, design.customerOrder(mm[1], o.token), { error: r.error }), 422);
    return go(design.designLink(o, lang) + '&ok=' + encodeURIComponent(str(fields.act, 10)) + (fields.act === 'msg' ? '#end' : ''));
  }
  return notFound();

  /* ---- POST handlers ---- */
  function checkoutPost() {
    const { t } = ctx;
    const cart = cartLib.hydrate(lines);
    if (!cart.items.length) return go(ctx.L('/cart'));
    const values = {
      name: str(fields.name, 100), phone: str(fields.phone, 30), email: str(fields.email, 120), business: str(fields.business, 120), zone: str(fields.zone, 10),
      city: str(fields.city, 100), address: str(fields.address, 300), notes: str(fields.notes, 1000), payment: str(fields.payment, 10),
      art: str(fields.art, 10), brief: str(fields.brief, 3000),
    };
    if (!rateLimit('co:' + clientIp(req), 12, 15 * 60 * 1000)) return page(views.checkoutPage(ctx, cart, { values, banner: t('co.err.rate') }), 429);
    const errors = {};
    const zone = cat.zones().find((z) => String(z.id) === values.zone);
    const S = ctx.S;
    if (values.name.length < 2) errors.name = t('co.err.name');
    if (!phoneOk(values.phone)) errors.phone = t('co.err.phone');
    if (!zone) errors.zone = t('co.err.zone');
    if (values.address.length < 3) errors.address = t('co.err.address');
    if (!(values.payment === 'cod' && S.cod_enabled === '1') && !(values.payment === 'card' && S.card_enabled === '1')) errors.payment = t('co.err.payment');
    if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) values.email = '';
    const dq = design.designEnabled(S) ? design.designQuote(cart.items) : { fee: 0 };
    const wantsDesign = values.art === 'design' && dq.fee > 0;
    if (wantsDesign && values.brief.length < 5) errors.brief = t('co.err.brief');
    let logo = null;
    if (!Object.keys(errors).length) {
      try { logo = saveArtwork(files.logo); } catch (e) { errors.logo = `${t('co.err.file')}: ${e.message}`; }
    }
    if (Object.keys(errors).length) return page(views.checkoutPage(ctx, cart, { values, errors }), 422);

    const shipping = cartLib.shippingFor(cart.subtotal, zone, Number(S.free_shipping_min) || 0);
    try {
      const o = cartLib.placeOrder({ items: cart.items, form: values, zone, shipping, subtotal: cart.subtotal, lang, logo,
        design: wantsDesign ? { fee: dq.fee, brief: values.brief } : null, token: design.newToken() });
      const order = cartLib.orderByNumber(o.number);
      try { notifyNewOrder(order, cartLib.orderItems(order.id)); } catch (e) { console.error('notify failed', e.message); }
      return go(ctx.L('/order/success?n=' + encodeURIComponent(o.number)), [cartLib.clearCartCookie()]);
    } catch (e) {
      if (e.code === 'stock') return page(views.checkoutPage(ctx, cartLib.hydrate(lines), { values, banner: t('co.err.stock') }), 409);
      throw e;
    }
  }

  function quotePost() {
    const { t } = ctx;
    const values = {
      dept: int(fields.dept), product: int(fields.product), name: str(fields.name, 100), phone: str(fields.phone, 30), business: str(fields.business, 120),
      city: str(fields.city, 100), width: Math.max(0, num(fields.width)), height: Math.max(0, num(fields.height)), qty: Math.max(0, int(fields.qty)),
      budget: str(fields.budget, 60), details: str(fields.details, 3000),
    };
    const product = values.product ? cat.getProductById(values.product) : null;
    const dept = cat.departments().find((d) => d.id === (product ? product.did : values.dept)) || null;
    const back = (errors, status = 422, banner = '') => {
      const shown = { ...values, width: values.width || '', height: values.height || '', qty: values.qty || '' };
      return product
        ? page(views.product(ctx, product.slug, { quoteValues: shown, quoteErrors: errors }), status)
        : page(views.quotePage(ctx, { values: shown, errors: { ...errors, ...(banner && { details: banner }) } }), status);
    };
    if (!rateLimit('q:' + clientIp(req), 10, 15 * 60 * 1000)) return back({ details: t('co.err.rate') }, 429);
    const errors = {};
    if (values.name.length < 2) errors.name = t('co.err.name');
    if (!phoneOk(values.phone)) errors.phone = t('co.err.phone');
    if (values.details.length < 3 && !product) errors.details = t('q.err.details');
    let file = null;
    if (!Object.keys(errors).length) {
      try { file = saveArtwork(files.file); } catch (e) { errors.file = `${t('co.err.file')}: ${e.message}`; }
    }
    if (Object.keys(errors).length) return back(errors);
    const number = cartLib.nextNumber('Q', 'quotes');
    run(`INSERT INTO quotes(number, department_id, department_name, product_id, product_name, name, phone, business, city, width, height, qty, budget, details, file, file_name, lang)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number, dept?.id || null, dept?.name_ar || '', product?.id || null, product?.name_ar || '', values.name, values.phone, values.business, values.city,
      values.width, values.height, values.qty, values.budget, values.details, file?.path || '', file?.name || '', lang);
    try { notifyNewQuote(cartLib.quoteByNumber(number)); } catch (e) { console.error('notify failed', e.message); }
    return go(ctx.L('/quote/success?n=' + encodeURIComponent(number)));
  }

  function trackPost() {
    const { t } = ctx;
    const values = { number: str(fields.number, 40).toUpperCase(), phone: str(fields.phone, 30) };
    if (!rateLimit('tr:' + clientIp(req), 15, 10 * 60 * 1000)) return page(views.trackPage(ctx, { values, error: t('co.err.rate') }), 429);
    const order = cartLib.orderByNumber(values.number);
    const norm = (p) => String(p).replace(/\D/g, '').replace(/^(00)?(972|970)/, '0').replace(/^0+/, '0');
    if (!order || norm(order.phone) !== norm(values.phone) || norm(values.phone).length < 8) {
      return page(views.trackPage(ctx, { values, notFound: true }), 404);
    }
    return page(views.trackPage(ctx, { order, items: cartLib.orderItems(order.id), values, designUrl: order.design ? design.designLink(order, lang) : '' }));
  }
}

/* ---------- sitemap ---------- */
function sitemap(req, res) {
  const site = absoluteSite(req);
  const urls = ['', '/shop', '/quote', '/about', '/contact', '/policy/shipping', '/policy/terms', '/policy/privacy'];
  for (const d of all('SELECT slug FROM departments')) urls.push('/dept/' + d.slug);
  for (const c of all('SELECT slug FROM categories')) urls.push('/category/' + c.slug);
  for (const p of all('SELECT slug FROM products WHERE active = 1')) urls.push('/product/' + encodeURIComponent(p.slug));
  const alt = (u) => `<xhtml:link rel="alternate" hreflang="ar" href="${site}/ar${u}"/><xhtml:link rel="alternate" hreflang="en" href="${site}/en${u}"/>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.map((u) => `<url><loc>${site}/ar${u}</loc>${alt(u)}</url>\n<url><loc>${site}/en${u}</loc>${alt(u)}</url>`).join('\n') + '\n</urlset>';
  send(res, 200, xml, { 'Content-Type': 'application/xml; charset=utf-8' });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    console.error('[error]', req.method, req.url, e);
    if (res.headersSent) { res.end(); return; }
    const status = e.status || 500;
    try { sendHtml(res, views.errorPage(baseCtx(req, /^\/en(\/|$)/.test(req.url) ? 'en' : 'ar')).toString(), status, SEC_HEADERS); }
    catch { send(res, status, 'Server error'); }
  }
});
server.requestTimeout = 60000;
server.headersTimeout = 15000;
server.listen(PORT, HOST, () => {
  console.log(`\n  مطبعة الشهيد → http://localhost:${PORT}\n  لوحة التحكم  → http://localhost:${PORT}/admin\n`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => { try { db.close(); } catch {} process.exit(0); }); setTimeout(() => process.exit(0), 2000).unref(); });
