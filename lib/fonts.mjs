/*
  Site fonts, chosen from the admin panel (/admin/fonts).
  Each role (headings, main sections, product names, prices…) gets a font: an Arabic Google font from the list
  below, a font the owner uploaded (woff2 / woff / ttf / otf), or "same as body text".
*/
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { html, raw, UPLOAD_DIR } from './util.mjs';

/** Arabic-capable Google fonts: [family, weights, style note]. */
export const GOOGLE_FONTS = [
  ['Readex Pro', '300;400;500;600;700', 'عصري واضح'],
  ['Reem Kufi', '400;500;600;700', 'كوفي أنيق'],
  ['Cairo', '300;400;500;600;700', 'عصري مشهور'],
  ['Tajawal', '300;400;500;700', 'بسيط ونظيف'],
  ['Almarai', '300;400;700', 'عصري ناعم'],
  ['IBM Plex Sans Arabic', '300;400;500;600;700', 'رسمي ومرتب'],
  ['Noto Kufi Arabic', '400;500;600;700', 'كوفي واضح'],
  ['Noto Sans Arabic', '400;500;600;700', 'واضح للقراءة'],
  ['Noto Naskh Arabic', '400;500;600;700', 'نسخ تقليدي'],
  ['Alexandria', '300;400;500;600;700', 'هندسي عريض'],
  ['Rubik', '300;400;500;600;700', 'دائري لطيف'],
  ['Changa', '300;400;500;600;700', 'مربّع قوي'],
  ['El Messiri', '400;500;600;700', 'فخم للعناوين'],
  ['Markazi Text', '400;500;600;700', 'كتابي أنيق'],
  ['Amiri', '400;700', 'نسخ كلاسيكي'],
  ['Baloo Bhaijaan 2', '400;500;600;700', 'مرح ودائري'],
  ['Lemonada', '300;400;500;600;700', 'مرح وعريض'],
  ['Mada', '300;400;500;600;700', 'خفيف وبسيط'],
  ['Harmattan', '400;500;600;700', 'هادي ومقروء'],
  ['Kufam', '400;500;600;700', 'كوفي عريض'],
  ['Marhey', '300;400;500;600;700', 'يدوي مرح'],
  ['Zain', '300;400;700', 'عصري نحيف'],
  ['Lalezar', '400', 'عريض جداً للعناوين'],
  ['Rakkas', '400', 'دعائي ثقيل'],
  ['Aref Ruqaa', '400;700', 'رقعة'],
  ['Blaka', '400', 'زخرفي'],
];
const GMAP = new Map(GOOGLE_FONTS.map((f) => [f[0], f]));

/** Font roles: [setting key, label, default, CSS selectors it applies to]. */
export const ROLES = [
  ['font_body', 'النصوص العامة', 'Readex Pro', 'body'],
  ['font_display', 'العناوين', 'Reem Kufi', 'h1, h2, h3, .brand b, .foot h4, .steps b, .drawer-body summary'],
  ['font_depts', 'القائمة والأقسام الرئيسية', '', '.nav a, .dept h3, .dept-hero h1'],
  ['font_cats', 'أسماء الفئات', '', '.cat .nm'],
  ['font_products', 'أسماء المنتجات', '', '.card-title, .pdp-info h1'],
  ['font_prices', 'الأسعار', '', '.price, .sum-row b, .sum-row .num, .order-no'],
  ['font_buttons', 'الأزرار', '', '.btn'],
];
export const FONT_DEFAULTS = Object.fromEntries(ROLES.map(([k, , d]) => [k, d]));

