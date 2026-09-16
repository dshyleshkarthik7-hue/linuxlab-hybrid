#!/usr/bin/env bash
set -Eeuo pipefail

WORK="${1:-}"
OUTPUT="${2:-}"
[[ -n "$WORK" ]] || { echo "WORK directory is required." >&2; exit 2; }
[[ -n "$OUTPUT" ]] || { echo "OUTPUT directory is required." >&2; exit 2; }

WORK="$(readlink -f "$WORK")"
OUTPUT="$(readlink -f "$OUTPUT")"
[[ "$WORK" != "/" && "$WORK" != "/tmp" ]] || { echo "Unsafe WORK directory." >&2; exit 1; }

ROOTFS="$WORK/rootfs"
ISO_TREE="$WORK/iso-tree"
BASE_ISO="$WORK/base-iso"
MINIROOTFS="$WORK/alpine-minirootfs-3.24.1-x86.tar.gz"
ALPINE_ISO="$WORK/alpine-standard-3.24.1-x86.iso"
INITRAMFS="$WORK/initramfs-linuxlab-gcc"
ALPINE_ROOTFS_URL="https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-3.24.1-x86.tar.gz"
ALPINE_ROOTFS_SUM_URL="${ALPINE_ROOTFS_URL}.sha256"
ALPINE_ISO_URL="https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-standard-3.24.1-x86.iso"
ALPINE_ISO_SUM_URL="${ALPINE_ISO_URL}.sha256"

log(){ echo; echo "[LinuxLab] $*"; }
die(){ echo "[LinuxLab][ERROR] $*" >&2; exit 1; }
trap 'echo "[LinuxLab][ERROR] Build failed at line $LINENO." >&2' ERR

mkdir -p "$WORK" "$OUTPUT"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl file xorriso cpio gzip tar qemu-user-static

