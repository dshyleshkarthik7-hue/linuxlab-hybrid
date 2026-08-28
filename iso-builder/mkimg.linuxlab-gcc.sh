#!/bin/sh

profile_linuxlab_gcc() {
    profile_standard

    profile_abbrev="linuxlab"
    title="LinuxLab GCC"
    desc="Alpine Linux systems programming environment with GCC and development tools."

    arch="x86"
    kernel_flavors="lts"

    apks="$apks
        alpine-base
        openrc
        build-base
        gcc
        g++
        binutils
        make
        musl-dev
        libc-dev
        linux-headers
        fortify-headers
        patch
        file
        pkgconf
        bash
        busybox-extras
        coreutils
        findutils
        grep
        sed
        gawk
        less
        nano
        vim
        git
        curl
        wget
        ca-certificates
        cmake
        ninja
        python3
        strace
        lsof
        procps
        util-linux
        pciutils
        usbutils
    "

    kernel_cmdline="console=ttyS0,115200 console=tty0"
    syslinux_serial="0 115200"
    syslinux_timeout="5"
    syslinux_prompt="1"

    apkovl="$PWD/scripts/genapkovl-linuxlab-gcc.sh"
}
