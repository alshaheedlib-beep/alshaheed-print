import { get, run, tx, db } from './db.mjs';
import { slugify } from './util.mjs';

/* Starting catalogue. Prices are placeholders to be replaced from the admin panel with the shop's real price list. */
const DEPTS = [
  { slug: 'signage', mode: 'quote', image: '/img/depts/signage.png', ar: ['اللافتات والواجهات', 'واجهات محلات، لوحات مضيئة، حروف بارزة وستيكر زجاج — قياس وتصميم وتركيب'], en: ['Signs & shopfronts', 'Shopfronts, lightboxes, 3D letters and window graphics — measured, designed and installed'] },
  { slug: 'print', mode: 'cart', image: '/img/depts/print.png', ar: ['المطبعة', 'كاسات، أكياس، علب، ليبلات، ملابس موحدة وكروت أعراس مطبوعة بشعارك'], en: ['Printing', 'Cups, bags, boxes, labels, uniforms and wedding cards printed with your logo'] },
  { slug: 'marketing', mode: 'quote', image: '/img/depts/marketing.png', ar: ['التسويق والإعلان', 'إدارة صفحات السوشال ميديا، حملات ممولة، هوية بصرية وتصوير'], en: ['Marketing & ads', 'Social media management, paid campaigns, brand identity and photography'] },
  { slug: 'wholesale', mode: 'wholesale', image: '/img/depts/wholesale.png', ar: ['الجملة والمواد الخام', 'ورق، رولات فينيل وفليكس، أحبار وتغليف سادة بالكرتونة'], en: ['Wholesale & supplies', 'Paper, vinyl and flex rolls, inks and blank packaging by the carton'] },
];

// [dept, slug, ar, en, image]
const CATS = [
  ['signage', 'shopfronts', 'واجهات محلات', 'Shopfronts', '/img/depts/signage.png'],
  ['signage', 'lightboxes', 'لوحات مضيئة وحروف بارزة', 'Lightboxes & 3D letters', '/img/depts/signage.png'],
  ['signage', 'banners', 'بانرات ورول أب', 'Banners & roll-ups', '/img/mockups/stands.png'],
  ['print', 'cups', 'كاسات', 'Cups', '/img/mockups/cups.png'],
  ['print', 'bags', 'أكياس', 'Bags', '/img/mockups/bags.png'],
  ['print', 'food-boxes', 'علب وتغليف أطعمة', 'Food boxes & wrapping', '/img/mockups/boxes.png'],
  ['print', 'wedding-cards', 'كروت أعراس', 'Wedding cards', '/img/mockups/wedding.png'],
  ['print', 'labels', 'ليبلات وستكرات', 'Labels & stickers', '/img/mockups/labels.png'],
  ['print', 'paper-prints', 'مطبوعات ورقية', 'Paper prints', '/img/mockups/paper.png'],
  ['print', 'uniforms', 'آلبسة موحدة', 'Uniforms', '/img/mockups/uniforms.png'],
  ['print', 'promo', 'هدايا دعائية', 'Promotional gifts', '/img/mockups/promo.png'],
  ['print', 'stands', 'ستاندات عرض', 'Display stands', '/img/mockups/stands.png'],
  ['marketing', 'social-media', 'إدارة السوشال ميديا', 'Social media management', '/img/depts/marketing.png'],
  ['marketing', 'ads', 'حملات إعلانية', 'Ad campaigns', '/img/depts/marketing.png'],
  ['marketing', 'branding', 'هوية بصرية وتصوير', 'Branding & photography', '/img/depts/marketing.png'],
  ['wholesale', 'paper-stock', 'ورق وكرتون', 'Paper & board', '/img/depts/wholesale.png'],
  ['wholesale', 'rolls', 'رولات فينيل وفليكس', 'Vinyl & flex rolls', '/img/depts/wholesale.png'],
  ['wholesale', 'inks', 'أحبار', 'Inks', '/img/depts/wholesale.png'],
  ['wholesale', 'blank-packaging', 'تغليف سادة', 'Blank packaging', '/img/depts/wholesale.png'],
];

