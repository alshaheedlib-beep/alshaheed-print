import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  html, raw, money, int, num, slugify, sign, unsign, safeEqual, parseCookies, cookieHeader, parseBody, saveImage,
  sendHtml, redirect, send, rateLimit, clientIp, isHttps, SEC_HEADERS, DATA_DIR, SECRET,
} from './util.mjs';
import { all, get, run, tx, getSettings, setSetting } from './db.mjs';
import { ORDER_STATUSES, PAY_STATUSES, QUOTE_STATUSES, DEPT_MODES } from './i18n.mjs';
import { restock, orderItems } from './cart.mjs';
import { parseTiers, formatTiers } from './pricing.mjs';

/* ---------- credentials ---------- */
function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const file = path.join(DATA_DIR, '.admin-password');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const pw = crypto.randomBytes(9).toString('base64url');
  fs.writeFileSync(file, pw, { mode: 0o600 });
  console.log(`\n  ⚠ No ADMIN_PASSWORD set. Generated admin password: ${pw}\n    (saved in ${file})\n`);
  return pw;
}
const PASSWORD = adminPassword();
const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'sh_admin';

function session(req) {
  const v = unsign(parseCookies(req)[COOKIE]);
  if (!v) return null;
  const [sid, exp] = v.split('.');
  if (!sid || Number(exp) < Date.now()) return null;
  return { sid, csrf: crypto.createHmac('sha256', SECRET).update('csrf:' + sid).digest('base64url') };
}
const newSessionCookie = (req) =>
  cookieHeader(COOKIE, sign(`${crypto.randomBytes(12).toString('hex')}.${Date.now() + SESSION_MS}`), { maxAge: SESSION_MS / 1000, sameSite: 'Strict', secure: isHttps(req), path: '/admin' });

/* ---------- labels ---------- */
const STATUS_AR = { new: 'جديد', design: 'بالتصميم', approved: 'تم اعتماد التصميم', printing: 'بالطباعة', shipped: 'خرج للتوصيل', delivered: 'تم التسليم', cancelled: 'ملغي' };
const STATUS_CLS = { new: 'st-new', design: 'st-confirmed', approved: 'st-confirmed', printing: 'st-preparing', shipped: 'st-shipped', delivered: 'st-delivered', cancelled: 'st-cancelled' };
const PAY_AR = { pending: 'بانتظار الدفع', paid: 'مدفوع', refunded: 'مُسترد' };
const METHOD_AR = { cod: 'عند الاستلام', card: 'تحويل / بطاقة' };
const QSTATUS_AR = { new: 'جديد', contacted: 'تم التواصل', quoted: 'تم إرسال السعر', won: 'تم الاتفاق', lost: 'لم يتم' };
const QSTATUS_CLS = { new: 'st-new', contacted: 'st-confirmed', quoted: 'st-preparing', won: 'st-delivered', lost: 'st-cancelled' };
const MODE_AR = { cart: 'شراء مباشر (سلة)', quote: 'طلب عرض سعر', wholesale: 'جملة (سلة + أسعار كميات)' };
const str = (v, max = 500) => String(Array.isArray(v) ? v[0] : v ?? '').trim().slice(0, max);
const arr = (v) => (v == null ? [] : [].concat(v));
const time = (s) => html`<time data-utc="${s}">${s}</time>`;
const badge = (cls, text) => html`<span class="b ${cls}">${text}</span>`;
const stBadge = (s) => badge(STATUS_CLS[s] || 'st-new', STATUS_AR[s] || s);
const qBadge = (s) => badge(QSTATUS_CLS[s] || 'st-new', QSTATUS_AR[s] || s);
const toWa = (phone, cc) => {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = String(cc || '970') + d.slice(1);
  return d;
};
const fileLink = (p, name) => (p ? html`<a class="btn sm" href="${p}" target="_blank" rel="noopener">${/\.pdf$/i.test(p) ? 'تنزيل الملف (PDF)' : 'عرض الملف'}</a>${name ? html` <small class="ltr">${name}</small>` : ''}` : html`<span class="muted">لم يُرفع ملف</span>`);

/* ---------- layout ---------- */
function shell(sess, active, title, body, flash) {
  const newOrders = get(`SELECT COUNT(*) n FROM orders WHERE status = 'new'`).n;
  const newQuotes = get(`SELECT COUNT(*) n FROM quotes WHERE status = 'new'`).n;
  const nav = [['', 'لوحة المعلومات', 'dash'], ['/orders', 'الطلبات', 'orders', newOrders], ['/quotes', 'طلبات عروض الأسعار', 'quotes', newQuotes], ['/products', 'المنتجات', 'products'], ['/sections', 'الأقسام والفئات', 'sections'], ['/zones', 'مناطق التوصيل', 'zones'], ['/settings', 'الإعدادات', 'settings']];
  return html`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · لوحة التحكم</title>
<link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="stylesheet" href="/css/admin.css?v=3"></head><body>
<aside class="side"><a class="brand" href="/admin"><img src="/img/logo-light.png" alt="" width="34" height="42"> مطبعة الشهيد <small>لوحة التحكم</small></a>
<nav>${nav.map(([h, l, k, n]) => html`<a href="/admin${h}" ${active === k ? raw('class="on"') : ''}>${l}${n ? html` <i class="dot">${n}</i>` : ''}</a>`)}
<a href="/ar" target="_blank" rel="noopener" class="ext">عرض الموقع ↗</a>
<form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${sess.csrf}"><button class="linkish">تسجيل الخروج</button></form></nav></aside>
<main class="main"><header class="top"><h1>${title}</h1></header>
${flash ? html`<div class="flash ${flash.type}" role="status">${flash.text}</div>` : ''}
${body}</main><script src="/js/admin.js?v=3" defer></script></body></html>`;
}
const csrf = (s) => html`<input type="hidden" name="_csrf" value="${s.csrf}">`;

function flashFrom(url) {
  const m = url.searchParams.get('m');
  if (!m) return null;
  const map = { saved: ['ok', 'تم الحفظ'], created: ['ok', 'تمت الإضافة'], deleted: ['ok', 'تم الحذف'], cancelled: ['ok', 'تم إلغاء الطلب'], locked: ['err', 'الطلب الملغي لا يمكن إعادة تفعيله. أنشئ طلباً جديداً.'], novariant: ['err', 'يجب أن يحتوي المنتج على خيار واحد على الأقل (المقاس والسعر).'], badimg: ['err', 'تعذّر رفع الصورة'] };
  const [type, text] = map[m] || ['ok', m];
  const extra = url.searchParams.get('e');
  return { type, text: extra ? `${text}: ${extra}` : text };
}