verify_download(){
  local file="$1" sum_url="$2" name="$3" sum_file expected actual
  sum_file="${file}.sha256"
  curl -fL --retry 5 --retry-delay 2 -o "$sum_file" "$sum_url"
  expected="$(awk -v n="$name" '$2==n || $2==("*" n) {print $1; exit}' "$sum_file")"
  [[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || die "Could not obtain a valid SHA-256 for $name from the official Alpine checksum file."
  actual="$(sha256sum "$file" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die "SHA-256 verification failed for $name."
  rm -f "$sum_file"
  log "Verified $name ($actual)"
}

log "Preparing Alpine 3.24.1 x86 custom GCC rootfs"
rm -rf "$ROOTFS"
mkdir -p "$ROOTFS"
if [[ ! -s "$MINIROOTFS" ]]; then curl -fL --retry 5 --retry-delay 2 -o "$MINIROOTFS" "$ALPINE_ROOTFS_URL"; fi
[[ -s "$MINIROOTFS" ]] || die "Alpine minirootfs download failed."
verify_download "$MINIROOTFS" "$ALPINE_ROOTFS_SUM_URL" "alpine-minirootfs-3.24.1-x86.tar.gz"
tar -xzf "$MINIROOTFS" -C "$ROOTFS"
[[ -d "$ROOTFS/etc" && -x "$ROOTFS/bin/busybox" ]] || die "Invalid Alpine rootfs."

cat > "$ROOTFS/etc/apk/repositories" <<'EOF'
https://dl-cdn.alpinelinux.org/alpine/v3.24/main
https://dl-cdn.alpinelinux.org/alpine/v3.24/community
EOF
cat > "$ROOTFS/etc/resolv.conf" <<'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

if [[ -x /usr/bin/qemu-i386-static ]]; then cp -f /usr/bin/qemu-i386-static "$ROOTFS/usr/bin/qemu-i386-static"; fi
[[ -x "$ROOTFS/usr/bin/qemu-i386-static" ]] || die "qemu-i386-static is unavailable."

# The chroot receives only isolated pseudo-filesystems/devices required by package scripts.
# It never recursively exposes host /sys, /dev, or /run.
mkdir -p "$ROOTFS/proc" "$ROOTFS/sys" "$ROOTFS/dev" "$ROOTFS/dev/pts" "$ROOTFS/run"
mountpoint -q "$ROOTFS/proc" || mount -t proc proc "$ROOTFS/proc"
cleanup(){ set +e; mountpoint -q "$ROOTFS/proc" && umount "$ROOTFS/proc"; }
trap cleanup EXIT

make_node(){ local path="$1" mode="$2" major="$3" minor="$4"; [[ -e "$ROOTFS$path" ]] || mknod -m "$mode" "$ROOTFS$path" c "$major" "$minor"; }
make_node /dev/null 666 1 3
make_node /dev/zero 666 1 5
make_node /dev/random 666 1 8
make_node /dev/urandom 666 1 9
make_node /dev/tty 666 5 0
make_node /dev/console 600 5 1
ln -snf /proc/self/fd "$ROOTFS/dev/fd"
ln -snf /proc/self/fd/0 "$ROOTFS/dev/stdin"
ln -snf /proc/self/fd/1 "$ROOTFS/dev/stdout"
ln -snf /proc/self/fd/2 "$ROOTFS/dev/stderr"

log "Installing custom Alpine GCC development environment"
chroot "$ROOTFS" /bin/sh <<'ALPINE_INSTALL'
set -eu
apk update
apk add --no-cache alpine-base openrc busybox-openrc busybox-suid busybox-extras gcc g++ make musl-dev build-base binutils bash git curl wget ca-certificates tar gzip bzip2 xz zip unzip cmake samurai python3 strace lsof procps util-linux pciutils nano vim less file
ALPINE_INSTALL

chroot "$ROOTFS" /bin/sh <<'ALPINE_CONFIG'
set -eu
mkdir -p /root/examples /root/bin /etc/local.d /etc/runlevels/boot /etc/runlevels/default
if [ ! -e /sbin/init ]; then
  if [ -e /sbin/openrc-init ]; then ln -s /sbin/openrc-init /sbin/init; else ln -s /bin/busybox /sbin/init; fi
fi
test -e /sbin/init
test -x /usr/bin/gcc
cat >/tmp/hello.c <<'EOF'
#include <stdio.h>
int main(void){ puts("Hello from LinuxLab GCC!"); return 0; }
EOF
gcc /tmp/hello.c -o /tmp/hello
/tmp/hello
rm -f /tmp/hello.c /tmp/hello
cat >/root/examples/hello.c <<'EOF'
#include <stdio.h>
int main(void){ puts("LinuxLab GCC example"); return 0; }
EOF
cat >/root/examples/Makefile <<'EOF'
CC=gcc
CFLAGS=-Wall -Wextra -O2
all: hello
hello: hello.c
	$(CC) $(CFLAGS) hello.c -o hello
clean:
	rm -f hello
EOF
cat >/etc/local.d/linuxlab.start <<'EOF'
#!/bin/sh
echo
echo "LinuxLab Engine B"
echo "Alpine Linux x86 • GCC development environment"
gcc --version | head -n 1
echo "Try: cd /root/examples"
echo
EOF
chmod +x /etc/local.d/linuxlab.start
rc-update add local default 2>/dev/null || true
apk info -vv >/root/linuxlab-packages.txt
ALPINE_CONFIG

[[ -x "$ROOTFS/usr/bin/gcc" && -e "$ROOTFS/sbin/init" && -x "$ROOTFS/bin/busybox" ]] || die "Custom Alpine rootfs verification failed."
chroot "$ROOTFS" /bin/sh -c 'set -eu; test -e /sbin/init; test -x /usr/bin/gcc; test -x /bin/busybox; gcc --version | head -n 1'
cleanup
trap - EXIT

log "Preparing official Alpine boot media"
if [[ ! -s "$ALPINE_ISO" ]]; then curl -fL --retry 5 --retry-delay 2 -o "$ALPINE_ISO" "$ALPINE_ISO_URL"; fi
[[ -s "$ALPINE_ISO" ]] || die "Alpine boot ISO download failed."
verify_download "$ALPINE_ISO" "$ALPINE_ISO_SUM_URL" "alpine-standard-3.24.1-x86.iso"
rm -rf "$BASE_ISO" "$ISO_TREE"
mkdir -p "$BASE_ISO" "$ISO_TREE"
xorriso -osirrox on -indev "$ALPINE_ISO" -extract / "$BASE_ISO"
[[ -d "$BASE_ISO/boot" ]] || die "Alpine boot media has no /boot."
cp -a "$BASE_ISO"/. "$ISO_TREE"/

log "Creating isolated custom initramfs"
rm -f "$INITRAMFS" "$INITRAMFS.cpio"
(
  cd "$ROOTFS"
  find . -path './dev' -prune -o -path './proc' -prune -o -path './sys' -prune -o -path './run' -prune -o -print0
) | cpio --null -o -H newc > "$INITRAMFS.cpio"
gzip -9 -c "$INITRAMFS.cpio" > "$INITRAMFS"
rm -f "$INITRAMFS.cpio"
[[ -s "$INITRAMFS" ]] || die "Initramfs creation failed."
cp -f "$INITRAMFS" "$ISO_TREE/boot/initramfs-lts"

ISOLINUX_BIN=""
for candidate in "$ISO_TREE/boot/syslinux/isolinux.bin" "$ISO_TREE/isolinux/isolinux.bin" "$ISO_TREE/boot/isolinux/isolinux.bin"; do
  if [[ -f "$candidate" ]]; then ISOLINUX_BIN="$candidate"; break; fi
done
[[ -n "$ISOLINUX_BIN" ]] || die "isolinux.bin was not found."
ISOLINUX_REL="${ISOLINUX_BIN#"$ISO_TREE"/}"
BOOT_CAT="$(dirname "$ISOLINUX_REL")/boot.cat"
[[ -e "$ISO_TREE/$BOOT_CAT" ]] || : > "$ISO_TREE/$BOOT_CAT"

log "Creating LinuxLab custom Alpine ISO"
rm -f "$OUTPUT/alpine.iso"
xorriso -as mkisofs -o "$OUTPUT/alpine.iso" -V "LINUXLAB-GCC" -b "$ISOLINUX_REL" -c "$BOOT_CAT" -no-emul-boot -boot-load-size 4 -boot-info-table "$ISO_TREE"
[[ -s "$OUTPUT/alpine.iso" ]] || die "ISO creation failed."
file "$OUTPUT/alpine.iso"
ls -lh "$OUTPUT/alpine.iso"
log "LinuxLab Alpine GCC ISO build complete: $OUTPUT/alpine.iso"
