/*
  Design service — "ما عندي تصميم، صمّملي".
  The customer pays a fixed fee per product category at checkout; a freelance designer claims the job (or the
  admin assigns it), they talk through the site only, the designer uploads proofs, the customer approves or asks
  for changes. Approval moves the order to printing ("تم اعتماد التصميم") and books the designer's share.

  Contact details are never shown to designers, and phone numbers / emails / links are masked in messages
  between the customer and the designer, so customers stay with the shop.
*/
import crypto from 'node:crypto';
import { html, raw, money, int, sign, unsign, safeEqual, parseCookies, cookieHeader, parseBody, saveArtwork, sendHtml, redirect, send, rateLimit, clientIp, isHttps, SEC_HEADERS, SECRET } from './util.mjs';
import { all, get, run, tx, getSettings } from './db.mjs';
import { layout, icon, breadcrumbs } from './render.mjs';
import { notifyDesign } from './notify.mjs';

export const DESIGN_STATUSES = ['waiting', 'working', 'proof', 'changes', 'approved'];
export const DSTATUS_AR = { waiting: 'بانتظار مصمم', working: 'المصمم بيشتغل', proof: 'نموذج بانتظار العميل', changes: 'العميل طلب تعديل', approved: 'تم الاعتماد' };
const DSTATUS_EN = { waiting: 'Waiting for a designer', working: 'Designer at work', proof: 'Proof ready for review', changes: 'Changes requested', approved: 'Approved' };
export const DSTATUS_CLS = { waiting: 'st-new', working: 'st-confirmed', proof: 'st-preparing', changes: 'st-new', approved: 'st-delivered' };

/* ---------- money ---------- */
/** Design fee for a hydrated cart: one fixed fee per distinct category (a cup layout and a bag layout are two designs). */
export function designQuote(items) {
  const seen = new Map();
  for (const it of items) if (it.design_fee > 0 && !seen.has(it.cid)) seen.set(it.cid, { name_ar: it.cname_ar, name_en: it.cname_en, fee: it.design_fee });
  const parts = [...seen.values()];
  return { parts, fee: parts.reduce((s, p) => s + p.fee, 0) };
}
export const designEnabled = (S) => S.design_enabled === '1';
export const newToken = () => crypto.randomBytes(16).toString('base64url');

/* ---------- passwords (scrypt) ---------- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), salt, 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^(00)?(972|970)/, '0').replace(/^(?!0)/, '0');

/* ---------- keep contact details off the thread ---------- */
export function maskContacts(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '•••')
    .replace(/(https?:\/\/|www\.)\S+/gi, '•••')
    .replace(/\b(wa\.me|t\.me|instagram\.com|facebook\.com|fb\.com)\S*/gi, '•••')
    .replace(/\+?[\d٠-٩][\d٠-٩\s\-.()]{5,}[\d٠-٩]/g, (m) => {
      const d = m.replace(/[^\d٠-٩]/g, '');
      return d.length >= 9 || (d.length >= 7 && /^[0٠+]/.test(m)) ? '•••' : m; // phone numbers, not prices or dates
    });
}

/* ---------- state changes ---------- */
export const thread = (orderId) => all('SELECT m.*, d.name AS dname FROM design_messages m LEFT JOIN designers d ON d.id = m.designer_id WHERE order_id = ? ORDER BY m.id', orderId);
export const latestProof = (orderId) => get('SELECT * FROM design_messages WHERE order_id = ? AND proof = 1 ORDER BY id DESC LIMIT 1', orderId);

/** Add a message and update unread counters / design status. sender: customer | designer | admin | system. */
export function addMessage(order, sender, { body = '', file = null, proof = false, designerId = null } = {}) {
  const text = sender === 'customer' || sender === 'designer' ? maskContacts(body) : body;
  tx(() => {
    run('INSERT INTO design_messages(order_id, sender, designer_id, body, file, file_name, proof) VALUES (?,?,?,?,?,?,?)',
      order.id, sender, designerId, text.slice(0, 3000), file?.path || '', file?.name || '', proof ? 1 : 0);
    if (sender === 'customer') run('UPDATE orders SET unread_designer = unread_designer + 1, unread_admin = unread_admin + 1 WHERE id = ?', order.id);
    if (sender === 'designer') run('UPDATE orders SET unread_customer = unread_customer + 1, unread_admin = unread_admin + 1 WHERE id = ?', order.id);
    if (sender === 'admin') run('UPDATE orders SET unread_customer = unread_customer + 1, unread_designer = unread_designer + 1 WHERE id = ?', order.id);
    if (proof && order.design_status !== 'approved') run("UPDATE orders SET design_status = 'proof' WHERE id = ?", order.id);
  });
  if (proof) notifyDesign('design.proof', order);
  else if (sender === 'customer') notifyDesign('design.customer_message', order, { text });
}

