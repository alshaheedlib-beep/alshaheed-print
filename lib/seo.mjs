/*
  SEO / Google: what search engines see, editable from /admin/seo.
  - Page titles: "<page> | مطبعة الشهيد – الخليل", home title and description written for "مطبعة في الخليل".
  - Structured data (JSON-LD): LocalBusiness with alternate names, address, hours, map link; WebSite with search.
  - Google Search Console verification tag, canonical site address, sitemap.xml, robots.txt.
*/
import { html, raw } from './util.mjs';

export const SEO_DEFAULTS = {
  site_url: 'https://alshaheed.ps',
  seo_home_title_ar: 'مطبعة الشهيد | مطبعة في الخليل — كاسات وأكياس بشعارك وقارمات',
  seo_home_title_en: 'Al-Shaheed Press | Printing press in Hebron — branded cups, bags, signs',
  seo_home_desc_ar: 'مطبعة الشهيد في الخليل – دائرة السير: كاسات وأكياس وعلب بشعارك، قارمات ولافتات، شوادر وستيكر وكروت أعراس، مع خدمة تصميم وتوصيل لكل المناطق.',
  seo_home_desc_en: 'Al-Shaheed Press in Hebron: branded cups, bags and boxes, shop signs, banners, foam boards, stickers, wedding cards and print packages, plus a design service. Order online with delivery everywhere.',
  seo_suffix_ar: 'مطبعة الشهيد – الخليل',
  seo_suffix_en: 'Al-Shaheed Press, Hebron',
  seo_alt_names: 'مطبعة الشهيد, مطبعة الشهيد الخليل, مطبعة في الخليل, Al-Shaheed Press, Alshaheed Print',
  seo_hours: 'Sa-Th 08:00-19:00',
  seo_geo: '',
  google_maps_url: '',
  google_verify: '',
};

/** Canonical site address (never the temporary :8081 / IP address). */
export const siteUrl = (S, fallback) => String(process.env.SITE_URL || S.site_url || fallback || '').replace(/\/$/, '');

export function pageTitle(ctx, title) {
  const S = ctx.S, ar = ctx.lang === 'ar';
  if (!title) return (ar ? S.seo_home_title_ar : S.seo_home_title_en) || `${ctx.name}`;
  const suffix = ar ? S.seo_suffix_ar : S.seo_suffix_en;
  return suffix ? `${title} | ${suffix}` : `${title} | ${ctx.name}`;
}
export const homeDescription = (ctx) => (ctx.lang === 'ar' ? ctx.S.seo_home_desc_ar : ctx.S.seo_home_desc_en);

export const verifyTag = (S) => (S.google_verify ? html`<meta name="google-site-verification" content="${String(S.google_verify).replace(/.*content="([^"]+)".*/s, '$1').trim()}">` : '');

function intlPhone(S) {
  const d = String(S.phone || '').replace(/\D/g, '');
  return d.startsWith('0') ? `+${S.phone_cc || '970'}${d.slice(1)}` : d ? `+${d}` : '';
}