const T = (s) => s; // tiers text, "qty:pct, ..."
// [cat, ar, en, unit_ar, unit_en, min, step, tiers, days_ar, quote, featured, variants[[ar,en,price]], short_ar]
const P = [
  // signage
  ['shopfronts', 'واجهة محل ألمنيوم مركّب (كلادينج)', 'Aluminium composite shopfront', 'للمتر المربع', 'per m²', 1, 1, '', 'حسب حجم الواجهة', 1, 1, [['للمتر المربع', 'per m²', 180]], 'قياس، تصميم، تصنيع وتركيب واجهة كاملة بلون وهوية محلك.'],
  ['shopfronts', 'يافطة فليكس مطبوعة مع إطار', 'Printed flex sign with frame', 'للمتر المربع', 'per m²', 1, 1, '', '3–5 أيام عمل', 1, 0, [['للمتر المربع', 'per m²', 45]], 'يافطة اقتصادية للمحلات والمعارض، طباعة عالية الدقة مقاومة للشمس.'],
  ['shopfronts', 'ستيكر زجاج وواجهات (فينيل)', 'Window vinyl graphics', 'للمتر المربع', 'per m²', 1, 1, '', '2–3 أيام عمل', 1, 0, [['للمتر المربع', 'per m²', 40]], 'ستيكر مقصوص أو مطبوع لواجهات الزجاج والأبواب، مع التركيب.'],
  ['lightboxes', 'لوحة مضيئة لايت بوكس', 'Lightbox sign', 'للمتر المربع', 'per m²', 1, 1, '', '7–10 أيام عمل', 1, 1, [['للمتر المربع', 'per m²', 350]], 'لوحة مضيئة بإضاءة LED موفرة، وجه أو وجهين.'],
  ['lightboxes', 'حروف بارزة مضيئة 3D', 'Illuminated 3D letters', 'للحرف', 'per letter', 1, 1, '', '7–14 يوم عمل', 1, 0, [['ارتفاع 30 سم', '30 cm high', 120], ['ارتفاع 50 سم', '50 cm high', 180]], 'حروف ستانلس أو أكريليك بإضاءة أمامية أو خلفية.'],
  ['banners', 'رول أب ستاند مع الطباعة', 'Roll-up stand with print', 'للقطعة', 'each', 1, 1, '3:5, 10:10', '2–3 أيام عمل', 0, 1, [['85×200 سم', '85×200 cm', 120], ['100×200 سم', '100×200 cm', 150]], 'ستاند ألمنيوم مع شنطة وطباعة عالية الجودة.'],
  ['banners', 'بانر فليكس مع عيون', 'Flex banner with eyelets', 'للمتر المربع', 'per m²', 1, 1, '10:5, 30:10', '1–2 يوم عمل', 0, 0, [['فليكس عادي', 'Standard flex', 25], ['فليكس مقوّى', 'Heavy flex', 35]], 'للمناسبات والعروض والمحلات، مع حلقات تعليق.'],
  // print
  ['cups', 'كاسات كرتون طباعة ملونة', 'Printed paper cups', 'كرتونة 1000 كاسة', 'carton of 1000', 1, 1, '3:5, 5:8', '10–14 يوم', 0, 1, [['4 Oz', '4 Oz', 95], ['8 Oz', '8 Oz', 110], ['12 Oz', '12 Oz', 130]], 'لا تشمل الأغطية.'],
  ['cups', 'كاسات كرتون دبل', 'Double-wall paper cups', 'كرتونة 1000 كاسة', 'carton of 1000', 1, 1, '3:5, 5:8', 'أسبوعين', 0, 1, [['8 Oz', '8 Oz', 340], ['9 Oz', '9 Oz', 370], ['12 Oz', '12 Oz', 450]], 'طبقتين، بتحافظ على حرارة المشروب.'],
  ['cups', 'كاسات بلاستيك U مطبوعة', 'Printed U plastic cups', 'كرتونة 1000 كاسة', 'carton of 1000', 1, 1, '', 'أسبوعين', 0, 0, [['12 Oz', '12 Oz', 360], ['16 Oz', '16 Oz', 390]], 'للعصائر والمشروبات الباردة.'],
  ['cups', 'أغطية كاسات كرتون', 'Paper cup lids', 'كرتونة 1000 غطاء', 'carton of 1000', 1, 1, '', '2–3 أيام عمل', 0, 0, [['80 مم', '80 mm', 130], ['90 مم', '90 mm', 140]], ''],
  ['bags', 'كيس ورقي طباعة ملونة', 'Colour-printed paper bag', 'للقطعة', 'each', 500, 100, '1000:5, 3000:10', '5–7 أيام عمل', 0, 1, [['S 18×24', 'S 18×24', 0.95], ['M 25×32', 'M 25×32', 1.2], ['L 30×40', 'L 30×40', 1.5]], 'ورق كرافت أو أبيض بيد ملفوفة.'],
  ['bags', 'كيس قماش يد خارجية', 'Cotton tote bag', 'للقطعة', 'each', 300, 50, '1000:6', '7–10 أيام عمل', 0, 0, [['30×25', '30×25', 1.4], ['40×30', '40×30', 1.8], ['50×60', '50×60', 2.6]], ''],
  ['bags', 'كيس نايلون شنطة يد', 'Plastic carrier bag', 'للقطعة', 'each', 2000, 500, '5000:5, 10000:10', '7–10 أيام عمل', 0, 0, [['28×50', '28×50', 0.13], ['40×50', '40×50', 0.18]], ''],
  ['bags', 'كيس دلفري مطبوع', 'Printed delivery bag', 'للقطعة', 'each', 500, 100, '1000:5, 3000:10', '5–7 أيام عمل', 0, 1, [['وسط', 'Medium', 1.3], ['كبير', 'Large', 1.6]], 'للمطاعم والتوصيل، قاعدة عريضة.'],
  ['bags', 'شنطة قماش توت باج مطبوعة', 'Printed tote bag', 'للقطعة', 'each', 20, 10, '50:5, 100:10', '5–7 أيام عمل', 0, 0, [['35×40', '35×40', 15]], ''],
  ['food-boxes', 'علب بيتزا طباعة ديجيتال', 'Digitally printed pizza boxes', 'للقطعة', 'each', 500, 100, '1000:5, 3000:10', '7–10 أيام عمل', 0, 1, [['25 سم', '25 cm', 1.4], ['30 سم', '30 cm', 1.6], ['36 سم', '36 cm', 1.9]], ''],
  ['food-boxes', 'علبة برجر مطبوعة', 'Printed burger box', 'للقطعة', 'each', 1000, 500, '3000:5', '7–10 أيام عمل', 0, 0, [['قياسي', 'Standard', 0.7]], ''],
  ['food-boxes', 'علبة بطاطا', 'Fries box', 'للقطعة', 'each', 1000, 500, '', '7–10 أيام عمل', 0, 0, [['صغير', 'Small', 0.6], ['كبير', 'Large', 0.75]], ''],
  ['food-boxes', 'علب شاورما مطبوعة', 'Printed shawarma boxes', 'للقطعة', 'each', 500, 100, '', '7–10 أيام عمل', 0, 0, [['فردي', 'Single', 1.8], ['دبل', 'Double', 2.3]], ''],
  ['food-boxes', 'علبة حلويات شنطة', 'Pastry carry box', 'للقطعة', 'each', 500, 100, '', '7–10 أيام عمل', 0, 0, [['صغير', 'Small', 0.7], ['وسط', 'Medium', 0.95], ['كبير', 'Large', 1.2]], ''],
  ['food-boxes', 'ورق زبدة مطبوع', 'Printed greaseproof paper', 'رزمة 1000 ورقة', 'pack of 1000', 1, 1, '5:5', '7–10 أيام عمل', 0, 0, [['30×30', '30×30', 20]], ''],
  ['wedding-cards', 'كرت عرس أبيض بطباعة ذهبية', 'White card, gold print', 'للقطعة', 'each', 100, 50, '300:5, 500:10', '3–5 أيام عمل', 0, 1, [['مع مغلف', 'With envelope', 1.7]], ''],
  ['wedding-cards', 'كرت عرس شفاف مع ختم شمع', 'Clear card with wax seal', 'للقطعة', 'each', 100, 50, '300:5, 500:10', '3–5 أيام عمل', 0, 0, [['مع مغلف', 'With envelope', 1.6]], ''],
  ['wedding-cards', 'كرت عرس مع مغلف كحلي', 'Card with navy envelope', 'للقطعة', 'each', 100, 50, '300:5, 500:10', '3–5 أيام عمل', 0, 0, [['قياسي', 'Standard', 1.7]], ''],
  ['wedding-cards', 'كرت عرس بطبقات مع حزام', 'Layered card with band', 'للقطعة', 'each', 100, 50, '300:5, 500:10', '3–5 أيام عمل', 0, 0, [['قياسي', 'Standard', 2.1]], ''],
  ['labels', 'ستكر ورقي دائري', 'Round paper sticker', 'طبق', 'sheet', 5, 1, '20:5, 50:10', '2–3 أيام عمل', 0, 0, [['3.5 سم (100 ستكر)', '3.5 cm (100)', 4], ['5 سم (50)', '5 cm (50)', 4], ['10 سم (12)', '10 cm (12)', 4]], ''],
  ['labels', 'ستكر بلاستيكي شفاف', 'Clear plastic sticker', 'طبق', 'sheet', 5, 1, '20:5, 50:10', '2–3 أيام عمل', 0, 0, [['3.5 سم (100 ستكر)', '3.5 cm (100)', 7], ['7 سم (24)', '7 cm (24)', 7]], ''],
  ['labels', 'ليبل رول للمنتجات', 'Product label roll', 'رول 1000 ليبل', 'roll of 1000', 1, 1, '5:5, 10:10', '5–7 أيام عمل', 0, 1, [['دائري 4 سم', 'Round 4 cm', 120], ['مستطيل 5×3', 'Rectangle 5×3', 150]], ''],
  ['paper-prints', 'فلاير ملون وجهين', 'Double-sided colour flyer', 'للقطعة', 'each', 500, 100, '1000:8, 5000:15', '2–3 أيام عمل', 0, 1, [['A5', 'A5', 0.3], ['A4', 'A4', 0.55]], ''],
  ['paper-prints', 'بروشور A4 مطوي', 'Folded A4 brochure', 'للقطعة', 'each', 500, 100, '1000:8', '3–5 أيام عمل', 0, 0, [['3 طيات', 'Tri-fold', 0.9]], ''],
  ['paper-prints', 'كروت شخصية (بزنس كارد)', 'Business cards', 'علبة 1000 كرت', 'box of 1000', 1, 1, '3:10', '2–3 أيام عمل', 0, 1, [['وجه واحد', 'Single-sided', 60], ['وجهين', 'Double-sided', 80], ['سلوفان مطفي', 'Matte laminated', 110]], ''],
  ['paper-prints', 'دفتر مكربن نسختين', 'Carbonless 2-part book', 'للدفتر', 'per book', 10, 5, '50:5, 100:10', '3–5 أيام عمل', 0, 0, [['A6', 'A6', 5], ['A5', 'A5', 7], ['A4', 'A4', 10]], ''],
  ['paper-prints', 'دفتر روشيتات للعيادة', 'Clinic prescription pad', 'للدفتر', 'per book', 20, 10, '50:5', '3–5 أيام عمل', 0, 0, [['A5', 'A5', 6]], ''],
  ['paper-prints', 'مغلفات مطبوعة', 'Printed envelopes', 'للقطعة', 'each', 500, 100, '1000:5', '3–5 أيام عمل', 0, 0, [['23×11', '23×11', 0.24], ['33×23', '33×23', 0.4]], ''],
  ['uniforms', 'مريول قطن مع جيب', 'Cotton apron with pocket', 'للقطعة', 'each', 5, 1, '20:5, 50:10', '5–7 أيام عمل', 0, 0, [['أسود', 'Black', 30], ['كحلي', 'Navy', 30], ['خمري', 'Burgundy', 30], ['بيج', 'Beige', 30]], ''],
  ['uniforms', 'بلوزة بولو قطن', 'Cotton polo shirt', 'للقطعة', 'each', 5, 1, '20:5, 50:10', '5–7 أيام عمل', 0, 1, [['S–XL', 'S–XL', 28], ['XXL', 'XXL', 30]], 'تطريز أو طباعة الشعار على الصدر.'],
  ['uniforms', 'طاقية مطبوعة', 'Printed cap', 'للقطعة', 'each', 10, 1, '50:5', '5–7 أيام عمل', 0, 0, [['كحلي', 'Navy', 20], ['أسود', 'Black', 20], ['بيج', 'Beige', 20]], ''],
  ['uniforms', 'قميص شيف', 'Chef jacket', 'للقطعة', 'each', 3, 1, '', '5–7 أيام عمل', 0, 0, [['أبيض', 'White', 60], ['أسود', 'Black', 60]], ''],
  ['uniforms', 'سكراب طبي بشعار العيادة', 'Medical scrubs with logo', 'للطقم', 'per set', 3, 1, '10:5', '7–10 أيام عمل', 0, 0, [['كحلي', 'Navy', 75], ['أخضر', 'Green', 75], ['خمري', 'Burgundy', 75]], ''],
  ['promo', 'مج سيراميك مطبوع', 'Printed ceramic mug', 'للقطعة', 'each', 12, 6, '50:5, 100:10', '3–5 أيام عمل', 0, 0, [['أبيض', 'White', 6], ['ملون من الداخل', 'Colour inside', 9]], ''],
  ['promo', 'علاقة ريحة سيارة بشعارك', 'Branded car air freshener', 'للقطعة', 'each', 200, 100, '500:5, 1000:10', '7–10 أيام عمل', 0, 0, [['قياسي', 'Standard', 0.9]], ''],
  ['stands', 'ستاند أكريلك طولي مع طباعة', 'Acrylic sign holder with print', 'للقطعة', 'each', 1, 1, '10:5', '2–4 أيام عمل', 0, 0, [['A7', 'A7', 8], ['A5', 'A5', 15], ['A4', 'A4', 23]], ''],
  ['stands', 'رقم طاولة', 'Table number', 'للقطعة', 'each', 5, 1, '', '2–4 أيام عمل', 0, 0, [['بلاستيك', 'Plastic', 9], ['معدني', 'Metal', 12]], ''],
  // marketing
  ['social-media', 'باقة إدارة صفحة أساسية', 'Basic page management', 'شهرياً', 'per month', 1, 1, '', 'تبدأ خلال أسبوع', 1, 1, [['12 منشور + 4 ستوري أسبوعياً', '12 posts + weekly stories', 600]], 'تصميم وكتابة ونشر، وتقرير شهري.'],
  ['social-media', 'باقة إدارة صفحة متقدمة', 'Advanced page management', 'شهرياً', 'per month', 1, 1, '', 'تبدأ خلال أسبوع', 1, 0, [['20 منشور + 8 ريلز + الرد على الرسائل', '20 posts + 8 reels + inbox', 1200]], ''],
  ['ads', 'حملة إعلانية ممولة (فيسبوك وإنستغرام)', 'Paid campaign (Facebook & Instagram)', 'إدارة الحملة', 'campaign management', 1, 1, '', '2–3 أيام', 1, 1, [['إدارة + تصميم', 'Management + creative', 400]], 'الميزانية الإعلانية منفصلة وبتحددها انت.'],
  ['ads', 'إعلان جوجل وخرائط جوجل', 'Google Ads & Maps listing', 'إعداد', 'setup', 1, 1, '', '3–5 أيام', 1, 0, [['إعداد وتحسين', 'Setup & optimisation', 350]], ''],
  ['branding', 'تصميم شعار وهوية بصرية', 'Logo & brand identity', 'للمشروع', 'per project', 1, 1, '', '7–14 يوم', 1, 1, [['شعار + ألوان + خطوط + نماذج', 'Logo + palette + type + templates', 500]], ''],
  ['branding', 'تصوير منتجات احترافي', 'Product photography', 'للجلسة', 'per session', 1, 1, '', 'حسب الموعد', 1, 0, [['حتى 20 منتج', 'Up to 20 products', 300]], ''],
  ['branding', 'تصميم منيو للمطاعم', 'Restaurant menu design', 'للتصميم', 'per design', 1, 1, '', '3–5 أيام', 1, 0, [['تصميم + ملف للطباعة', 'Design + print file', 150]], ''],
  // wholesale
  ['paper-stock', 'ورق طباعة A4 80 جم', 'A4 copy paper 80 gsm', 'رزمة 500 ورقة', 'ream of 500', 5, 5, '50:5, 100:10', 'متوفر', 0, 1, [['رزمة', 'Ream', 18]], ''],
  ['paper-stock', 'ورق كوشيه 300 جم 70×100', 'Coated board 300 gsm 70×100', 'رزمة 125 فرخ', 'pack of 125', 1, 1, '5:5, 10:10', 'متوفر', 0, 0, [['مطفي', 'Matte', 140], ['لامع', 'Gloss', 140]], ''],
  ['rolls', 'رول فينيل لاصق أبيض', 'White adhesive vinyl roll', 'رول 50 متر', 'roll of 50 m', 1, 1, '5:5, 10:8', 'متوفر', 0, 1, [['عرض 1.27 م', '1.27 m wide', 260], ['عرض 1.52 م', '1.52 m wide', 310]], ''],
  ['rolls', 'رول فليكس للبانرات', 'Banner flex roll', 'رول 50 متر', 'roll of 50 m', 1, 1, '5:5', 'متوفر', 0, 0, [['عرض 3.2 م', '3.2 m wide', 520]], ''],
  ['inks', 'حبر إيكو سولفنت', 'Eco-solvent ink', 'لتر', 'litre', 4, 1, '12:5, 24:10', 'متوفر', 0, 0, [['Cyan', 'Cyan', 75], ['Magenta', 'Magenta', 75], ['Yellow', 'Yellow', 75], ['Black', 'Black', 75]], ''],
  ['blank-packaging', 'كاسات كرتون سادة 8 Oz', 'Plain paper cups 8 Oz', 'كرتونة 1000 كاسة', 'carton of 1000', 1, 1, '5:5, 10:10', 'متوفر', 0, 0, [['أبيض', 'White', 180], ['كرافت', 'Kraft', 190]], ''],
  ['blank-packaging', 'أكياس كرافت سادة بيد', 'Plain kraft bags with handle', 'كرتونة 250 كيس', 'carton of 250', 1, 1, '5:5, 10:10', 'متوفر', 0, 0, [['وسط', 'Medium', 90], ['كبير', 'Large', 120]], ''],
];

