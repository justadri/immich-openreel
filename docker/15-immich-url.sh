#!/bin/sh
# Runs from the nginx image entrypoint before the config template is rendered (20-envsubst).
# An executed script cannot export variables to later ones, so the values are baked into the template.
set -e
tpl=/etc/nginx/templates/default.conf.template

# IMMICH_URL: accept http://host:2283, http://host:2283/ or http://host:2283/api; keep just the origin.
url="${IMMICH_URL%/}"
url="${url%/api}"

# NGINX_RESOLVER: whatever DNS server this container uses (Docker's embedded 127.0.0.11 on a compose
# network, the host's on the default bridge, kube-dns on Kubernetes) unless set explicitly.
resolver="${NGINX_RESOLVER:-$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)}"
case "$resolver" in
  \[*) ;;
  *:*) resolver="[$resolver]" ;;
esac

sed -i -e "s#\${IMMICH_URL}#${url}#g" -e "s#\${NGINX_RESOLVER}#${resolver}#g" "$tpl"
echo "15-immich-url.sh: proxying /immich-api to ${url}/api (DNS ${resolver})"