/* ---------- login ---------- */
function loginPage(error = '') {
  return html`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>تسجيل الدخول · مطبعة الشهيد</title>
<link rel="stylesheet" href="/css/admin.css?v=3"></head><body class="login"><form class="login-box" method="post" action="/admin/login">
<img src="/img/logo.png" alt="" width="80" height="99"><h1>مطبعة الشهيد</h1><p>لوحة التحكم</p>${error ? html`<div class="flash err">${error}</div>` : ''}
<label>كلمة المرور<input type="password" name="password" autofocus required autocomplete="current-password"></label>
<button class="btn primary" type="submit">دخول</button></form></body></html>`;
}

/* ---------- router ---------- */
export async function handleAdmin(req, res, url, sub) {
  const S = (body, status = 200, headers = {}) => sendHtml(res, body.toString(), status, { ...SEC_HEADERS, 'Cache-Control': 'no-store', ...headers });
  const to = (loc, m, extra) => redirect(res, `/admin${loc}${m ? (loc.includes('?') ? '&' : '?') + 'm=' + encodeURIComponent(m) + (extra ? '&e=' + encodeURIComponent(extra) : '') : ''}`);

  if (sub === '/login') {
    if (req.method === 'GET') return S(loginPage());
    const { fields } = await parseBody(req, 8 * 1024);
    if (!rateLimit('adm:' + clientIp(req), 8, 10 * 60 * 1000)) return S(loginPage('محاولات كثيرة، حاول بعد قليل'), 429);
    if (safeEqual(str(fields.password, 200), PASSWORD)) return redirect(res, '/admin', 303, { 'Set-Cookie': newSessionCookie(req) });
    return S(loginPage('كلمة المرور غير صحيحة'), 401);
  }

  const sess = session(req);
  if (!sess) return redirect(res, '/admin/login');

  let fields = {}, files = {};
  if (req.method === 'POST') {
    ({ fields, files } = await parseBody(req, 12 * 1024 * 1024));
    if (!safeEqual(str(fields._csrf, 100), sess.csrf)) return send(res, 403, 'Invalid CSRF token');
  }
  if (sub === '/logout' && req.method === 'POST') return redirect(res, '/admin/login', 303, { 'Set-Cookie': cookieHeader(COOKIE, '', { maxAge: 0, path: '/admin', sameSite: 'Strict' }) });

  const flash = flashFrom(url);
  let m;
  try {
    if (sub === '/' || sub === '') return S(dashboard(sess, flash));
    if (sub === '/orders') return S(ordersList(sess, url, flash));
    if ((m = /^\/orders\/(\d+)$/.exec(sub))) {
      if (req.method === 'POST') return orderUpdate(+m[1], fields, to);
      const v = orderDetail(sess, +m[1], flash);
      return v ? S(v) : send(res, 404, 'Not found');
    }
    if (sub === '/quotes') return S(quotesList(sess, url, flash));
    if ((m = /^\/quotes\/(\d+)$/.exec(sub))) {
      if (req.method === 'POST') return quoteUpdate(+m[1], fields, to);
      const v = quoteDetail(sess, +m[1], flash);
      return v ? S(v) : send(res, 404, 'Not found');
    }
    if (sub === '/products') return S(productsList(sess, url, flash));
    if (sub === '/products/new') {
      if (req.method === 'POST') return productSave(null, fields, files, to);
      return S(productForm(sess, null, flash, url));
    }
    if ((m = /^\/products\/(\d+)\/delete$/.exec(sub)) && req.method === 'POST') { run('DELETE FROM products WHERE id = ?', +m[1]); return to('/products', 'deleted'); }
    if ((m = /^\/products\/(\d+)\/toggle$/.exec(sub)) && req.method === 'POST') { run('UPDATE products SET active = 1 - active WHERE id = ?', +m[1]); return to('/products', 'saved'); }
    if ((m = /^\/products\/(\d+)$/.exec(sub))) {
      if (req.method === 'POST') return productSave(+m[1], fields, files, to);
      const v = productForm(sess, +m[1], flash, url);
      return v ? S(v) : send(res, 404, 'Not found');
    }
    if (sub === '/sections') {
      if (req.method === 'POST') return sectionSave(fields, files, to);
      return S(sectionsPage(sess, flash));
    }
    if (sub === '/zones') {
      if (req.method === 'POST') return zoneSave(fields, to);
      return S(zonesPage(sess, flash));
    }
    if (sub === '/settings') {
      if (req.method === 'POST') return settingsSave(fields, to);
      return S(settingsPage(sess, flash));
    }
  } catch (e) {
    console.error('[admin]', e);
    return S(shell(sess, '', 'خطأ', html`<div class="card"><p>حدث خطأ: ${e.message}</p><a class="btn" href="/admin">رجوع</a></div>`), 500);
  }
  return false;
}

