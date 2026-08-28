```bash
#!/usr/bin/env bash

set -Eeuo pipefail

WORK="${1:-}"
OUTPUT="${2:-}"

if [[ -z "$WORK" ]]; then
    echo "ERROR: WORK directory is required." >&2
    exit 2
fi

if [[ -z "$OUTPUT" ]]; then
    echo "ERROR: OUTPUT directory is required." >&2
    exit 2
fi

log() {
    echo
    echo "[LinuxLab] $*"
}

die() {
    echo
    echo "[LinuxLab][ERROR] $*" >&2
    exit 1
}

trap 'echo "[LinuxLab][ERROR] Build failed at line $LINENO." >&2' ERR

# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

WORK="$(readlink -f "$WORK")"
OUTPUT="$(readlink -f "$OUTPUT")"

ROOTFS="$WORK/rootfs"
ISO_TREE="$WORK/iso-tree"
BASE_ISO="$WORK/base-iso"

MINIROOTFS="$WORK/alpine-minirootfs-3.24.1-x86.tar.gz"
ALPINE_ISO="$WORK/alpine-standard-3.24.1-x86.iso"

INITRAMFS="$WORK/initramfs-linuxlab-gcc"

mkdir -p "$WORK"
mkdir -p "$OUTPUT"

log "LinuxLab Alpine GCC builder started"
log "WORK   = $WORK"
log "OUTPUT = $OUTPUT"

# ------------------------------------------------------------
# Safety check
# ------------------------------------------------------------

if [[ "$WORK" == "/tmp" || "$WORK" == "/" ]]; then
    die "Unsafe WORK directory."
fi

# ------------------------------------------------------------
# Ubuntu / WSL tools
# ------------------------------------------------------------

log "Installing Ubuntu-side build tools..."

export DEBIAN_FRONTEND=noninteractive

apt-get update

apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    file \
    xorriso \
    cpio \
    gzip \
    tar \
    qemu-user-static

# ------------------------------------------------------------
# Alpine minirootfs
# ------------------------------------------------------------

ALPINE_ROOTFS_URL="https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-3.24.1-x86.tar.gz"

log "Preparing Alpine 3.24.1 x86 minirootfs..."

rm -rf "$ROOTFS"
mkdir -p "$ROOTFS"

if [[ ! -s "$MINIROOTFS" ]]; then
    log "Downloading Alpine minirootfs..."

    curl -fL \
        --retry 5 \
        --retry-delay 2 \
        -o "$MINIROOTFS" \
        "$ALPINE_ROOTFS_URL"
fi

if [[ ! -s "$MINIROOTFS" ]]; then
    die "Alpine minirootfs download failed."
fi

log "Extracting Alpine root filesystem..."

tar -xzf "$MINIROOTFS" -C "$ROOTFS"

# ------------------------------------------------------------
# Verify rootfs before package installation
# ------------------------------------------------------------

if [[ ! -d "$ROOTFS/etc" ]]; then
    die "Invalid Alpine rootfs: /etc is missing."
fi

if [[ ! -x "$ROOTFS/bin/busybox" ]]; then
    die "Invalid Alpine rootfs: /bin/busybox is missing."
fi

# ------------------------------------------------------------
# Alpine repositories
# ------------------------------------------------------------

log "Configuring Alpine repositories..."

cat > "$ROOTFS/etc/apk/repositories" <<'EOF'
https://dl-cdn.alpinelinux.org/alpine/v3.24/main
https://dl-cdn.alpinelinux.org/alpine/v3.24/community
EOF

# ------------------------------------------------------------
# DNS
# ------------------------------------------------------------

mkdir -p "$ROOTFS/etc"

cat > "$ROOTFS/etc/resolv.conf" <<'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

# ------------------------------------------------------------
# QEMU i386 userspace
# ------------------------------------------------------------

log "Installing QEMU i386 userspace emulator..."

if [[ -x /usr/bin/qemu-i386-static ]]; then
    cp -f /usr/bin/qemu-i386-static "$ROOTFS/usr/bin/qemu-i386-static"
fi

if [[ ! -x "$ROOTFS/usr/bin/qemu-i386-static" ]]; then
    die "qemu-i386-static was not installed."
fi

# ------------------------------------------------------------
# Mount temporary filesystems
# ------------------------------------------------------------

log "Mounting temporary filesystems..."

mkdir -p \
    "$ROOTFS/proc" \
    "$ROOTFS/sys" \
    "$ROOTFS/dev" \
    "$ROOTFS/run"

mountpoint -q "$ROOTFS/proc" || mount -t proc proc "$ROOTFS/proc"
mountpoint -q "$ROOTFS/sys"  || mount --rbind /sys "$ROOTFS/sys"
mountpoint -q "$ROOTFS/dev"  || mount --rbind /dev "$ROOTFS/dev"
mountpoint -q "$ROOTFS/run"  || mount --rbind /run "$ROOTFS/run"

cleanup_mounts() {
    set +e

    mountpoint -q "$ROOTFS/run"  && umount -R "$ROOTFS/run"
    mountpoint -q "$ROOTFS/dev"  && umount -R "$ROOTFS/dev"
    mountpoint -q "$ROOTFS/sys"  && umount -R "$ROOTFS/sys"
    mountpoint -q "$ROOTFS/proc" && umount "$ROOTFS/proc"
}

trap cleanup_mounts EXIT

# ------------------------------------------------------------
# Alpine package installation
# ------------------------------------------------------------

log "Installing Alpine packages..."

chroot "$ROOTFS" /bin/sh <<'ALPINE_INSTALL'
set -eu

echo "[Alpine] Updating repositories..."
apk update

echo "[Alpine] Installing LinuxLab packages..."

apk add --no-cache \
    alpine-base \
    openrc \
    busybox-openrc \
    busybox-suid \
    busybox-extras \
    gcc \
    g++ \
    make \
    musl-dev \
    build-base \
    binutils \
    bash \
    git \
    curl \
    wget \
    ca-certificates \
    tar \
    gzip \
    bzip2 \
    xz \
    zip \
    unzip \
    cmake \
    samurai \
    python3 \
    strace \
    lsof \
    procps \
    util-linux \
    pciutils \
    nano \
    vim \
    less \
    file

echo "[Alpine] Package installation complete."
ALPINE_INSTALL

# ------------------------------------------------------------
# Alpine configuration
# ------------------------------------------------------------

log "Configuring Alpine..."

chroot "$ROOTFS" /bin/sh <<'ALPINE_CONFIG'
set -eu

echo "[Alpine] Testing GCC..."

cat > /tmp/hello.c <<'EOF'
#include <stdio.h>

int main(void)
{
    printf("Hello from LinuxLab GCC!\n");
    return 0;
}
EOF

gcc /tmp/hello.c -o /tmp/hello
/tmp/hello

rm -f /tmp/hello.c /tmp/hello

echo "[Alpine] Checking GCC:"
gcc --version | head -n 1

echo "[Alpine] Checking BusyBox:"
ls -l /bin/busybox

echo "[Alpine] Checking OpenRC:"
ls -l /sbin/openrc-init 2>/dev/null || true
ls -l /sbin/openrc 2>/dev/null || true
ls -l /sbin/init 2>/dev/null || true

# Alpine normally provides /sbin/init as a BusyBox/OpenRC-compatible link.
if [ ! -e /sbin/init ]; then
    if [ -e /sbin/openrc-init ]; then
        ln -s /sbin/openrc-init /sbin/init
        echo "[Alpine] Created /sbin/init -> /sbin/openrc-init"
    elif [ -x /bin/busybox ]; then
        ln -s /bin/busybox /sbin/init
        echo "[Alpine] Created /sbin/init -> /bin/busybox"
    else
        echo "[Alpine][ERROR] Cannot create /sbin/init."
        exit 1
    fi
fi

if [ ! -e /sbin/init ]; then
    echo "[Alpine][ERROR] /sbin/init is still missing."
    exit 1
fi

echo "[Alpine] Final /sbin/init:"
ls -l /sbin/init

echo "[Alpine] Creating required directories..."

mkdir -p \
    /root/examples \
    /root/bin \
    /etc/local.d \
    /etc/runlevels/boot \
    /etc/runlevels/default

echo "[Alpine] Creating example GCC program..."

cat > /root/examples/hello.c <<'EOF'
#include <stdio.h>

int main(void)
{
    puts("LinuxLab GCC example");
    return 0;
}
EOF

cat > /root/examples/Makefile <<'EOF'
CC=gcc
CFLAGS=-Wall -Wextra -O2

all: hello

hello: hello.c
	$(CC) $(CFLAGS) hello.c -o hello

clean:
	rm -f hello
EOF

echo "[Alpine] Creating LinuxLab boot script..."

cat > /etc/local.d/linuxlab.start <<'EOF'
#!/bin/sh

echo
echo "============================================================"
echo " LinuxLab Engine B"
echo " Alpine Linux x86"
echo " GCC development environment"
echo "============================================================"
echo
echo "GCC:"
gcc --version | head -n 1
echo
echo "Type 'cd /root/examples' to see the GCC example."
echo
EOF

chmod +x /etc/local.d/linuxlab.start

# Make sure local service scripts are enabled when OpenRC is used.
rc-update add local default 2>/dev/null || true

echo "[Alpine] Recording installed packages..."
apk info -vv > /root/linuxlab-packages.txt

echo "[Alpine] Configuration complete."
ALPINE_CONFIG

# ------------------------------------------------------------
# Verify Alpine rootfs from Ubuntu/WSL side
# ------------------------------------------------------------

log "Checking installed GCC..."

if [[ ! -x "$ROOTFS/usr/bin/gcc" ]]; then
    die "GCC was not installed correctly."
fi

log "GCC found."

log "Checking Alpine init..."

if [[ ! -e "$ROOTFS/sbin/init" ]]; then
    die "Alpine init is missing from rootfs."
fi

if [[ ! -e "$ROOTFS/bin/busybox" ]]; then
    die "Alpine BusyBox is missing from rootfs."
fi

log "Alpine init:"
ls -l "$ROOTFS/sbin/init"

log "Alpine BusyBox:"
ls -l "$ROOTFS/bin/busybox"

# ------------------------------------------------------------
# Verify rootfs inside chroot one more time
# ------------------------------------------------------------

log "Final rootfs verification..."

chroot "$ROOTFS" /bin/sh -c '
set -eu

echo "[Alpine] /sbin/init:"
ls -l /sbin/init

echo "[Alpine] /bin/busybox:"
ls -l /bin/busybox

echo "[Alpine] GCC:"
gcc --version | head -n 1

test -e /sbin/init
test -e /bin/busybox
test -x /usr/bin/gcc

echo "[Alpine] Rootfs verification OK."
'

# ------------------------------------------------------------
# Unmount temporary filesystems before archiving
# ------------------------------------------------------------

log "Unmounting temporary filesystems..."

cleanup_mounts
trap - EXIT

# ------------------------------------------------------------
# Prepare ISO tree
# ------------------------------------------------------------

log "Downloading official Alpine x86 boot media..."

ALPINE_ISO_URL="https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-standard-3.24.1-x86.iso"

if [[ ! -s "$ALPINE_ISO" ]]; then
    curl -fL \
        --retry 5 \
        --retry-delay 2 \
        -o "$ALPINE_ISO" \
        "$ALPINE_ISO_URL"
fi

if [[ ! -s "$ALPINE_ISO" ]]; then
    die "Alpine boot ISO was not downloaded."
fi

log "Extracting Alpine boot files..."

rm -rf "$BASE_ISO"
mkdir -p "$BASE_ISO"

xorriso \
    -osirrox on \
    -indev "$ALPINE_ISO" \
    -extract / "$BASE_ISO"

# ------------------------------------------------------------
# Locate Alpine boot files
# ------------------------------------------------------------

if [[ ! -d "$BASE_ISO/boot" ]]; then
    die "Extracted Alpine ISO does not contain /boot."
fi

log "Creating bootable LinuxLab ISO tree..."

rm -rf "$ISO_TREE"
mkdir -p "$ISO_TREE"

cp -a "$BASE_ISO"/. "$ISO_TREE"/

mkdir -p "$ISO_TREE/boot"

# ------------------------------------------------------------
# Create initramfs
# ------------------------------------------------------------

log "Creating initramfs..."

rm -f "$INITRAMFS"
rm -f "$INITRAMFS.cpio"

if [[ ! -d "$ROOTFS" ]]; then
    die "Rootfs directory does not exist: $ROOTFS"
fi

if [[ ! -x "$ROOTFS/bin/busybox" ]]; then
    die "Rootfs BusyBox is missing: $ROOTFS/bin/busybox"
fi

if [[ ! -e "$ROOTFS/sbin/init" ]]; then
    die "Rootfs /sbin/init is missing before initramfs creation."
fi

log "Rootfs init:"
ls -l "$ROOTFS/sbin/init"

log "Rootfs BusyBox:"
ls -l "$ROOTFS/bin/busybox"

log "Creating cpio archive..."

set +e

(
    cd "$ROOTFS" &&
    find . \
        -path './dev' -prune -o \
        -path './proc' -prune -o \
        -path './sys' -prune -o \
        -path './run' -prune -o \
        -print0
) | cpio --null -o -H newc > "$INITRAMFS.cpio"

FIND_CPIO_STATUS=${PIPESTATUS[0]}
CPIO_STATUS=${PIPESTATUS[1]}

set -e

if [[ "$FIND_CPIO_STATUS" -ne 0 ]]; then
    die "find failed while creating initramfs."
fi

if [[ "$CPIO_STATUS" -ne 0 ]]; then
    die "cpio failed while creating initramfs."
fi

if [[ ! -s "$INITRAMFS.cpio" ]]; then
    die "cpio archive was not created."
fi

log "Compressing initramfs..."

gzip -9 -c "$INITRAMFS.cpio" > "$INITRAMFS"

if [[ ! -s "$INITRAMFS" ]]; then
    die "Compressed initramfs was not created."
fi

rm -f "$INITRAMFS.cpio"

log "Initramfs:"
ls -lh "$INITRAMFS"

cp -f "$INITRAMFS" "$ISO_TREE/boot/initramfs-lts"

if [[ ! -s "$ISO_TREE/boot/initramfs-lts" ]]; then
    die "Initramfs was not copied into ISO tree."
fi

# ------------------------------------------------------------
# Verify ISO tree
# ------------------------------------------------------------

log "Verifying ISO tree..."

if [[ ! -e "$ISO_TREE/boot/initramfs-lts" ]]; then
    die "ISO tree initramfs is missing."
fi

if [[ ! -e "$ISO_TREE/boot" ]]; then
    die "ISO tree /boot is missing."
fi

# ------------------------------------------------------------
# Find isolinux boot files
# ------------------------------------------------------------

ISOLINUX_BIN=""

for candidate in \
    "$ISO_TREE/boot/syslinux/isolinux.bin" \
    "$ISO_TREE/isolinux/isolinux.bin" \
    "$ISO_TREE/boot/isolinux/isolinux.bin"
do
    if [[ -f "$candidate" ]]; then
        ISOLINUX_BIN="$candidate"
        break
    fi
done

if [[ -z "$ISOLINUX_BIN" ]]; then
    die "Could not find isolinux.bin in Alpine boot media."
fi

log "isolinux.bin found:"
echo "$ISOLINUX_BIN"

# ------------------------------------------------------------
# Find boot directory relative path
# ------------------------------------------------------------

ISOLINUX_REL="${ISOLINUX_BIN#"$ISO_TREE"/}"

log "isolinux path:"
echo "$ISOLINUX_REL"

# ------------------------------------------------------------
# Find boot catalog
# ------------------------------------------------------------

BOOT_CAT_DIR="$(dirname "$ISOLINUX_REL")"
BOOT_CAT="$BOOT_CAT_DIR/boot.cat"

if [[ ! -e "$ISO_TREE/$BOOT_CAT" ]]; then
    touch "$ISO_TREE/$BOOT_CAT"
fi

# ------------------------------------------------------------
# Create ISO
# ------------------------------------------------------------

log "Creating ISO..."

rm -f "$OUTPUT/alpine.iso"

xorriso \
    -as mkisofs \
    -o "$OUTPUT/alpine.iso" \
    -V "LINUXLAB-GCC" \
    -b "$ISOLINUX_REL" \
    -c "$BOOT_CAT" \
    -no-emul-boot \
    -boot-load-size 4 \
    -boot-info-table \
    "$ISO_TREE"

if [[ ! -s "$OUTPUT/alpine.iso" ]]; then
    die "ISO creation failed."
fi

# ------------------------------------------------------------
# Final verification
# ------------------------------------------------------------

log "Checking generated ISO..."

file "$OUTPUT/alpine.iso"
ls -lh "$OUTPUT/alpine.iso"

log "============================================================"
log " LinuxLab Alpine GCC ISO BUILD COMPLETE"
log "============================================================"
log "ISO: $OUTPUT/alpine.iso"
```
