#!/bin/sh

set -e

tmp="$1"

mkdir -p "$tmp/etc/profile.d"
if [ -f "$tmp/etc/inittab" ]; then
    sed -i 's@^#ttyS0::respawn:/sbin/getty.*@ttyS0::respawn:/bin/sh -l@' "$tmp/etc/inittab"
fi
mkdir -p "$tmp/usr/local/bin"
mkdir -p "$tmp/root/examples"

cat > "$tmp/etc/profile.d/linuxlab.sh" <<'EOF'
export PATH="/usr/local/bin:/usr/bin:/bin"

# Guest-side hard limits. These are inherited by interactive commands and their
# descendants. The v86 host boundary remains authoritative for VM memory and
# lifecycle limits; these limits additionally bound CPU time, address space and
# process creation inside the guest shell.
LINUXLAB_MAX_PROCESSES=128
LINUXLAB_CPU_SECONDS=30
LINUXLAB_MEMORY_KIB=1048576

# Set both soft and hard limits. Failure is non-fatal on kernels/builds where a
# particular limit is unavailable; host-side VM limits still apply.
ulimit -S -H -u "$LINUXLAB_MAX_PROCESSES" 2>/dev/null || true
ulimit -S -H -t "$LINUXLAB_CPU_SECONDS" 2>/dev/null || true
ulimit -S -H -v "$LINUXLAB_MEMORY_KIB" 2>/dev/null || true
export LINUXLAB_MAX_PROCESSES LINUXLAB_CPU_SECONDS LINUXLAB_MEMORY_KIB

alias ll='ls -la'

echo
echo "============================================================"
echo " LinuxLab Engine B - Alpine GCC"
echo "============================================================"

echo

echo "[Resource policy] processes <= $LINUXLAB_MAX_PROCESSES"
echo "[Resource policy] CPU time <= ${LINUXLAB_CPU_SECONDS}s per process"
echo "[Resource policy] virtual memory <= ${LINUXLAB_MEMORY_KIB} KiB per process"

echo

if command -v gcc >/dev/null 2>&1; then
    echo "[GCC] GCC READY"
    gcc --version | head -n 1
else
    echo "[GCC] GCC NOT FOUND"
fi

echo
EOF

cat > "$tmp/usr/local/bin/linuxlab-resource-selftest" <<'EOF'
#!/bin/sh
set -eu

fail=0

check_limit() {
    name="$1"
    actual="$2"
    expected="$3"
    if [ "$actual" != "$expected" ]; then
        echo "[FAIL] $name: expected $expected, got $actual"
        fail=1
    else
        echo "[OK] $name: $actual"
    fi
}

check_limit processes "$(ulimit -Hu 2>/dev/null || echo unavailable)" "128"
check_limit cpu-seconds "$(ulimit -Ht 2>/dev/null || echo unavailable)" "30"
check_limit memory-kib "$(ulimit -Hv 2>/dev/null || echo unavailable)" "1048576"

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "[OK] guest resource policy is active"
EOF
chmod +x "$tmp/usr/local/bin/linuxlab-resource-selftest"

cat > "$tmp/usr/local/bin/linuxlab-gcc-test" <<'EOF'
#!/bin/sh

echo "============================================================"
echo " LinuxLab GCC Diagnostic"
echo "============================================================"

echo

if command -v gcc >/dev/null 2>&1; then
    echo "[OK] gcc"
    gcc --version
else
    echo "[FAIL] gcc"
    exit 1
fi

echo

if command -v g++ >/dev/null 2>&1; then
    echo "[OK] g++"
    g++ --version
else
    echo "[FAIL] g++"
fi

echo

if command -v make >/dev/null 2>&1; then
    echo "[OK] make"
    make --version | head -n 1
else
    echo "[FAIL] make"
fi

echo

if command -v ld >/dev/null 2>&1; then
    echo "[OK] binutils"
    ld --version | head -n 1
else
    echo "[FAIL] binutils"
fi

echo
echo "LinuxLab compiler environment is ready."
EOF

chmod +x "$tmp/usr/local/bin/linuxlab-gcc-test"

cat > "$tmp/root/examples/hello.c" <<'EOF'
#include <stdio.h>

int main(void)
{
    printf("Hello from LinuxLab GCC!\n");
    return 0;
}
EOF

cat > "$tmp/root/examples/Makefile" <<'EOF'
CC=gcc
CFLAGS=-Wall -Wextra -O2

hello: hello.c
	$(CC) $(CFLAGS) hello.c -o hello

clean:
	rm -f hello
EOF

mkdir -p "$tmp/etc/apk"

cat > "$tmp/etc/apk/world" <<'EOF'
alpine-base
build-base
gcc
g++
binutils
make
libc-dev
musl-dev
fortify-headers
linux-headers
patch
file
pkgconf
bash
busybox-extras
nano
vim
git
curl
wget
ca-certificates
tar
gzip
bzip2
xz
zip
unzip
cmake
EOF