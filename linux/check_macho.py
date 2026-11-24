import struct, sys, os

p = sys.argv[1] if len(sys.argv) > 1 else "build/Payload/AntiAccel.app/AntiAccel"
print("文件:", p, os.path.getsize(p), "字节")
b = open(p, "rb").read(4096)
magic = struct.unpack("<I", b[:4])[0]
name = {0xFEEDFACF: "Mach-O 64 LE", 0xCAFEBABE: "FAT", 0xFEEDFACE: "Mach-O 32"}.get(magic, hex(magic))
cputype = struct.unpack("<I", b[4:8])[0]
print("magic:", name, " cputype:", hex(cputype))
ok = (magic == 0xFEEDFACF and cputype == 0x0100000C)
print("arm64 Mach-O 校验:", "通过" if ok else "失败")
sys.exit(0 if ok else 1)