/* ---------- dashboard ---------- */
function dashboard(sess, flash) {
  const today = get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE date(created_at) = date('now') AND status != 'cancelled'`);
  const week = get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE created_at >= datetime('now','-7 days') AND status != 'cancelled'`);
  const month = get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders WHERE created_at >= datetime('now','-30 days') AND status != 'cancelled'`);
  const pending = get(`SELECT COUNT(*) n FROM orders WHERE status = 'new'`).n;
  const inWork = get(`SELECT COUNT(*) n FROM orders WHERE status IN ('design','approved','printing')`).n;
  const newQ = get(`SELECT COUNT(*) n FROM quotes WHERE status = 'new'`).n;
  const recent = all(`SELECT * FROM orders ORDER BY id DESC LIMIT 8`);
  const recentQ = all(`SELECT * FROM quotes ORDER BY id DESC LIMIT 6`);
  const top = all(`SELECT id, name_ar, sold FROM products WHERE sold > 0 ORDER BY sold DESC LIMIT 5`);
  const stat = (label, val, sub, cls = '', href = '') => html`<a class="stat ${cls}" ${href ? raw(`href="${href}"`) : ''}><span>${label}</span><b>${val}</b>${sub ? html`<small>${sub}</small>` : ''}</a>`;
  return shell(sess, 'dash', 'لوحة المعلومات', html`
    <div class="stats">
      ${stat('طلبات جديدة', pending, 'بانتظار التواصل وتأكيد التصميم', pending ? 'warn' : '', '/admin/orders?status=new')}
      ${stat('عروض أسعار جديدة', newQ, 'لافتات، تسويق وطلبات خاصة', newQ ? 'warn' : '', '/admin/quotes?status=new')}
      ${stat('قيد التنفيذ', inWork, 'تصميم / اعتماد / طباعة', '', '/admin/orders')}
      ${stat('طلبات اليوم', today.n, money(today.s))}
      ${stat('آخر 7 أيام', money(week.s), week.n + ' طلب')}
      ${stat('آخر 30 يوماً', money(month.s), month.n + ' طلب')}
    </div>
    <div class="cols">
      <section class="card"><h2>آخر الطلبات</h2>${ordersTable(recent, true)}<p><a href="/admin/orders">كل الطلبات ←</a></p></section>
      <div>
        <section class="card"><h2>آخر طلبات عروض الأسعار</h2>${quotesTable(recentQ, true)}<p><a href="/admin/quotes">كل الطلبات ←</a></p></section>
        <section class="card"><h2>الأكثر طلباً</h2>${top.length ? html`<table>${top.map((p) => html`<tr><td><a href="/admin/products/${p.id}">${p.name_ar}</a></td><td class="end">${p.sold}</td></tr>`)}</table>` : html`<p class="muted">لا توجد طلبات بعد.</p>`}</section>
      </div>
    </div>`, flash);
}

/* ---------- orders ---------- */
function ordersTable(rows, compact = false) {
  if (!rows.length) return html`<p class="muted">لا توجد طلبات.</p>`;
  if (compact) return html`<div class="tw"><table><tbody>${rows.map((o) => html`<tr><td><a href="/admin/orders/${o.id}"><b class="ltr">${o.number}</b></a><br><small>${time(o.created_at)}</small></td><td>${o.name}${o.business ? html`<br><small>${o.business}</small>` : ''}</td><td><b>${money(o.total)}</b></td><td>${stBadge(o.status)}</td></tr>`)}</tbody></table></div>`;
  return html`<div class="tw"><table><thead><tr><th>الطلب</th><th>التاريخ</th><th>العميل</th><th>المنطقة</th><th>المجموع</th><th>الشعار</th><th>الدفع</th><th>الحالة</th></tr></thead><tbody>
    ${rows.map((o) => html`<tr><td><a href="/admin/orders/${o.id}"><b class="ltr">${o.number}</b></a></td><td>${time(o.created_at)}</td><td>${o.name}<br><small class="ltr">${o.phone}</small></td><td>${o.zone_name}</td><td><b>${money(o.total)}</b></td>
    <td>${o.logo ? badge('st-delivered', 'مرفوع') : badge('st-new', 'بانتظار')}</td>
    <td>${METHOD_AR[o.payment_method]}<br>${badge(o.payment_status === 'paid' ? 'st-delivered' : 'st-new', PAY_AR[o.payment_status])}</td><td>${stBadge(o.status)}</td></tr>`)}</tbody></table></div>`;
}
function ordersList(sess, url, flash) {
  const status = ORDER_STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const q = str(url.searchParams.get('q'), 60);
  const page = Math.max(1, int(url.searchParams.get('page'), 1)), per = 30;
  const where = [], p = [];
  if (status) { where.push('status = ?'); p.push(status); }
  if (q) { where.push('(number LIKE ? OR phone LIKE ? OR name LIKE ? OR business LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) n FROM orders ${W}`, ...p).n;
  const rows = all(`SELECT * FROM orders ${W} ORDER BY id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, ...p);
  const pages = Math.max(1, Math.ceil(total / per));
  const link = (o) => '/admin/orders?' + new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...o }).toString();
  return shell(sess, 'orders', 'الطلبات', html`
    <form class="filters" method="get"><input name="q" value="${q}" placeholder="رقم الطلب / الهاتف / الاسم / المحل">
      <select name="status"><option value="">كل الحالات</option>${ORDER_STATUSES.map((s) => html`<option value="${s}" ${s === status ? raw('selected') : ''}>${STATUS_AR[s]}</option>`)}</select>
      <button class="btn">بحث</button></form>
    <section class="card">${ordersTable(rows)}
    ${pages > 1 ? html`<div class="pager">${page > 1 ? html`<a href="${link({ page: page - 1 })}">السابق</a>` : ''}<span>${page} / ${pages}</span>${page < pages ? html`<a href="${link({ page: page + 1 })}">التالي</a>` : ''}</div>` : ''}</section>`, flash);
}
function orderDetail(sess, id, flash) {
  const o = get('SELECT * FROM orders WHERE id = ?', id);
  if (!o) return null;
  const items = orderItems(id);
  const cc = getSettings().phone_cc;
  const wa = `https://wa.me/${toWa(o.phone, cc)}?text=${encodeURIComponent(`مرحباً ${o.name}، معك مطبعة الشهيد بخصوص طلبك ${o.number}`)}`;
  const locked = o.status === 'cancelled';
  return shell(sess, 'orders', `طلب ${o.number}`, html`
    <div class="cols">
      <div>
        <section class="card"><h2>المنتجات</h2><div class="tw"><table><tbody>
          ${items.map((i) => html`<tr><td>${i.name}<br><small>${i.variant_label}${i.discount ? ` · خصم ${i.discount}%` : ''}</small></td><td class="ltr">× ${i.qty}</td><td>${money(i.price)}</td><td class="end">${money(i.price * i.qty)}</td></tr>`)}
          <tr><td colspan="3">مجموع المنتجات</td><td class="end">${money(o.subtotal)}</td></tr>
          <tr><td colspan="3">التوصيل (${o.zone_name})</td><td class="end">${o.shipping ? money(o.shipping) : 'مجاني'}</td></tr>
          <tr class="tot"><td colspan="3">الإجمالي</td><td class="end">${money(o.total)}</td></tr></tbody></table></div></section>
        <section class="card"><h2>الشعار / التصميم</h2>
          ${o.logo && !/\.pdf$/i.test(o.logo) ? html`<p><img src="${o.logo}" alt="" style="max-width:220px;max-height:220px;background:#f4f6fa;border-radius:8px;padding:8px"></p>` : ''}
          <p>${fileLink(o.logo, o.logo_name)}</p>
          ${o.notes ? html`<h3>ملاحظات الطباعة</h3><p style="white-space:pre-wrap">${o.notes}</p>` : ''}</section>
      </div>
      <div>
        <section class="card"><h2>العميل</h2>
          <dl><dt>الاسم</dt><dd>${o.name}</dd>${o.business ? html`<dt>المحل / الشركة</dt><dd>${o.business}</dd>` : ''}<dt>الهاتف</dt><dd class="ltr">${o.phone}</dd>${o.email ? html`<dt>البريد</dt><dd class="ltr">${o.email}</dd>` : ''}
          <dt>المنطقة</dt><dd>${o.zone_name}${o.city ? ' — ' + o.city : ''}</dd><dt>العنوان</dt><dd>${o.address}</dd>
          <dt>التاريخ</dt><dd>${time(o.created_at)}</dd></dl>
          <a class="btn wa" href="${wa}" target="_blank" rel="noopener">مراسلة العميل على واتساب</a></section>
        <section class="card"><h2>إدارة الطلب</h2>
          <form method="post" class="stack">${csrf(sess)}
            <label>حالة الطلب<select name="status" ${locked ? raw('disabled') : ''}>${ORDER_STATUSES.map((s) => html`<option value="${s}" ${s === o.status ? raw('selected') : ''}>${STATUS_AR[s]}</option>`)}</select></label>
            <label>حالة الدفع (${METHOD_AR[o.payment_method]})<select name="payment_status">${PAY_STATUSES.map((s) => html`<option value="${s}" ${s === o.payment_status ? raw('selected') : ''}>${PAY_AR[s]}</option>`)}</select></label>
            <p class="hint">المسار: جديد ← بالتصميم ← تم اعتماد التصميم ← بالطباعة ← خرج للتوصيل ← تم التسليم. العميل بيشوف الحالة من صفحة «تتبع طلبك».</p>
            <button class="btn primary">حفظ</button></form></section>
      </div></div>`, flash);
}
function orderUpdate(id, f, to) {
  const o = get('SELECT * FROM orders WHERE id = ?', id);
  if (!o) return to('/orders');
  const status = ORDER_STATUSES.includes(str(f.status)) ? str(f.status) : o.status;
  const pay = PAY_STATUSES.includes(str(f.payment_status)) ? str(f.payment_status) : o.payment_status;
  if (o.status === 'cancelled' && status !== 'cancelled') return to(`/orders/${id}`, 'locked');
  tx(() => {
    run('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', status, pay, id);
    if (status === 'cancelled' && o.status !== 'cancelled') restock(id);
  });
  return to(`/orders/${id}`, status === 'cancelled' && o.status !== 'cancelled' ? 'cancelled' : 'saved');
}