export function assignDesigner(order, designerId, by = 'admin') {
  const d = designerId ? get('SELECT * FROM designers WHERE id = ? AND active = 1', designerId) : null;
  tx(() => {
    run(`UPDATE orders SET designer_id = ?, design_status = CASE WHEN design_status IN ('', 'waiting') THEN ? ELSE design_status END WHERE id = ?`,
      d?.id || null, d ? 'working' : 'waiting', order.id);
    run("INSERT INTO design_messages(order_id, sender, body) VALUES (?, 'system', ?)", order.id,
      d ? `المصمم ${firstName(d.name)} استلم التصميم${by === 'claim' ? '' : ''}.` : 'التصميم رجع بانتظار مصمم.');
    run('UPDATE orders SET unread_customer = unread_customer + 1 WHERE id = ?', order.id);
  });
  if (d) notifyDesign('design.assigned', order, { designer: d.name });
}

export function approve(order) {
  const proof = latestProof(order.id);
  if (!proof || order.design_status === 'approved') return false;
  const d = order.designer_id ? get('SELECT share_pct FROM designers WHERE id = ?', order.designer_id) : null;
  const pct = d ? d.share_pct : Number(getSettings().design_share_pct) || 0;
  tx(() => {
    run(`UPDATE orders SET design_status = 'approved', status = CASE WHEN status IN ('new', 'design') THEN 'approved' ELSE status END, designer_share = ? WHERE id = ?`,
      Math.round(order.design_fee * pct) / 100, order.id);
    run("INSERT INTO design_messages(order_id, sender, body) VALUES (?, 'system', 'العميل اعتمد التصميم ✓ — الطلب انتقل للطباعة.')", order.id);
    run('UPDATE orders SET unread_designer = unread_designer + 1, unread_admin = unread_admin + 1 WHERE id = ?', order.id);
  });
  notifyDesign('design.approved', order);
  return true;
}

export function requestChanges(order, body, file) {
  run("UPDATE orders SET design_status = 'changes', design_rounds = design_rounds + 1 WHERE id = ?", order.id);
  addMessage({ ...order, design_status: 'changes' }, 'customer', { body: body ? '✎ طلب تعديل: ' + body : '✎ طلب تعديل', file });
}

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const tt = (ctx, ar, en) => (ctx.lang === 'en' ? en : ar);
const isImg = (p) => /\.(png|jpe?g|webp|gif)$/i.test(p || '');
const fileBit = (m, label = 'ملف') => (m.file ? (isImg(m.file)
  ? html`<a href="${m.file}" target="_blank" rel="noopener" class="msg-img"><img src="${m.file}" alt="" loading="lazy"></a>`
  : html`<a class="msg-file" href="${m.file}" target="_blank" rel="noopener">📎 ${m.file_name || label}</a>`) : '');

/* =====================================================================
   Customer page: /ar/design/:number?k=token
   ===================================================================== */
export function customerOrder(number, token) {
  const o = get('SELECT * FROM orders WHERE number = ?', number);
  if (!o || !o.design || !o.token || !token || !safeEqual(o.token, token)) return null;
  return o;
}
export const designLink = (o, lang = 'ar') => `/${lang}/design/${encodeURIComponent(o.number)}?k=${o.token}`;