/** JSON-LD for the home page. */
export function homeJsonLd(ctx) {
  const S = ctx.S, site = ctx.site, ar = ctx.lang === 'ar';
  const [lat, lng] = String(S.seo_geo || '').split(',').map((x) => parseFloat(x));
  const sameAs = [S.google_maps_url, S.facebook, S.instagram, S.tiktok].filter((x) => /^https?:\/\//.test(x || ''));
  const hours = String(S.seo_hours || '').trim();
  return [
    {
      '@context': 'https://schema.org', '@type': ['LocalBusiness', 'Store'], '@id': site + '/#business',
      name: S.store_name_ar, alternateName: String(S.seo_alt_names || '').split(',').map((x) => x.trim()).filter(Boolean),
      description: S.seo_home_desc_ar, url: site + '/ar', logo: site + '/img/logo.png', image: site + '/img/logo.png',
      telephone: intlPhone(S), email: S.email || undefined, priceRange: '₪₪',
      address: { '@type': 'PostalAddress', streetAddress: ar ? S.address_ar : S.address_en, addressLocality: ar ? 'الخليل' : 'Hebron', addressRegion: ar ? 'الخليل' : 'Hebron', addressCountry: 'PS' },
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
      ...(hours ? { openingHours: hours } : {}),
      areaServed: ar ? ['الخليل', 'الضفة الغربية', 'فلسطين'] : ['Hebron', 'West Bank', 'Palestine'],
      ...(sameAs.length ? { sameAs } : {}),
      ...(S.map_query ? { hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(S.map_query)}` } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', '@id': site + '/#website', url: site + '/', name: S.store_name_ar,
      alternateName: [S.store_name_en, 'alshaheed.ps'].filter(Boolean), inLanguage: ['ar', 'en'],
      potentialAction: { '@type': 'SearchAction', target: `${site}/ar/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    },
  ];
}

/** BreadcrumbList JSON-LD from [[label, href?], …] (hrefs are site-relative). */
export function breadcrumbLd(ctx, trail) {
  const items = [[ctx.t('nav.home'), ctx.L('')], ...trail];
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name: String(name), ...(href ? { item: ctx.site + href } : {}) })),
  };
}

/* ---------- admin page ---------- */
const FIELDS = [
  ['عنوان الصفحة الرئيسية بجوجل', [
    ['seo_home_title_ar', 'العنوان (عربي) — أهم سطر: حط فيه اسم المحل + «مطبعة في الخليل». الأفضل أقل من 65 حرف', 'count'],
    ['seo_home_desc_ar', 'الوصف (عربي) — بيطلع تحت العنوان بجوجل. الأفضل 120–160 حرف', 'count area'],
    ['seo_home_title_en', 'العنوان (إنجليزي)', 'ltr'], ['seo_home_desc_en', 'الوصف (إنجليزي)', 'ltr area'],
  ]],
  ['باقي الصفحات', [
    ['seo_suffix_ar', 'بيتضاف بآخر عنوان كل صفحة (مثلاً: كاسات | مطبعة الشهيد – الخليل)'], ['seo_suffix_en', 'نفس الشي بالإنجليزي', 'ltr'],
  ]],
  ['معلومات المحل لجوجل', [
    ['seo_alt_names', 'أسماء ثانية للمحل يبحث فيها الناس (افصل بفاصلة)'],
    ['google_maps_url', 'رابط صفحتك على خرائط جوجل (من زر «مشاركة» بصفحة المحل)', 'ltr'],
    ['seo_geo', 'إحداثيات المحل (اختياري) مثل 31.5326,35.0998', 'ltr'],
    ['seo_hours', 'ساعات العمل بصيغة جوجل مثل Sa-Th 08:00-19:00', 'ltr'],
  ]],
  ['ربط الموقع مع جوجل', [
    ['google_verify', 'كود التحقق من Google Search Console (طريقة «HTML tag» — الصق السطر كامل أو الكود بس)', 'ltr'],
    ['site_url', 'العنوان الرسمي للموقع', 'ltr'],
  ]],
];
export const SEO_KEYS = FIELDS.flatMap(([, list]) => list.map(([k]) => k));

