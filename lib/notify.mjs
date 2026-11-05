/* Order / quote notifications. Set ORDER_WEBHOOK_URL to receive a JSON POST for each new order or quote
   (works with Zapier / Make / n8n / a WhatsApp gateway). Failures never block the customer. */
function post(payload) {
  const url = process.env.ORDER_WEBHOOK_URL;
  if (!url) return;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) })
    .catch((e) => console.error('[notify] webhook failed:', e.message));
}

export function notifyNewOrder(order, items) {
  console.log(`[order] ${order.number} · ${order.total} ILS · ${order.payment_method} · ${order.name} ${order.phone}`);
  post({
    event: 'order.created', number: order.number, total: order.total, payment_method: order.payment_method, logo: order.logo,
    customer: { name: order.name, phone: order.phone, business: order.business, zone: order.zone_name, city: order.city, address: order.address },
    items: items.map((i) => ({ name: i.name, variant: i.variant_label, qty: i.qty, price: i.price })),
  });
}

export function notifyNewQuote(q) {
  console.log(`[quote] ${q.number} · ${q.department_name} · ${q.product_name} · ${q.name} ${q.phone}`);
  post({ event: 'quote.created', number: q.number, department: q.department_name, product: q.product_name, customer: { name: q.name, phone: q.phone, business: q.business, city: q.city }, details: q.details, file: q.file });
}

const DESIGN_LOG = { 'design.assigned': 'مصمم استلم', 'design.proof': 'نموذج جديد', 'design.customer_message': 'رسالة من العميل', 'design.approved': 'العميل اعتمد التصميم' };
export function notifyDesign(event, order, extra = {}) {
  console.log(`[design] ${order.number} · ${DESIGN_LOG[event] || event}${extra.designer ? ' · ' + extra.designer : ''}`);
  post({ event, number: order.number, customer: { name: order.name, phone: order.phone }, ...extra });
}