export function customerPage(ctx, o, { flash = '', error = '' } = {}) {
  if (o.unread_customer) run('UPDATE orders SET unread_customer = 0 WHERE id = ?', o.id);
  const S = ctx.S;
  const msgs = thread(o.id);
  const proof = [...msgs].reverse().find((m) => m.proof);
  const designer = o.designer_id ? get('SELECT name FROM designers WHERE id = ?', o.designer_id) : null;
  const free = int(S.design_free_rounds, 2), left = Math.max(0, free - o.design_rounds);
  const steps = ['waiting', 'working', 'proof', 'approved'];
  const idx = steps.indexOf(o.design_status === 'changes' ? 'working' : o.design_status);
  const k = o.token;
  const body = html`${breadcrumbs(ctx, [[tt(ctx, 'تصميم طلبك', 'Your design')]])}
  <div class="wrap narrow design-page">
    <div class="page-head"><h1>${tt(ctx, 'تصميم طلبك', 'Your design')} <span class="num muted">${o.number}</span></h1>
      <p>${designer ? tt(ctx, `المصمم: ${firstName(designer.name)}`, `Designer: ${firstName(designer.name)}`) : tt(ctx, 'رح يستلم طلبك مصمم خلال ساعات.', 'A designer will pick up your order within hours.')}</p></div>
    ${flash ? html`<div class="alert ok" role="status">${flash}</div>` : ''}${error ? html`<div class="alert err" role="alert">${error}</div>` : ''}
    <ol class="timeline">${steps.map((s, i) => html`<li class="${i <= idx ? 'done' : ''}">${tt(ctx, DSTATUS_AR[s], DSTATUS_EN[s])}</li>`)}</ol>
    <p class="muted small">${tt(ctx, 'احفظ رابط هالصفحة — منها بتتابع التصميم وبتحكي مع المصمم.', 'Bookmark this page — it is where you follow your design and talk to the designer.')}</p>

    ${proof ? html`<section class="panel proof-box"><h2>${o.design_status === 'approved' ? tt(ctx, 'التصميم المعتمد', 'Approved design') : tt(ctx, 'آخر نموذج من المصمم', 'Latest proof')}</h2>
      ${fileBit(proof, tt(ctx, 'النموذج', 'Proof'))}${proof.body ? html`<p>${proof.body}</p>` : ''}
      ${o.design_status === 'proof' ? html`
        <form method="post" class="row"><input type="hidden" name="k" value="${k}"><input type="hidden" name="act" value="approve">
          <button class="btn btn-accent" data-confirm="${tt(ctx, 'متأكد؟ بعد الاعتماد بنبلش الطباعة.', 'Sure? Printing starts after approval.')}">${icon('check')} ${tt(ctx, 'موافق، اعتمد التصميم', 'Approve this design')}</button></form>
        <details class="changes"><summary class="btn btn-outline">${tt(ctx, 'بدي تعديل', 'Request changes')}</summary>
          <form method="post" enctype="multipart/form-data" class="stack-sm"><input type="hidden" name="k" value="${k}"><input type="hidden" name="act" value="changes">
            <textarea class="input" name="body" rows="3" required placeholder="${tt(ctx, 'شو بدك نغيّر؟', 'What should change?')}"></textarea>
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf">
            <p class="muted small">${left > 0 ? tt(ctx, `ضايلك ${left} تعديل مجاني.`, `${left} free revision(s) left.`) : tt(ctx, 'خلصت التعديلات المجانية — التعديلات الإضافية ممكن تكون برسوم، رح نبلغك قبل.', 'Free revisions used — extra revisions may cost extra; we will tell you first.')}</p>
            <button class="btn btn-navy">${tt(ctx, 'ابعت طلب التعديل', 'Send')}</button></form></details>` : ''}
    </section>` : ''}

    <section class="panel"><h2>${tt(ctx, 'المحادثة', 'Conversation')}</h2>
      <div class="msgs">
        <div class="msg me"><b>${tt(ctx, 'طلبك', 'Your brief')}</b><p>${o.brief}</p>${o.logo ? fileBit({ file: o.logo, file_name: o.logo_name }) : ''}</div>
        ${msgs.map((m) => m.sender === 'system' ? html`<div class="msg sys">${m.body}</div>` : html`<div class="msg ${m.sender === 'customer' ? 'me' : ''} ${m.proof ? 'is-proof' : ''}">
          <b>${m.sender === 'customer' ? tt(ctx, 'إنت', 'You') : m.sender === 'admin' ? ctx.name : tt(ctx, 'المصمم', 'Designer') + (m.dname ? ' ' + firstName(m.dname) : '')}${m.proof ? ' · ' + tt(ctx, 'نموذج', 'Proof') : ''}</b>
          ${m.body ? html`<p>${m.body}</p>` : ''}${fileBit(m)}<time class="num">${m.created_at}</time></div>`)}
      </div>
      ${o.status === 'cancelled' ? '' : html`<form method="post" enctype="multipart/form-data" class="msg-form" id="end"><input type="hidden" name="k" value="${k}"><input type="hidden" name="act" value="msg">
        <textarea class="input" name="body" rows="2" placeholder="${tt(ctx, 'اكتب رسالة للمصمم…', 'Write to the designer…')}"></textarea>
        <div class="row"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf"><button class="btn btn-navy">${tt(ctx, 'إرسال', 'Send')}</button></div></form>`}
    </section>
    <div class="row center"><a class="btn btn-wa" href="${ctx.wa(tt(ctx, 'مرحباً، بخصوص تصميم طلبي ', 'Hello, about the design of order ') + o.number)}" target="_blank" rel="noopener">${tt(ctx, 'تواصل مع المطبعة', 'Contact the shop')}</a></div>
  </div>`;
  return layout(ctx, { title: tt(ctx, 'تصميم طلبك', 'Your design'), body, noindex: true });
}

export const okMessage = (ctx, code) => ({
  approve: tt(ctx, 'تم اعتماد التصميم ✓ — بلّشنا التحضير للطباعة.', 'Design approved ✓ — we are getting it ready for print.'),
  changes: tt(ctx, 'وصل طلب التعديل للمصمم.', 'Your change request was sent to the designer.'),
  msg: tt(ctx, 'تم الإرسال.', 'Sent.'),
})[code] || '';

/** POST /ar/design/:number — returns { error } or {}. */
export function customerPost(req, o, fields, files) {
  if (!rateLimit('dz:' + clientIp(req), 30, 10 * 60 * 1000)) return { error: 'محاولات كثيرة، جرّب بعد شوي' };
  if (o.status === 'cancelled') return { error: 'الطلب ملغي' };
  const act = String(fields.act || ''), body = String(fields.body || '').trim().slice(0, 3000);
  let file = null;
  try { file = saveArtwork(files.file); } catch (e) { return { error: 'الملف: ' + e.message }; }
  if (act === 'approve') return approve(o) ? { flash: 'تم اعتماد التصميم ✓ — بلّشنا التحضير للطباعة.' } : { error: 'ما في نموذج للاعتماد' };
  if (act === 'changes') {
    if (o.design_status !== 'proof') return { error: 'ما في نموذج حالياً' };
    requestChanges(o, body, file);
    return { flash: 'وصل طلب التعديل للمصمم.' };
  }
  if (!body && !file) return { error: 'اكتب رسالة أو أرفق ملف' };
  addMessage(o, 'customer', { body, file });
  return { flash: 'تم الإرسال.' };
}

/* =====================================================================
   Designer portal: /designer
   ===================================================================== */
const COOKIE = 'sh_des';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
function designerSession(req) {
  const v = unsign(parseCookies(req)[COOKIE]);
  if (!v) return null;
  const [id, exp, nonce] = v.split('.');
  if (!id || Number(exp) < Date.now()) return null;
  const d = get('SELECT * FROM designers WHERE id = ? AND active = 1', int(id));
  if (!d) return null;
  return { d, csrf: crypto.createHmac('sha256', SECRET).update('dcsrf:' + nonce + ':' + id).digest('base64url') };
}

function dshell(sess, title, body, flash) {
  return html`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · بوابة المصممين</title><link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="stylesheet" href="/css/admin.css?v=4"></head><body>
<aside class="side"><a class="brand" href="/designer"><img src="/img/logo-light.png" alt="" width="34" height="42"> مطبعة الشهيد <small>بوابة المصممين</small></a>
${sess ? html`<nav><a href="/designer" class="on">شغلي</a><span class="who">أهلاً ${sess.d.name}</span>
<form method="post" action="/designer/logout"><input type="hidden" name="_csrf" value="${sess.csrf}"><button class="linkish">تسجيل الخروج</button></form></nav>` : ''}</aside>
<main class="main"><header class="top"><h1>${title}</h1></header>
${flash ? html`<div class="flash ${flash.type}" role="status">${flash.text}</div>` : ''}${body}</main><script src="/js/admin.js?v=4" defer></script></body></html>`;
}
function dlogin(error = '') {
  return html`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>دخول المصممين · مطبعة الشهيد</title>
<link rel="stylesheet" href="/css/admin.css?v=4"></head><body class="login"><form class="login-box" method="post" action="/designer/login">
<img src="/img/logo.png" alt="" width="80" height="99"><h1>مطبعة الشهيد</h1><p>بوابة المصممين</p>${error ? html`<div class="flash err">${error}</div>` : ''}
<label>رقم الجوال<input name="phone" type="tel" inputmode="tel" class="ltr" required autocomplete="username"></label>
<label>كلمة المرور<input type="password" name="password" required autocomplete="current-password"></label>
<button class="btn primary" type="submit">دخول</button><p class="hint" style="margin-top:14px">بدك تشتغل معنا كمصمم؟ تواصل مع المطبعة.</p></form></body></html>`;
}

export async function handleDesigner(req, res, url, sub) {
  const S = (body, status = 200, headers = {}) => sendHtml(res, body.toString(), status, { ...SEC_HEADERS, 'Cache-Control': 'no-store', ...headers });
  const to = (loc, m) => redirect(res, `/designer${loc}${m ? (loc.includes('?') ? '&' : '?') + 'm=' + encodeURIComponent(m) : ''}`);

  if (sub === '/login') {
    if (req.method === 'GET') return S(dlogin());
    const { fields } = await parseBody(req, 8 * 1024);
    if (!rateLimit('des:' + clientIp(req), 8, 10 * 60 * 1000)) return S(dlogin('محاولات كثيرة، حاول بعد قليل'), 429);
    const d = get('SELECT * FROM designers WHERE phone = ? AND active = 1', normPhone(fields.phone));
    if (!d || !checkPassword(String(fields.password || '').slice(0, 200), d.pass_hash)) return S(dlogin('الرقم أو كلمة المرور غير صحيحة'), 401);
    const v = sign(`${d.id}.${Date.now() + SESSION_MS}.${crypto.randomBytes(9).toString('hex')}`);
    return redirect(res, '/designer', 303, { 'Set-Cookie': cookieHeader(COOKIE, v, { maxAge: SESSION_MS / 1000, sameSite: 'Strict', secure: isHttps(req), path: '/designer' }) });
  }
  const sess = designerSession(req);
  if (!sess) return redirect(res, '/designer/login');
  let fields = {}, files = {};
  if (req.method === 'POST') {
    ({ fields, files } = await parseBody(req, 12 * 1024 * 1024));
    if (!safeEqual(String(fields._csrf || ''), sess.csrf)) return send(res, 403, 'Invalid CSRF token');
  }
  if (sub === '/logout' && req.method === 'POST') return redirect(res, '/designer/login', 303, { 'Set-Cookie': cookieHeader(COOKIE, '', { maxAge: 0, path: '/designer', sameSite: 'Strict' }) });
  const m = url.searchParams.get('m');
  const flash = m ? { type: m.startsWith('!') ? 'err' : 'ok', text: m.replace(/^!/, '') } : null;

  if (sub === '/' || sub === '') return S(dhome(sess, flash));
  const mm = /^\/orders\/(\d+)$/.exec(sub);
  if (mm) {
    const o = get('SELECT * FROM orders WHERE id = ? AND design = 1', +mm[1]);
    const mine = o && o.designer_id === sess.d.id, open = o && !o.designer_id && o.status !== 'cancelled';
    if (!o || (!mine && !open)) return to('', '!الطلب مش إلك أو انسحب منك');
    if (req.method === 'POST') {
      const act = String(fields.act || '');
      if (act === 'claim') {
        if (!open) return to('', '!سبقك مصمم ثاني على هالطلب');
        assignDesigner(o, sess.d.id, 'claim');
        return to(`/orders/${o.id}`, 'استلمت الطلب — بالتوفيق!');
      }
      if (!mine) return to('');
      if (act === 'release' && o.design_status !== 'approved') { assignDesigner(o, null); return to('', 'رجّعت الطلب للقائمة'); }
      if (act === 'msg') {
        let file = null;
        try { file = saveArtwork(files.file); } catch (e) { return to(`/orders/${o.id}`, '!الملف: ' + e.message); }
        const body = String(fields.body || '').trim().slice(0, 3000), proof = fields.proof === '1' && !!file && o.design_status !== 'approved';
        if (!body && !file) return to(`/orders/${o.id}`, '!اكتب رسالة أو أرفق ملف');
        if (fields.proof === '1' && !file) return to(`/orders/${o.id}`, '!النموذج لازم يكون ملف (صورة أو PDF)');
        addMessage(o, 'designer', { body, file, proof, designerId: sess.d.id });
        return to(`/orders/${o.id}`, proof ? 'انبعت النموذج للعميل' : 'تم الإرسال');
      }
      return to(`/orders/${o.id}`);
    }
    return S(dorder(sess, o, mine, flash));
  }
  return false;
}

function jobRow(o, extra = '') {
  return html`<tr><td><a href="/designer/orders/${o.id}"><b class="ltr">${o.number}</b></a><br><small>${o.created_at}</small></td>
    <td>${maskContacts(o.business) || firstName(o.name)}<br><small>${o.items}</small></td><td>${html`<span class="b ${DSTATUS_CLS[o.design_status] || 'st-new'}">${DSTATUS_AR[o.design_status] || ''}</span>`}${o.unread_designer ? html` <i class="dot">${o.unread_designer}</i>` : ''}</td>${extra}</tr>`;
}
const JOB_SQL = `SELECT o.*, (SELECT GROUP_CONCAT(name, '، ') FROM order_items WHERE order_id = o.id) AS items FROM orders o`;

function dhome(sess, flash) {
  const id = sess.d.id;
  const mine = all(`${JOB_SQL} WHERE o.design = 1 AND o.designer_id = ? AND o.design_status != 'approved' AND o.status != 'cancelled' ORDER BY o.unread_designer DESC, o.id DESC`, id);
  const open = all(`${JOB_SQL} WHERE o.design = 1 AND o.designer_id IS NULL AND o.status != 'cancelled' ORDER BY o.id LIMIT 50`);
  const done = all(`${JOB_SQL} WHERE o.design = 1 AND o.designer_id = ? AND o.design_status = 'approved' ORDER BY o.id DESC LIMIT 50`, id);
  const owed = get(`SELECT COALESCE(SUM(designer_share),0) s, COUNT(*) n FROM orders WHERE designer_id = ? AND design_status = 'approved' AND designer_paid = 0`, id);
  const paid = get(`SELECT COALESCE(SUM(designer_share),0) s FROM orders WHERE designer_id = ? AND designer_paid = 1`, id).s;
  const share = (o) => Math.round(o.design_fee * sess.d.share_pct) / 100;
  return dshell(sess, 'شغلي', html`
    <div class="stats"><div class="stat ${mine.length ? 'warn' : ''}"><span>شغل حالي</span><b>${mine.length}</b></div>
      <div class="stat"><span>طلبات متاحة</span><b>${open.length}</b><small>استلم أي طلب منها</small></div>
      <div class="stat"><span>مستحق إلك</span><b>${money(owed.s)}</b><small>${owed.n} تصميم معتمد</small></div>
      <div class="stat"><span>استلمت لحد هلأ</span><b>${money(paid)}</b></div></div>
    <section class="card"><h2>شغلي الحالي</h2>${mine.length ? html`<div class="tw"><table><tbody>${mine.map((o) => jobRow(o, html`<td class="end">${money(share(o))}</td>`))}</tbody></table></div>` : html`<p class="muted">ما عندك شغل حالياً — شوف الطلبات المتاحة.</p>`}</section>
    <section class="card"><h2>طلبات متاحة</h2><p class="hint">أول مصمم بيستلم الطلب بيصير إله. نصيبك ${sess.d.share_pct}% من رسوم التصميم، وبينحسب لما العميل يعتمد التصميم.</p>
      ${open.length ? html`<div class="tw"><table><tbody>${open.map((o) => jobRow(o, html`<td class="end"><b>${money(share(o))}</b></td><td class="end"><a class="btn sm primary" href="/designer/orders/${o.id}">تفاصيل</a></td>`))}</tbody></table></div>` : html`<p class="muted">ما في طلبات متاحة هلأ.</p>`}</section>
    <section class="card"><h2>تصاميم معتمدة</h2>${done.length ? html`<div class="tw"><table><tbody>${done.map((o) => jobRow(o, html`<td class="end">${money(o.designer_share)}<br><small>${o.designer_paid ? 'مدفوع' : 'مستحق'}</small></td>`))}</tbody></table></div>` : html`<p class="muted">لسا ما في.</p>`}</section>`, flash);
}

function dorder(sess, o, mine, flash) {
  if (mine && o.unread_designer) run('UPDATE orders SET unread_designer = 0 WHERE id = ?', o.id);
  const items = all('SELECT name, variant_label, qty FROM order_items WHERE order_id = ?', o.id);
  const msgs = mine ? thread(o.id) : [];
  const csrfIn = html`<input type="hidden" name="_csrf" value="${sess.csrf}">`;
  const free = int(getSettings().design_free_rounds, 2);
  return dshell(sess, `تصميم ${o.number}`, html`
    <div class="cols"><div>
      <section class="card"><h2>طلب العميل</h2>
        <p style="white-space:pre-wrap">${maskContacts(o.brief) || '—'}</p>
        ${o.logo ? html`<h3>ملف مرفق من العميل</h3>${fileBit({ file: o.logo, file_name: o.logo_name })}` : ''}
        ${o.notes ? html`<h3>ملاحظات</h3><p style="white-space:pre-wrap">${maskContacts(o.notes)}</p>` : ''}</section>
      ${mine ? html`<section class="card"><h2>المحادثة</h2><div class="msgs">
        ${msgs.map((m) => m.sender === 'system' ? html`<div class="msg sys">${m.body}</div>` : html`<div class="msg ${m.sender === 'designer' ? 'me' : ''} ${m.proof ? 'is-proof' : ''}">
          <b>${m.sender === 'designer' ? 'إنت' : m.sender === 'admin' ? 'المطبعة' : 'العميل'}${m.proof ? ' · نموذج' : ''}</b>${m.body ? html`<p>${m.body}</p>` : ''}${fileBit(m)}<time>${m.created_at}</time></div>`)}</div>
        ${o.status === 'cancelled' ? html`<p class="flash err">الطلب ملغي.</p>` : html`<form method="post" enctype="multipart/form-data" class="msg-form">${csrfIn}<input type="hidden" name="act" value="msg">
          <label>رسالة<textarea name="body" rows="3"></textarea></label>
          <label>ملف (صورة أو PDF)<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
          ${o.design_status !== 'approved' ? html`<label class="chk"><input type="checkbox" name="proof" value="1"> هذا نموذج للاعتماد (العميل بيقدر يوافق عليه أو يطلب تعديل)</label>` : ''}
          <button class="btn primary">إرسال</button></form>`}
        <p class="hint">أرقام الهواتف والإيميلات والروابط بتنخفى تلقائياً من المحادثة — كل التواصل مع العميل من هون.</p></section>` : ''}
    </div><div>
      <section class="card"><h2>تفاصيل</h2><dl>
        <dt>العميل</dt><dd>${maskContacts(o.business) || firstName(o.name)}</dd>
        <dt>الحالة</dt><dd><span class="b ${DSTATUS_CLS[o.design_status]}">${DSTATUS_AR[o.design_status] || ''}</span></dd>
        <dt>رسوم التصميم</dt><dd>${money(o.design_fee)}</dd><dt>نصيبك</dt><dd><b>${money(Math.round(o.design_fee * sess.d.share_pct) / 100)}</b></dd>
        <dt>التعديلات</dt><dd>${o.design_rounds} من ${free} مجاناً</dd></dl>
        <h3>المنتجات</h3><ul>${items.map((i) => html`<li>${i.name}${i.variant_label ? ' — ' + i.variant_label : ''} <small>× ${i.qty}</small></li>`)}</ul>
        ${mine ? (o.design_status !== 'approved' ? html`<form method="post">${csrfIn}<input type="hidden" name="act" value="release"><button class="btn sm danger" data-confirm="ترجّع الطلب لقائمة الطلبات المتاحة؟">ما بقدر أكمّل — رجّع الطلب</button></form>` : '')
          : html`<form method="post">${csrfIn}<input type="hidden" name="act" value="claim"><button class="btn primary lg">استلم هالطلب</button></form>`}
      </section></div></div>`, flash);
}