export function seoAdmin({ S, csrf, site }) {
  const title = S.seo_home_title_ar || '', desc = S.seo_home_desc_ar || '';
  const check = (ok, text, tip) => html`<li class="${ok ? 'ok' : 'todo'}"><b>${ok ? '✓' : '○'}</b> ${text}${!ok && tip ? html`<small>${tip}</small>` : ''}</li>`;
  return html`
  <section class="card"><h2>هيك بيطلع موقعك بنتائج جوجل</h2>
    <div class="serp"><div class="serp-url">${site.replace(/^https?:\/\//, '')} › ar</div><div class="serp-title" id="pv-title">${title}</div><div class="serp-desc" id="pv-desc">${desc}</div></div>
    <p class="hint">المعاينة بتتغيّر وإنت بتكتب تحت. جوجل أحياناً بيغيّر الوصف من عنده حسب البحث.</p></section>

  <section class="card"><h2>قائمة المهام لتطلع أول بجوجل</h2><ul class="seo-check">
    ${check(site.startsWith('https://'), 'الموقع على https')}
    ${check(true, 'خريطة الموقع (sitemap.xml) وملف robots.txt شغّالين', '')}
    ${check(true, 'عناوين ووصف لكل صفحة ومنتج + بيانات منظّمة (Schema) للمحل والمنتجات', '')}
    ${check(/الخليل/.test(title), 'كلمة «الخليل» بعنوان الصفحة الرئيسية', 'ضيف «مطبعة في الخليل» للعنوان')}
    ${check(!!S.google_verify, 'الموقع مربوط بـ Google Search Console', 'افتح search.google.com/search-console ← أضف الموقع ← اختار «HTML tag» ← انسخ الكود هون تحت')}
    ${check(!!S.google_maps_url, 'رابط صفحتك على خرائط جوجل محطوط هون', 'افتح صفحة المحل على خرائط جوجل ← مشاركة ← انسخ الرابط')}
    <li class="todo"><b>○</b> رابط الموقع محطوط على صفحتك بجوجل (الملف التجاري) <small>من صفحة المحل بجوجل ← تعديل الملف ← الموقع الإلكتروني: ${site}</small></li>
    <li class="todo"><b>○</b> تقييمات الزباين على جوجل <small>اطلب من زباينك الراضيين يكتبوا تقييم — أكثر شي بيرفعك بالخرائط وببحث «مطبعة الخليل»</small></li>
  </ul></section>

  <form method="post" class="pform">${csrf}
    ${FIELDS.map(([h, list]) => html`<section class="card"><h2>${h}</h2><div class="grid2">${list.map(([k, label, cls = '']) => html`<label class="${cls.includes('area') ? 'full' : ''}">${label}
      ${cls.includes('area') ? html`<textarea name="${k}" rows="3" class="${cls.includes('ltr') ? 'ltr' : ''}" ${cls.includes('count') ? raw('data-count') : ''} ${k === 'seo_home_desc_ar' ? raw('data-pv="pv-desc"') : ''}>${S[k] ?? ''}</textarea>`
        : html`<input name="${k}" value="${S[k] ?? ''}" class="${cls.includes('ltr') ? 'ltr' : ''}" ${cls.includes('count') ? raw('data-count') : ''} ${k === 'seo_home_title_ar' ? raw('data-pv="pv-title"') : ''}>`}
      ${cls.includes('count') ? html`<small class="cnt"></small>` : ''}</label>`)}</div></section>`)}
    <div class="sticky-actions"><button class="btn primary lg">حفظ</button><a class="btn" href="/sitemap.xml" target="_blank">sitemap.xml ↗</a></div>
  </form>
  <section class="card"><h2>كيف بنشتغل على السيو؟</h2>
    <ol class="seo-how">
      <li><b>الموقع نفسه (جاهز):</b> كل صفحة إلها عنوان ووصف، كل منتج إله صفحة وصورة وسعر، وفي «بيانات منظّمة» بتحكي لجوجل إنك محل طباعة بالخليل، شو اسمك، عنوانك، رقمك وساعات دوامك.</li>
      <li><b>صفحتك على خرائط جوجل:</b> هي اللي بتطلع لما حدا يكتب «مطبعة الخليل». خليها كاملة: التصنيف «مطبعة»، الصور، الساعات، رابط الموقع، والأهم التقييمات.</li>
      <li><b>Search Console:</b> بنعطي جوجل خريطة الموقع وبنشوف كل أسبوع شو الكلمات اللي الناس بيلاقوك فيها.</li>
      <li><b>الوقت والروابط:</b> كل ما الموقع أقدم، وفي روابط إله من فيسبوك وإنستغرام وصفحات ثانية، كل ما طلع أعلى. أول نتائج بتبين بعد أسابيع، مش أيام.</li>
    </ol>
    <p class="hint">ملاحظة: «الكلمات المفتاحية» (meta keywords) جوجل ما بيستخدمها من سنين، لهيك ما حطيناها — الكلمات لازم تكون بالعناوين والنصوص الحقيقية.</p></section>`;
}
