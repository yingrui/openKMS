#!/bin/sh
# Optional Debian apt mirror for faster Docker builds (e.g. China hosts).
# Usage: APT_MIRROR=mirrors.aliyun.com apt-set-mirror.sh
# Leave unset for default deb.debian.org.

set -eu

if [ -z "${APT_MIRROR:-}" ]; then
  exit 0
fi

echo "apt-set-mirror: using https://${APT_MIRROR}/debian"

if [ -f /etc/apt/sources.list.d/debian.sources ]; then
  sed -i \
    -e "s|http://deb.debian.org/debian|https://${APT_MIRROR}/debian|g" \
    -e "s|https://deb.debian.org/debian|https://${APT_MIRROR}/debian|g" \
    -e "s|http://security.debian.org/debian-security|https://${APT_MIRROR}/debian-security|g" \
    -e "s|https://security.debian.org/debian-security|https://${APT_MIRROR}/debian-security|g" \
    /etc/apt/sources.list.d/debian.sources
fi

if [ -f /etc/apt/sources.list ]; then
  sed -i \
    -e "s|deb.debian.org|${APT_MIRROR}|g" \
    -e "s|security.debian.org|${APT_MIRROR}-security|g" \
    /etc/apt/sources.list
fi
