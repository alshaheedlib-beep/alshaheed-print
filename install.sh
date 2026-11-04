#!/usr/bin/env bash
# مطبعة الشهيد — تركيب المتجر على السيرفر (مرة واحدة فقط):
#   curl -fsSL https://raw.githubusercontent.com/alshaheedlib-beep/alshaheed-print/main/install.sh | bash
# بعدها أي تعديل يُرفع على GitHub يظهر على الموقع خلال دقيقة أو دقيقتين، بدون أي خطوة.
set -euo pipefail
REPO=https://github.com/alshaheedlib-beep/alshaheed-print.git
SRC=/opt/alshaheed-print
NAME=alshaheed-print
PORT=8081

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# 1) نسخة الموقع من GitHub
if [ -d "$SRC/.git" ]; then git -C "$SRC" fetch -q origin main && git -C "$SRC" reset -q --hard origin/main
else git clone -q "$REPO" "$SRC"; fi

# 2) بناء وتشغيل المتجر (قاعدة البيانات والصور محفوظة في /opt/alshaheed-data)
echo ">> بناء المتجر وتشغيله… (أول مرة بتاخذ دقيقة أو دقيقتين)"
bash "$SRC/deploy/run.sh"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow $PORT/tcp >/dev/null; fi

# 3) ربط الدومين عن طريق Caddy (https تلقائي) إذا كان شغّال على السيرفر
DOMAIN_MSG="لم يُعثر على Caddy — المتجر متاح على المنفذ $PORT فقط"
if docker ps --format '{{.Names}}' | grep -qx caddy; then
  CF=$(docker inspect caddy --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
  if [ -n "$CF" ]; then
    if grep -q "reverse_proxy $NAME:" "$CF"; then
      sed -i "s#reverse_proxy $NAME:[0-9]*#reverse_proxy $NAME:3000#" "$CF"
    else
      printf '\nalshaheed.ps, www.alshaheed.ps {\n\tencode zstd gzip\n\treverse_proxy %s:3000\n}\n' "$NAME" >> "$CF"
    fi
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
      && DOMAIN_MSG="https://alshaheed.ps  (يشتغل لما الدومين يوصل للسيرفر)" \
      || DOMAIN_MSG="تمت إضافة الدومين لكن Caddy لم يُعد التحميل — شغّل: docker logs caddy"
  fi
fi

# 4) تحديث تلقائي من GitHub كل دقيقة (يبني المتجر من جديد عند وجود تعديل)
rm -f /etc/cron.d/$NAME-pull
echo "* * * * * root flock -n /tmp/$NAME.lock bash $SRC/deploy/update.sh >> /var/log/$NAME-deploy.log 2>&1" > /etc/cron.d/$NAME-deploy
chmod 644 /etc/cron.d/$NAME-deploy

sleep 3
IP=$(curl -4 -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo "=============================================="
echo " المتجر:          http://$IP:$PORT"
echo " لوحة التحكم:     http://$IP:$PORT/admin"
echo " كلمة سر اللوحة:  $(cat /opt/alshaheed-data/admin-password.txt)"
echo " الدومين:         $DOMAIN_MSG"
echo " التحديث التلقائي من GitHub: مفعّل"
echo "=============================================="