/* ---------- uploaded fonts (kept in settings as JSON) ---------- */
export function customFonts(S) {
  try { const v = JSON.parse(S.custom_fonts || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
const FONT_MAGIC = [['wOF2', 'woff2', 'font/woff2'], ['wOFF', 'woff', 'font/woff'], ['OTTO', 'otf', 'font/otf'], ['\0\x01\0\0', 'ttf', 'font/ttf'], ['true', 'ttf', 'font/ttf']];
/** Validate and store an uploaded font file. Returns { id, file, format }. */
export function saveFont(file) {
  if (!file || !file.data?.length) throw new Error('اختار ملف الخط');
  if (file.data.length > 8 * 1024 * 1024) throw new Error('الملف أكبر من 8MB');
  const head = file.data.subarray(0, 4).toString('latin1');
  const m = FONT_MAGIC.find(([sig]) => head === sig);
  if (!m) throw new Error('الملف مش خط (استخدم woff2 أو woff أو ttf أو otf)');
  const dir = path.join(UPLOAD_DIR, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(path.join(dir, `${id}.${m[1]}`), file.data);
  return { id, file: `/uploads/fonts/${id}.${m[1]}`, format: { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' }[m[1]] };
}

/** CSS font-family stack for a setting value, or '' when the role follows the body font. */
function stack(value, S) {
  if (!value) return '';
  if (value.startsWith('custom:')) {
    const f = customFonts(S).find((x) => x.id === value.slice(7));
    return f ? `'ShFont-${f.id}', 'Readex Pro', Tahoma, sans-serif` : '';
  }
  return GMAP.has(value) ? `'${value}', Tahoma, sans-serif` : '';
}
const valueOf = (S, key) => (S[key] == null ? FONT_DEFAULTS[key] : S[key]);

/** <link>/<style> for the public site head. */
export function fontHead(S) {
  const used = new Set(ROLES.map(([k]) => valueOf(S, k)).filter((v) => GMAP.has(v)));
  // one stylesheet per family: a font that rejects a weight can't break the others
  const fams = [...used].map((n) => `https://fonts.googleapis.com/css2?family=${n.replace(/ /g, '+')}:wght@${GMAP.get(n)[1]}&display=swap`);
  const customs = customFonts(S).filter((f) => ROLES.some(([k]) => valueOf(S, k) === 'custom:' + f.id));
  let css = customs.map((f) => `@font-face{font-family:'ShFont-${f.id}';src:url('${f.file}') format('${f.format}');font-display:swap}`).join('');
  const body = stack(valueOf(S, 'font_body'), S), display = stack(valueOf(S, 'font_display'), S);
  css += `:root{${body ? `--body:${body};` : ''}${display ? `--display:${display};` : ''}}`;
  for (const [k, , , sel] of ROLES.slice(2)) {
    const st = stack(valueOf(S, k), S);
    if (st) css += `${sel}{font-family:${st}}`;
  }
  return html`${fams.length ? html`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fams.map((u) => html`<link rel="stylesheet" href="${u}">`)}` : ''}
<style>${raw(css.replace(/</g, ''))}</style>`;
}

/* ---------- admin page ---------- */
const previewFamily = (v) => (v.startsWith('custom:') ? `'ShFont-${v.slice(7)}'` : `'${v}'`);

export function fontsAdmin({ S, csrf }) {
  const customs = customFonts(S);
  const allG = GOOGLE_FONTS.map((f) => `https://fonts.googleapis.com/css2?family=${f[0].replace(/ /g, '+')}&display=swap`);
  const sample = 'مطبعة الشهيد — كاسات وأكياس بشعارك ١٢٣ ₪';
  const option = (k, v, label) => html`<option value="${v}" ${valueOf(S, k) === v ? raw('selected') : ''}>${label}</option>`;
  return html`
  ${allG.map((u) => html`<link rel="stylesheet" href="${u}">`)}
  <style>${raw(customs.map((f) => `@font-face{font-family:'ShFont-${f.id}';src:url('${f.file}') format('${f.format}')}`).join(''))}</style>
  <p class="hint">اختار خط لكل جزء من الموقع. المعاينة بتتغير فوراً، وبعد «حفظ» بيتطبّق على الموقع. بتقدر كمان ترفع خطوطك الخاصة تحت.</p>
  <form method="post" class="pform">${csrf}<input type="hidden" name="act" value="save">
    <section class="card"><div class="font-roles">
    ${ROLES.map(([k, label, def], i) => html`<div class="font-role">
      <label>${label}<select name="${k}" data-font-preview="pv-${k}">
        ${i > 0 ? option(k, '', 'افتراضي') : ''}
        ${customs.length ? html`<optgroup label="خطوطك المرفوعة">${customs.map((f) => option(k, 'custom:' + f.id, f.name))}</optgroup>` : ''}
        <optgroup label="خطوط جوجل العربية">${GOOGLE_FONTS.map(([n, , note]) => option(k, n, `${n} — ${note}${n === def ? ' (الافتراضي)' : ''}`))}</optgroup>
      </select></label>
      <div class="font-pv" id="pv-${k}" style="font-family:${previewFamily(valueOf(S, k) || def || 'Readex Pro')}">${sample}</div></div>`)}
    </div></section>
    <div class="sticky-actions"><button class="btn primary lg">حفظ الخطوط</button>
      <button class="btn" name="act" value="reset" data-confirm="ترجيع كل الخطوط للافتراضي؟">رجّع الافتراضي</button></div>
  </form>
  <section class="card" style="margin-top:18px"><h2>خطوطك المرفوعة</h2>
    ${customs.length ? html`<table><tbody>${customs.map((f) => html`<tr><td><b>${f.name}</b></td><td style="font-family:'ShFont-${f.id}';font-size:1.2rem">${sample}</td>
      <td class="end"><form method="post" class="inline">${csrf}<input type="hidden" name="act" value="delete"><input type="hidden" name="id" value="${f.id}"><button class="btn sm danger" data-confirm="حذف الخط؟ الأجزاء اللي بتستخدمه بترجع للافتراضي.">حذف</button></form></td></tr>`)}</tbody></table>`
      : html`<p class="muted">لسا ما رفعت خطوط.</p>`}
    <form method="post" enctype="multipart/form-data" class="grid3" style="margin-top:14px;align-items:end">${csrf}<input type="hidden" name="act" value="upload">
      <label>اسم الخط<input name="name" required placeholder="مثلاً: خط الشهيد"></label>
      <label>الملف (woff2 / woff / ttf / otf)<input type="file" name="font" required accept=".woff2,.woff,.ttf,.otf"></label>
      <div><button class="btn primary">رفع الخط</button></div></form>
    <p class="hint">تأكد إنه الخط بيدعم العربي وإنه مسموح تستخدمه على موقع.</p></section>`;
}

/** Handle POST /admin/fonts. Returns [flashCode, extra]. */
export function fontsSave(f, files, S, setSetting) {
  const act = String(f.act || 'save');
  const customs = customFonts(S);
  const valid = (v) => v === '' || GMAP.has(v) || (v.startsWith('custom:') && customs.some((c) => 'custom:' + c.id === v));
  if (act === 'reset') { for (const [k, , d] of ROLES) setSetting(k, d); return ['saved']; }
  if (act === 'upload') {
    const name = String(f.name || '').trim().slice(0, 60);
    if (!name) return ['!اكتب اسم للخط'];
    let saved;
    try { saved = saveFont(files.font); } catch (e) { return ['!' + e.message]; }
    setSetting('custom_fonts', JSON.stringify([...customs, { ...saved, name }]));
    return ['تم رفع الخط — اختاره من القوائم فوق'];
  }
  if (act === 'delete') {
    const id = String(f.id || ''), gone = customs.find((c) => c.id === id);
    if (!gone) return ['saved'];
    setSetting('custom_fonts', JSON.stringify(customs.filter((c) => c.id !== id)));
    for (const [k, , d] of ROLES) if (valueOf(S, k) === 'custom:' + id) setSetting(k, d);
    try { fs.unlinkSync(path.join(UPLOAD_DIR, gone.file.replace('/uploads/', ''))); } catch {}
    return ['deleted'];
  }
  for (const [k, , d] of ROLES) {
    let v = String(f[k] ?? '');
    if (k === 'font_body' && !v) v = d;
    if (valid(v)) setSetting(k, v);
  }
  return ['saved'];
}

