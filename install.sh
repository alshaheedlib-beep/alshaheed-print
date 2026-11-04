#!/usr/bin/env bash
# مطبعة الشهيد — تركيب الموقع على السيرفر (مرة واحدة فقط):
#   curl -fsSL https://raw.githubusercontent.com/alshaheedlib-beep/alshaheed-print/main/install.sh | bash
# بعدها أي تعديل يُرفع على GitHub يظهر على الموقع خلال دقيقة، بدون أي خطوة.
set -euo pipefail
REPO=https://github.com/alshaheedlib-beep/alshaheed-print.git
SRC=/opt/alshaheed-print
NAME=alshaheed-print
PORT=8081
DOMAINS="alshaheed.ps, www.alshaheed.ps"

# 1) نسخة الموقع من GitHub
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull -q --ff-only
else git clone -q "$REPO" "$SRC"; fi

# 2) تشغيل الموقع (nginx خفيف) — الملفات تُقرأ مباشرة من نسخة GitHub
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --memory 64m \
  -p $PORT:80 -v "$SRC/site":/usr/share/nginx/html:ro nginx:alpine >/dev/null
docker network inspect web >/dev/null 2>&1 && docker network connect web "$NAME" 2>/dev/null || true
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow $PORT/tcp >/dev/null; fi

# 3) ربط الدومين عن طريق Caddy (https تلقائي) إذا كان شغّال على السيرفر
DOMAIN_MSG="لم يُعثر على Caddy — الموقع متاح على المنفذ $PORT فقط"
if docker ps --format '{{.Names}}' | grep -qx caddy; then
  CF=$(docker inspect caddy --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
  if [ -n "$CF" ]; then
    docker network connect web "$NAME" 2>/dev/null || true
    if ! grep -q "reverse_proxy $NAME:80" "$CF"; then
      printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy %s:80\n}\n' "$DOMAINS" "$NAME" >> "$CF"
    fi
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
      && DOMAIN_MSG="https://alshaheed.ps  (يشتغل لما الدومين يوصل للسيرفر)" \
      || DOMAIN_MSG="تمت إضافة الدومين لكن Caddy لم يُعد التحميل — شغّل: docker logs caddy"
  fi
fi

# 4) تحديث تلقائي كل دقيقة من GitHub
echo "* * * * * root git -C $SRC pull -q --ff-only >> /var/log/$NAME-pull.log 2>&1" > /etc/cron.d/$NAME-pull
chmod 644 /etc/cron.d/$NAME-pull

IP=$(curl -4 -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo "=============================================="
echo " رابط التجربة:   http://$IP:$PORT"
echo " الدومين:        $DOMAIN_MSG"
echo " التحديث التلقائي من GitHub: مفعّل (كل دقيقة)"
echo "=============================================="
