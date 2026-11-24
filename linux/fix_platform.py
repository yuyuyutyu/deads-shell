#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验/修正 Mach-O 的平台指令。

历史教训:
  0x8000001F 是 LC_REEXPORT_DYLIB,不是 LC_BUILD_VERSION。
  之前误用它注入,dyld 会把名字偏移 2 处的字节当库路径,读出来是空串,
  启动直接 halt:"Library not loaded: <空>"。真正的 LC_BUILD_VERSION 是 0x32。

本脚本做三件事:
  1. 已有 LC_BUILD_VERSION(0x32) -> 只清掉历史上误注入的 LC_REEXPORT_DYLIB;
  2. 有 LC_VERSION_MIN_IPHONEOS(0x25) -> 认为够用,同样只做清理;
  3. 两者都没有 -> 注入一个合法的 LC_BUILD_VERSION(platform=ios, minos, sdk)。
"""
import struct, sys

LC_REEXPORT_DYLIB = 0x8000001F
LC_BUILD_VERSION = 0x32
LC_VERSION_MIN_IPHONEOS = 0x25


def scan(data):
    ncmds, sizeofcmds = struct.unpack("<II", data[16:24])
    off, cmds = 32, []
    for _ in range(ncmds):
        cmd, size = struct.unpack("<II", data[off:off+8])
        cmds.append((off, cmd, size))
        off += size
    return ncmds, sizeofcmds, cmds


def strip_bogus(path):
    data = bytearray(open(path, "rb").read())
    ncmds, sizeofcmds, cmds = scan(data)
    last_off, last_cmd, last_size = cmds[-1]
    if last_cmd == LC_REEXPORT_DYLIB and last_size == 24:
        # 只可能是我们早期误注入的那条(真 reexport 不会出现在末尾且 cmdsize=24)
        struct.pack_into("<II", data, 16, ncmds - 1, sizeofcmds - last_size)
        open(path, "wb").write(bytes(data))
        print("已删除误注入的 LC_REEXPORT_DYLIB, ncmds=%d sizeofcmds=%d" % (ncmds - 1, sizeofcmds - last_size))
        return True
    return False


def inject_build_version(path, minos=(14, 0), sdk=(16, 5)):
    data = bytearray(open(path, "rb").read())
    ncmds, sizeofcmds, cmds = scan(data)
    if any(cmd == LC_BUILD_VERSION for _o, cmd, _s in cmds):
        print("已有 LC_BUILD_VERSION,无需注入")
        return False
    if any(cmd == LC_VERSION_MIN_IPHONEOS for _o, cmd, _s in cmds):
        print("已有 LC_VERSION_MIN_IPHONEOS,无需注入")
        return False

    pv = (minos[0] << 16) | (minos[1] << 8)
    sv = (sdk[0] << 16) | (sdk[1] << 8)
    payload = struct.pack("<IIIIII", LC_BUILD_VERSION, 24, 2, pv, sv, 0)

    # 头部剩余空间检查
    first_data = None
    for o, cmd, size in cmds:
        if cmd == 0x19:
            nsects = struct.unpack("<I", data[o+64:o+68])[0]
            so = o + 72
            for _ in range(nsects):
                sec_off = struct.unpack("<I", data[so+48:so+52])[0]
                if sec_off and (first_data is None or sec_off < first_data):
                    first_data = sec_off
                so += 80
            break
    insert_at = 32 + sizeofcmds
    if first_data and insert_at + 24 > first_data:
        raise SystemExit("头部空间不足,放弃注入")

    data[insert_at:insert_at+24] = payload
    struct.pack_into("<II", data, 16, ncmds + 1, sizeofcmds + 24)
    open(path, "wb").write(bytes(data))
    print("已注入合法 LC_BUILD_VERSION(0x32) platform=ios minos=%d.%d" % minos)
    return True


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "Payload/AntiAccel.app/AntiAccel"
    strip_bogus(target)
    inject_build_version(target)
    data = open(target, "rb").read()
    ncmds, sizeofcmds, cmds = scan(data)
    kinds = [hex(c) for _o, c, _s in cmds]
    print("最终: ncmds=%d sizeofcmds=%d 含BUILD_VERSION=%s 含REEXPORT=%s"
          % (ncmds, sizeofcmds, hex(LC_BUILD_VERSION) in kinds, hex(LC_REEXPORT_DYLIB) in kinds))