const ZONES = [
  ['الخليل', 'Hebron', 10, 'نفس اليوم أو اليوم التالي', 'Same or next day'],
  ['بيت لحم وجنوب الضفة', 'Bethlehem & south', 15, '1–2 يوم', '1–2 days'],
  ['باقي محافظات الضفة', 'Rest of the West Bank', 20, '2–3 أيام', '2–3 days'],
  ['القدس', 'Jerusalem', 30, '2–3 أيام', '2–3 days'],
  ['الداخل', 'Inside (48)', 50, '3–4 أيام', '3–4 days'],
  ['استلام من المطبعة', 'Pick up from the shop', 0, 'بنبلغك لما يجهز', 'We’ll tell you when ready'],
];

export function seedIfEmpty({ reset = false } = {}) {
  if (reset) db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM quotes; DELETE FROM variants; DELETE FROM products; DELETE FROM categories; DELETE FROM departments; DELETE FROM zones;');
  if (get('SELECT COUNT(*) n FROM departments').n > 0) return false;
  tx(() => {
    const deptId = {};
    DEPTS.forEach((d, i) => {
      deptId[d.slug] = Number(run('INSERT INTO departments(slug,name_ar,name_en,blurb_ar,blurb_en,image,mode,sort) VALUES (?,?,?,?,?,?,?,?)',
        d.slug, d.ar[0], d.en[0], d.ar[1], d.en[1], d.image, d.mode, i).lastInsertRowid);
    });
    const catId = {};
    CATS.forEach(([dept, slug, ar, en, image], i) => {
      catId[slug] = Number(run('INSERT INTO categories(department_id,slug,name_ar,name_en,image,sort) VALUES (?,?,?,?,?,?)', deptId[dept], slug, ar, en, image, i).lastInsertRowid);
    });
    const used = new Set();
    P.forEach(([c, ar, en, uar, uen, min, step, tiers, days, quote, featured, variants, short], i) => {
      let slug = slugify(en) || 'p-' + i;
      while (used.has(slug)) slug += '-' + i;
      used.add(slug);
      const pid = Number(run(`INSERT INTO products(slug,category_id,name_ar,name_en,short_ar,unit_ar,unit_en,min_qty,step,tiers,days_ar,quote,featured,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`,
        slug, catId[c], ar, en, short, uar, uen, min, step, T(tiers), days, quote, featured, `-${P.length - i} minutes`).lastInsertRowid);
      variants.forEach(([lar, len, price], j) =>
        run('INSERT INTO variants(product_id,label_ar,label_en,price,sku,sort) VALUES (?,?,?,?,?,?)', pid, lar, len, price, `SH-${String(pid).padStart(3, '0')}-${j + 1}`, j));
    });
    ZONES.forEach(([ar, en, fee, ear, een], i) => run('INSERT INTO zones(name_ar,name_en,fee,eta_ar,eta_en,sort) VALUES (?,?,?,?,?,?)', ar, en, fee, ear, een, i));
  });
  return true;
}
