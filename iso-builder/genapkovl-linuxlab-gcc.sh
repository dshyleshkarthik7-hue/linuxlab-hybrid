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

alias ll='ls -la'

echo
echo "============================================================"
echo " LinuxLab Engine B - Alpine GCC"
echo "============================================================"

if command -v gcc >/dev/null 2>&1; then
    echo "[GCC] GCC READY"
    gcc --version | head -n 1
else
    echo "[GCC] GCC NOT FOUND"
fi

echo
EOF

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