/* ---------- quotes ---------- */
function quotesTable(rows, compact = false) {
  if (!rows.length) return html`<p class="muted">لا توجد طلبات عروض أسعار.</p>`;
  if (compact) return html`<div class="tw"><table><tbody>${rows.map((q) => html`<tr><td><a href="/admin/quotes/${q.id}"><b class="ltr">${q.number}</b></a><br><small>${q.product_name || q.department_name}</small></td><td>${q.name}</td><td>${qBadge(q.status)}</td></tr>`)}</tbody></table></div>`;
  return html`<div class="tw"><table><thead><tr><th>الرقم</th><th>التاريخ</th><th>القسم / المنتج</th><th>العميل</th><th>المقاس</th><th>ملف</th><th>الحالة</th></tr></thead><tbody>
    ${rows.map((q) => html`<tr><td><a href="/admin/quotes/${q.id}"><b class="ltr">${q.number}</b></a></td><td>${time(q.created_at)}</td><td>${q.department_name}${q.product_name ? html`<br><small>${q.product_name}</small>` : ''}</td>
      <td>${q.name}${q.business ? html`<br><small>${q.business}</small>` : ''}<br><small class="ltr">${q.phone}</small></td><td class="ltr">${q.width && q.height ? `${q.width}×${q.height}` : '—'}</td>
      <td>${q.file ? badge('st-delivered', 'نعم') : '—'}</td><td>${qBadge(q.status)}</td></tr>`)}</tbody></table></div>`;
}
function quotesList(sess, url, flash) {
  const status = QUOTE_STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const q = str(url.searchParams.get('q'), 60);
  const where = [], p = [];
  if (status) { where.push('status = ?'); p.push(status); }
  if (q) { where.push('(number LIKE ? OR phone LIKE ? OR name LIKE ? OR business LIKE ? OR details LIKE ?)'); p.push(...Array(5).fill(`%${q}%`)); }
  const rows = all(`SELECT * FROM quotes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, ...p);
  return shell(sess, 'quotes', 'طلبات عروض الأسعار', html`
    <form class="filters" method="get"><input name="q" value="${q}" placeholder="الرقم / الهاتف / الاسم / التفاصيل">
      <select name="status"><option value="">كل الحالات</option>${QUOTE_STATUSES.map((s) => html`<option value="${s}" ${s === status ? raw('selected') : ''}>${QSTATUS_AR[s]}</option>`)}</select>
      <button class="btn">بحث</button></form>
    <section class="card">${quotesTable(rows)}</section>`, flash);
}
function quoteDetail(sess, id, flash) {
  const q = get('SELECT * FROM quotes WHERE id = ?', id);
  if (!q) return null;
  const wa = `https://wa.me/${toWa(q.phone, getSettings().phone_cc)}?text=${encodeURIComponent(`مرحباً ${q.name}، معك مطبعة الشهيد بخصوص طلب عرض السعر ${q.number}${q.product_name ? ' (' + q.product_name + ')' : ''}`)}`;
  return shell(sess, 'quotes', `عرض سعر ${q.number}`, html`
    <div class="cols">
      <section class="card"><h2>تفاصيل الطلب</h2>
        <dl><dt>القسم</dt><dd>${q.department_name || '—'}</dd>${q.product_name ? html`<dt>المنتج / الخدمة</dt><dd>${q.product_name}</dd>` : ''}
        ${q.width || q.height ? html`<dt>المقاس</dt><dd class="ltr">${q.width} × ${q.height} سم${q.width && q.height ? ` (${Math.round(q.width * q.height / 100) / 100} م²)` : ''}</dd>` : ''}
        ${q.qty ? html`<dt>الكمية</dt><dd>${q.qty}</dd>` : ''}${q.budget ? html`<dt>الميزانية</dt><dd>${q.budget}</dd>` : ''}
        <dt>التاريخ</dt><dd>${time(q.created_at)}</dd></dl>
        <h3>الوصف</h3><p style="white-space:pre-wrap">${q.details || '—'}</p>
        ${q.file && !/\.pdf$/i.test(q.file) ? html`<p><img src="${q.file}" alt="" style="max-width:100%;max-height:320px;border-radius:8px"></p>` : ''}
        <p>${fileLink(q.file, q.file_name)}</p></section>
      <div>
        <section class="card"><h2>العميل</h2>
          <dl><dt>الاسم</dt><dd>${q.name}</dd>${q.business ? html`<dt>المحل / الشركة</dt><dd>${q.business}</dd>` : ''}<dt>الهاتف</dt><dd class="ltr">${q.phone}</dd>${q.city ? html`<dt>المدينة</dt><dd>${q.city}</dd>` : ''}</dl>
          <a class="btn wa" href="${wa}" target="_blank" rel="noopener">مراسلة العميل على واتساب</a></section>
        <section class="card"><h2>المتابعة</h2>
          <form method="post" class="stack">${csrf(sess)}
            <label>الحالة<select name="status">${QUOTE_STATUSES.map((s) => html`<option value="${s}" ${s === q.status ? raw('selected') : ''}>${QSTATUS_AR[s]}</option>`)}</select></label>
            <label>ملاحظات داخلية (السعر المرسل، موعد القياس…)<textarea name="admin_note" rows="4">${q.admin_note}</textarea></label>
            <button class="btn primary">حفظ</button></form></section>
      </div></div>`, flash);
}
function quoteUpdate(id, f, to) {
  const q = get('SELECT id, status FROM quotes WHERE id = ?', id);
  if (!q) return to('/quotes');
  run('UPDATE quotes SET status = ?, admin_note = ? WHERE id = ?', QUOTE_STATUSES.includes(str(f.status)) ? str(f.status) : q.status, str(f.admin_note, 2000), id);
  return to(`/quotes/${id}`, 'saved');
}

/* ---------- products ---------- */
function productsList(sess, url, flash) {
  const q = str(url.searchParams.get('q'), 60);
  const catId = int(url.searchParams.get('cat'));
  const where = [], p = [];
  if (q) { where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.slug LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (catId) { where.push('p.category_id = ?'); p.push(catId); }
  const rows = all(`SELECT p.*, c.name_ar cname, c.image cimage, d.name_ar dname,
    (SELECT MIN(price) FROM variants WHERE product_id = p.id) minp, (SELECT COUNT(*) FROM variants WHERE product_id = p.id) nv
    FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN departments d ON d.id = c.department_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.sort, c.sort, p.id DESC LIMIT 500`, ...p);
  return shell(sess, 'products', 'المنتجات', html`
    <div class="bar-actions"><form class="filters" method="get"><input name="q" value="${q}" placeholder="بحث بالاسم">
      ${catSelect('cat', catId, 'كل الفئات')}<button class="btn">بحث</button></form>
      <a class="btn primary" href="/admin/products/new${catId ? '?cat=' + catId : ''}">+ منتج جديد</a></div>
    <section class="card"><div class="tw"><table><thead><tr><th></th><th>المنتج</th><th>القسم / الفئة</th><th>السعر من</th><th>الحد الأدنى</th><th>الطلب</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${rows.map((r) => html`<tr class="${r.active ? '' : 'off'}"><td class="thumb"><img src="${r.image || r.cimage || '/img/favicon.png'}" alt="" width="44" height="44"></td>
      <td><a href="/admin/products/${r.id}"><b>${r.name_ar}</b></a><br><small>${r.nv} خيار · ${r.unit_ar}</small></td><td>${r.dname || '—'}<br><small>${r.cname || ''}</small></td><td>${r.minp ? money(r.minp) : '—'}</td>
      <td>${r.min_qty}</td><td>${r.quote ? badge('st-preparing', 'عرض سعر') : badge('st-confirmed', 'سلة')}</td><td>${r.active ? badge('st-delivered', 'ظاهر') : badge('st-cancelled', 'مخفي')}</td>
      <td class="end"><form method="post" action="/admin/products/${r.id}/toggle" class="inline">${csrf(sess)}<button class="btn sm">${r.active ? 'إخفاء' : 'إظهار'}</button></form></td></tr>`)}
    </tbody></table></div>${rows.length ? '' : html`<p class="muted">لا توجد منتجات.</p>`}</section>`, flash);
}

function catSelect(name, selected, empty) {
  const depts = all('SELECT * FROM departments ORDER BY sort, id');
  const cats = all('SELECT id, name_ar, department_id FROM categories ORDER BY sort, id');
  return html`<select name="${name}">${empty ? html`<option value="">${empty}</option>` : ''}${depts.map((d) => html`<optgroup label="${d.name_ar}">${cats.filter((c) => c.department_id === d.id).map((c) => html`<option value="${c.id}" ${c.id === selected ? raw('selected') : ''}>${c.name_ar}</option>`)}</optgroup>`)}
    ${cats.filter((c) => !c.department_id).map((c) => html`<option value="${c.id}" ${c.id === selected ? raw('selected') : ''}>${c.name_ar}</option>`)}</select>`;
}

function variantRow(v = {}) {
  return html`<tr class="vrow"><td><input type="hidden" name="v_id" value="${v.id || ''}"><input name="v_label_ar" value="${v.label_ar || ''}" placeholder="مثال: 8 Oz أو A5" required></td>
    <td><input name="v_label_en" value="${v.label_en || ''}" placeholder="e.g. 8 Oz" class="ltr"></td>
    <td><input name="v_price" type="number" step="0.01" min="0" value="${v.price ?? ''}" required class="ltr"></td>
    <td><input name="v_old" type="number" step="0.01" min="0" value="${v.old_price || ''}" class="ltr" placeholder="اختياري"></td>
    <td><input name="v_sku" value="${v.sku || ''}" class="ltr"></td>
    <td><button type="button" class="btn sm danger" data-del-row aria-label="حذف">✕</button></td></tr>`;
}

function productForm(sess, id, flash, url) {
  const p = id ? get('SELECT * FROM products WHERE id = ?', id)
    : { active: 1, quote: 0, min_qty: 1, step: 1, unit_ar: 'للقطعة', unit_en: 'each', category_id: int(url.searchParams.get('cat')) || null };
  if (id && !p) return null;
  const variants = id ? all('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id', id) : [{}];
  const catImg = p.category_id ? get('SELECT image FROM categories WHERE id = ?', p.category_id)?.image : '';
  return shell(sess, 'products', id ? 'تعديل منتج' : 'منتج جديد', html`
  <form method="post" enctype="multipart/form-data" class="pform">${csrf(sess)}
    <div class="cols">
      <div>
        <section class="card"><h2>المعلومات الأساسية</h2><div class="grid2">
          <label>الاسم (عربي)<input name="name_ar" value="${p.name_ar || ''}" required></label>
          <label>الاسم (إنجليزي)<input name="name_en" value="${p.name_en || ''}" class="ltr"></label>
          <label>وصف قصير (عربي)<input name="short_ar" value="${p.short_ar || ''}" maxlength="200"></label>
          <label>وصف قصير (إنجليزي)<input name="short_en" value="${p.short_en || ''}" class="ltr" maxlength="200"></label>
          <label class="full">التفاصيل (عربي) <small>— افصل الفقرات بسطر فارغ</small><textarea name="desc_ar" rows="5">${p.desc_ar || ''}</textarea></label>
          <label class="full">التفاصيل (إنجليزي)<textarea name="desc_en" rows="4" class="ltr">${p.desc_en || ''}</textarea></label></div></section>
        <section class="card"><h2>المقاسات والأسعار</h2>
          <p class="hint">كل سطر خيار (مقاس، لون، نوع) بسعره <b>للوحدة</b> المكتوبة تحت. لمنتجات عرض السعر، السعر هنا بيظهر كـ «يبدأ من» (اكتب 0 لإخفائه).</p>
          <div class="tw"><table class="vt"><thead><tr><th>الخيار (عربي)</th><th>الخيار (EN)</th><th>السعر ₪</th><th>قبل الخصم</th><th>SKU</th><th></th></tr></thead>
          <tbody id="vbody">${variants.map((v) => variantRow(v))}</tbody></table></div>
          <button type="button" class="btn sm" id="add-variant">+ إضافة خيار</button>
          <template id="vtpl">${variantRow({})}</template></section>
        <section class="card"><h2>الكميات وطريقة البيع</h2><div class="grid2">
          <label>الوحدة (عربي)<input name="unit_ar" value="${p.unit_ar || ''}" placeholder="للقطعة / كرتونة 1000 / للمتر المربع"></label>
          <label>الوحدة (إنجليزي)<input name="unit_en" value="${p.unit_en || ''}" class="ltr" placeholder="each / carton of 1000 / per m²"></label>
          <label>الحد الأدنى للطلب<input name="min_qty" type="number" min="1" step="1" value="${p.min_qty}" class="ltr"></label>
          <label>الزيادة بمضاعفات <small>(مثلاً 100)</small><input name="step" type="number" min="1" step="1" value="${p.step}" class="ltr"></label>
          <label class="full">خصم الكميات <small>— كمية:نسبة، مفصولة بفاصلة. مثال: <span class="ltr">1000:5, 3000:10</span></small><input name="tiers" value="${formatTiers(parseTiers(p.tiers))}" class="ltr" placeholder="1000:5, 3000:10"></label>
          <label>مدة التنفيذ (عربي)<input name="days_ar" value="${p.days_ar || ''}" placeholder="2–5 أيام عمل"></label>
          <label>مدة التنفيذ (إنجليزي)<input name="days_en" value="${p.days_en || ''}" class="ltr"></label></div>
          <label class="chk"><input type="checkbox" name="quote" value="1" ${p.quote ? raw('checked') : ''}> <b>طلب عرض سعر</b> بدل الشراء المباشر (للافتات والخدمات والطلبات الخاصة)</label></section>
      </div>
      <div>
        <section class="card"><h2>النشر</h2>
          <label class="chk"><input type="checkbox" name="active" value="1" ${p.active ? raw('checked') : ''}> ظاهر في الموقع</label>
          <label class="chk"><input type="checkbox" name="featured" value="1" ${p.featured ? raw('checked') : ''}> يظهر في «الأكثر طلباً» بالرئيسية</label>
          <label>الشارة<select name="badge"><option value="">بدون</option><option value="new" ${p.badge === 'new' ? raw('selected') : ''}>جديد</option></select></label>
          <label>القسم / الفئة${catSelect('category_id', p.category_id, '—')}</label>
          <label>الرابط (slug) <small>— يُولَّد تلقائياً</small><input name="slug" value="${p.slug || ''}" class="ltr"></label></section>
        <section class="card"><h2>الصورة</h2>
          <div class="preview"><img id="img-prev" src="${p.image || catImg || '/img/favicon.png'}" alt="" width="180" height="180"></div>
          <label>رفع صورة (PNG / JPG / WEBP — حتى 10MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp" id="img-in"></label>
          ${p.image ? html`<label class="chk"><input type="checkbox" name="remove_image" value="1"> حذف الصورة واستخدام صورة الفئة</label>` : html`<p class="hint">بدون صورة، بتظهر صورة الفئة.</p>`}</section>
        <div class="sticky-actions"><button class="btn primary lg">${id ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
          ${id ? html`<a class="btn" href="/ar/product/${p.slug}" target="_blank" rel="noopener">عرض في الموقع ↗</a>` : ''}</div>
      </div></div></form>
  ${id ? html`<form method="post" action="/admin/products/${id}/delete" data-confirm="هل أنت متأكد من حذف هذا المنتج نهائياً؟"><div class="danger-zone">${csrf(sess)}<button class="btn danger">حذف المنتج</button></div></form>` : ''}`, flash);
}

function uniqueSlug(table, base, ignoreId, fallback) {
  const b = slugify(base) || fallback;
  let slug = b, n = 1;
  while (get(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`, slug, ignoreId || 0)) slug = `${b}-${++n}`;
  return slug;
}

function productSave(id, f, files, to) {
  const ids = arr(f.v_id), lar = arr(f.v_label_ar), len = arr(f.v_label_en), price = arr(f.v_price), old = arr(f.v_old), sku = arr(f.v_sku);
  const rows = lar.map((_, i) => ({ id: int(ids[i]), label_ar: str(lar[i], 80), label_en: str(len[i], 80), price: Math.max(0, num(price[i])), old: Math.max(0, num(old[i])), sku: str(sku[i], 40) }))
    .filter((r) => r.label_ar);
  const back = id ? `/products/${id}` : '/products/new';
  if (!rows.length) return to(back, 'novariant');

  let imagePath = null, imgError = '';
  try { imagePath = saveImage(files.image); } catch (e) { imgError = e.message; }

  const d = {
    name_ar: str(f.name_ar, 160), name_en: str(f.name_en, 160) || str(f.name_ar, 160), short_ar: str(f.short_ar, 200), short_en: str(f.short_en, 200),
    desc_ar: str(f.desc_ar, 6000), desc_en: str(f.desc_en, 6000), unit_ar: str(f.unit_ar, 60) || 'للقطعة', unit_en: str(f.unit_en, 60) || 'each',
    min_qty: Math.max(1, int(f.min_qty, 1)), step: Math.max(1, int(f.step, 1)), tiers: formatTiers(parseTiers(str(f.tiers, 300))),
    days_ar: str(f.days_ar, 80), days_en: str(f.days_en, 80), quote: f.quote ? 1 : 0,
    category_id: int(f.category_id) || null, badge: str(f.badge) === 'new' ? 'new' : '', featured: f.featured ? 1 : 0, active: f.active ? 1 : 0,
  };
  if (!d.name_ar) return to(back, 'الاسم العربي مطلوب');
  const cols = Object.keys(d);
  const pid = tx(() => {
    let pid = id;
    const slug = uniqueSlug('products', str(f.slug, 80) || d.name_en || d.name_ar, id, 'product');
    if (id) run(`UPDATE products SET slug=?, ${cols.map((c) => c + '=?').join(', ')} WHERE id=?`, slug, ...cols.map((c) => d[c]), id);
    else pid = Number(run(`INSERT INTO products(slug, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`, slug, ...cols.map((c) => d[c])).lastInsertRowid);
    if (imagePath) run('UPDATE products SET image = ? WHERE id = ?', imagePath, pid);
    else if (f.remove_image) run("UPDATE products SET image = '' WHERE id = ?", pid);
    const keep = new Set();
    rows.forEach((r, i) => {
      const exists = r.id && get('SELECT 1 FROM variants WHERE id = ? AND product_id = ?', r.id, pid);
      if (exists) {
        run('UPDATE variants SET label_ar=?, label_en=?, price=?, old_price=?, sku=?, sort=? WHERE id=?', r.label_ar, r.label_en || r.label_ar, r.price, r.old, r.sku, i, r.id);
        keep.add(r.id);
      } else {
        keep.add(Number(run('INSERT INTO variants(product_id,label_ar,label_en,price,old_price,sku,sort) VALUES (?,?,?,?,?,?,?)', pid, r.label_ar, r.label_en || r.label_ar, r.price, r.old, r.sku || `SH-${String(pid).padStart(3, '0')}-${i + 1}`, i).lastInsertRowid));
      }
    });
    for (const v of all('SELECT id FROM variants WHERE product_id = ?', pid)) if (!keep.has(v.id)) run('DELETE FROM variants WHERE id = ?', v.id);
    return pid;
  });
  return to(`/products/${pid}`, imgError ? 'badimg' : id ? 'saved' : 'created', imgError);
}

/* ---------- sections (departments + categories) ---------- */
function sectionsPage(sess, flash) {
  const depts = all('SELECT d.*, (SELECT COUNT(*) FROM categories WHERE department_id = d.id) nc FROM departments d ORDER BY sort, id');
  const cats = all('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id = c.id) n FROM categories c ORDER BY sort, id');
  const imgField = (img, label) => html`<div class="imgfield"><img src="${img || '/img/favicon.png'}" alt="" width="64" height="64"><label>${label}<input type="file" name="image" accept="image/png,image/jpeg,image/webp"></label></div>`;
  const deptForm = (d = {}) => html`<form method="post" enctype="multipart/form-data" class="catform">${csrf(sess)}<input type="hidden" name="kind" value="dept"><input type="hidden" name="id" value="${d.id || ''}">
    <div class="grid3"><label>اسم القسم (عربي)<input name="name_ar" value="${d.name_ar || ''}" required></label>
    <label>اسم القسم (إنجليزي)<input name="name_en" value="${d.name_en || ''}" class="ltr"></label>
    <label>طريقة الطلب<select name="mode">${DEPT_MODES.map((k) => html`<option value="${k}" ${d.mode === k ? raw('selected') : ''}>${MODE_AR[k]}</option>`)}</select></label>
    <label class="span2">وصف (عربي)<input name="blurb_ar" value="${d.blurb_ar || ''}"></label><label>الترتيب<input name="sort" type="number" value="${d.sort ?? 0}" class="ltr"></label>
    <label class="span2">وصف (إنجليزي)<input name="blurb_en" value="${d.blurb_en || ''}" class="ltr"></label><label>الرابط<input name="slug" value="${d.slug || ''}" class="ltr" placeholder="تلقائي"></label></div>
    ${imgField(d.image, 'صورة القسم (PNG بخلفية شفافة)')}
    <div class="row-actions"><button class="btn primary sm" name="act" value="save">${d.id ? 'حفظ القسم' : 'إضافة قسم'}</button>
      ${d.id ? html`<button class="btn danger sm" name="act" value="delete" data-confirm="حذف القسم؟ ستبقى فئاته بدون قسم.">حذف</button><small>${d.nc} فئة</small>` : ''}</div></form>`;
  const catForm = (c = {}, deptId) => html`<form method="post" enctype="multipart/form-data" class="catform sub">${csrf(sess)}<input type="hidden" name="kind" value="cat"><input type="hidden" name="id" value="${c.id || ''}">
    <div class="grid3"><label>اسم الفئة (عربي)<input name="name_ar" value="${c.name_ar || ''}" required></label>
    <label>اسم الفئة (إنجليزي)<input name="name_en" value="${c.name_en || ''}" class="ltr"></label>
    <label>القسم<select name="department_id">${depts.map((d) => html`<option value="${d.id}" ${(c.department_id ?? deptId) === d.id ? raw('selected') : ''}>${d.name_ar}</option>`)}</select></label>
    <label>وصف (عربي)<input name="blurb_ar" value="${c.blurb_ar || ''}"></label><label>الرابط<input name="slug" value="${c.slug || ''}" class="ltr" placeholder="تلقائي"></label><label>الترتيب<input name="sort" type="number" value="${c.sort ?? 0}" class="ltr"></label></div>
    ${imgField(c.image, 'أيقونة / صورة الفئة (PNG)')}
    <div class="row-actions"><button class="btn primary sm" name="act" value="save">${c.id ? 'حفظ' : 'إضافة فئة'}</button>
      ${c.id ? html`<button class="btn danger sm" name="act" value="delete" data-confirm="حذف الفئة؟ ستبقى منتجاتها بدون فئة.">حذف</button><a class="btn sm" href="/admin/products?cat=${c.id}">${c.n} منتج</a>` : ''}</div></form>`;
  return shell(sess, 'sections', 'الأقسام والفئات', html`
    <p class="hint">الموقع مقسوم لـ ${depts.length} أقسام رئيسية، وكل قسم فيه فئات. صورة الفئة بتظهر بدائرة بالموقع وبتنستخدم لمنتجات الفئة اللي ما إلها صورة. الأفضل PNG مربّع بخلفية شفافة (512×512).</p>
    ${depts.map((d) => html`<section class="card dept-card"><h2>${d.name_ar} <small class="ltr">/${d.slug}</small></h2>${deptForm(d)}
      <h3>الفئات</h3>${cats.filter((c) => c.department_id === d.id).map((c) => catForm(c))}
      <details><summary class="btn sm">+ فئة جديدة في ${d.name_ar}</summary>${catForm({}, d.id)}</details></section>`)}
    ${cats.some((c) => !c.department_id) ? html`<section class="card"><h2>فئات بدون قسم</h2>${cats.filter((c) => !c.department_id).map((c) => catForm(c))}</section>` : ''}
    <section class="card"><h2>قسم رئيسي جديد</h2>${deptForm()}</section>`, flash);
}
function sectionSave(f, files, to) {
  const id = int(f.id), isDept = str(f.kind) === 'dept', table = isDept ? 'departments' : 'categories';
  if (str(f.act) === 'delete' && id) { run(`DELETE FROM ${table} WHERE id = ?`, id); return to('/sections', 'deleted'); }
  const name_ar = str(f.name_ar, 80), name_en = str(f.name_en, 80) || name_ar;
  if (!name_ar) return to('/sections', 'الاسم مطلوب');
  let image = null, imgError = '';
  try { image = saveImage(files.image); } catch (e) { imgError = e.message; }
  const slug = uniqueSlug(table, str(f.slug, 60) || name_en, id, isDept ? 'section' : 'category');
  if (isDept) {
    const mode = DEPT_MODES.includes(str(f.mode)) ? str(f.mode) : 'cart';
    const v = [slug, name_ar, name_en, str(f.blurb_ar, 200), str(f.blurb_en, 200), mode, int(f.sort)];
    if (id) run('UPDATE departments SET slug=?, name_ar=?, name_en=?, blurb_ar=?, blurb_en=?, mode=?, sort=? WHERE id=?', ...v, id);
    else run('INSERT INTO departments(slug,name_ar,name_en,blurb_ar,blurb_en,mode,sort) VALUES (?,?,?,?,?,?,?)', ...v);
  } else {
    const v = [slug, name_ar, name_en, str(f.blurb_ar, 200), int(f.department_id) || null, int(f.sort)];
    if (id) run('UPDATE categories SET slug=?, name_ar=?, name_en=?, blurb_ar=?, department_id=?, sort=? WHERE id=?', ...v, id);
    else run('INSERT INTO categories(slug,name_ar,name_en,blurb_ar,department_id,sort) VALUES (?,?,?,?,?,?)', ...v);
  }
  if (image) run(`UPDATE ${table} SET image = ? WHERE slug = ?`, image, slug);
  return to('/sections', imgError ? 'badimg' : id ? 'saved' : 'created', imgError);
}

/* ---------- zones ---------- */
function zonesPage(sess, flash) {
  const zs = all('SELECT * FROM zones ORDER BY sort, id');
  const form = (z = {}) => html`<form method="post" class="catform">${csrf(sess)}<input type="hidden" name="id" value="${z.id || ''}">
    <div class="grid3"><label>المنطقة (عربي)<input name="name_ar" value="${z.name_ar || ''}" required></label><label>المنطقة (إنجليزي)<input name="name_en" value="${z.name_en || ''}" class="ltr"></label>
    <label>رسوم التوصيل ₪<input name="fee" type="number" step="0.5" min="0" value="${z.fee ?? ''}" class="ltr" required></label>
    <label>مدة التوصيل (عربي)<input name="eta_ar" value="${z.eta_ar || ''}"></label><label>مدة التوصيل (إنجليزي)<input name="eta_en" value="${z.eta_en || ''}" class="ltr"></label>
    <label>الترتيب<input name="sort" type="number" value="${z.sort ?? 0}" class="ltr"></label></div>
    <div class="row-actions"><button class="btn primary sm" name="act" value="save">${z.id ? 'حفظ' : 'إضافة'}</button>${z.id ? html`<button class="btn danger sm" name="act" value="delete" data-confirm="حذف المنطقة؟">حذف</button>` : ''}</div></form>`;
  return shell(sess, 'zones', 'مناطق التوصيل', html`<section class="card"><h2>منطقة جديدة</h2>${form()}</section>${zs.map((z) => html`<section class="card"><h3>${z.name_ar}</h3>${form(z)}</section>`)}`, flash);
}
function zoneSave(f, to) {
  const id = int(f.id);
  if (str(f.act) === 'delete' && id) { run('DELETE FROM zones WHERE id = ?', id); return to('/zones', 'deleted'); }
  const name_ar = str(f.name_ar, 80);
  if (!name_ar) return to('/zones', 'الاسم مطلوب');
  const vals = [name_ar, str(f.name_en, 80) || name_ar, Math.max(0, num(f.fee)), str(f.eta_ar, 120), str(f.eta_en, 120), int(f.sort)];
  if (id) run('UPDATE zones SET name_ar=?, name_en=?, fee=?, eta_ar=?, eta_en=?, sort=? WHERE id=?', ...vals, id);
  else run('INSERT INTO zones(name_ar,name_en,fee,eta_ar,eta_en,sort) VALUES (?,?,?,?,?,?)', ...vals);
  return to('/zones', id ? 'saved' : 'created');
}

/* ---------- settings ---------- */
const SETTING_GROUPS = [
  ['هوية الموقع', [['store_name_ar', 'الاسم (عربي)'], ['store_name_en', 'الاسم (إنجليزي)'], ['tagline_ar', 'الوصف المختصر (عربي)'], ['tagline_en', 'الوصف المختصر (إنجليزي)'], ['announce_ar', 'الشريط العلوي (عربي) — اتركه فارغاً لإخفائه'], ['announce_en', 'الشريط العلوي (إنجليزي)']]],
  ['التواصل', [['whatsapp', 'رقم واتساب (بصيغة دولية بدون + مثل 972597323130)', 'ltr'], ['phone_cc', 'رمز الدولة لأرقام الزبائن (970 أو 972)', 'ltr'], ['phone', 'رقم الهاتف المعروض', 'ltr'], ['email', 'البريد الإلكتروني', 'ltr'], ['address_ar', 'العنوان (عربي)'], ['address_en', 'العنوان (إنجليزي)'], ['hours_ar', 'ساعات العمل (عربي)'], ['hours_en', 'ساعات العمل (إنجليزي)'], ['instagram', 'رابط إنستغرام', 'ltr'], ['facebook', 'رابط فيسبوك', 'ltr'], ['tiktok', 'رابط تيك توك', 'ltr']]],
  ['التوصيل', [['free_shipping_min', 'توصيل مجاني للطلبات فوق ₪ (0 = بدون)', 'ltr']]],
];
function settingsPage(sess, flash) {
  const S = getSettings();
  return shell(sess, 'settings', 'الإعدادات', html`<form method="post" class="pform">${csrf(sess)}
    ${SETTING_GROUPS.map(([title, list]) => html`<section class="card"><h2>${title}</h2><div class="grid2">${list.map(([k, label, cls]) => html`<label>${label}<input name="${k}" value="${S[k] ?? ''}" class="${cls || ''}"></label>`)}</div></section>`)}
    <section class="card"><h2>طرق الدفع</h2>
      <label class="chk"><input type="checkbox" name="cod_enabled" value="1" ${S.cod_enabled === '1' ? raw('checked') : ''}> الدفع عند الاستلام</label>
      <label class="chk"><input type="checkbox" name="card_enabled" value="1" ${S.card_enabled === '1' ? raw('checked') : ''}> تحويل أو بطاقة <small>(بتبعت للعميل تفاصيل الدفع على واتساب بعد اعتماد التصميم)</small></label></section>
    <div class="sticky-actions"><button class="btn primary lg">حفظ الإعدادات</button></div></form>`, flash);
}
function settingsSave(f, to) {
  for (const group of SETTING_GROUPS) for (const [k] of group[1]) setSetting(k, str(f[k], 300));
  setSetting('cod_enabled', f.cod_enabled ? '1' : '0');
  setSetting('card_enabled', f.card_enabled ? '1' : '0');
  if (!f.cod_enabled && !f.card_enabled) setSetting('cod_enabled', '1');
  return to('/settings', 'saved');
}
