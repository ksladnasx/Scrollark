# -*- coding: utf-8 -*-
"""
字体子集化：把 fonts/*.ttf 裁剪到中文阅读所需字符集，大幅缩小 APK 体积。

保留字符集：
- ASCII / Latin-1 补充
- CJK 标点符号、全角/半角形式
- GB2312 全表 6763 个常用汉字（覆盖日常阅读 99%+）
- 生僻字由 Android 系统字体自动回落，不影响阅读

原始完整字体备份在 fonts-full/（已从 git 与 APK 排除）。
用法：python scripts/subset-fonts.py
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(ROOT, "fonts")
BACKUP_DIR = os.path.join(ROOT, "fonts-full")


def collect_unicodes():
    codes = set()

    # ASCII 可打印 + Latin-1 补充 + 常用西文标点
    codes.update(range(0x20, 0x7F))
    codes.update(range(0xA0, 0x100))
    codes.update(range(0x2013, 0x2027))   # 各类连字符/引号/省略号
    codes.update(range(0x20A0, 0x20C0))   # 货币符号

    # CJK 符号与标点、全角/半角形式
    codes.update(range(0x3000, 0x3040))
    codes.update(range(0xFF00, 0xFFEF))

    # 中文序号与常用符号
    codes.update(range(0x2460, 0x24FF))
    codes.update(range(0x25A0, 0x25CF))   # 常用几何图形（■ ● ▲ 等）

    # GB2312 全表（含 6763 汉字与符号区）
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                char = bytes([hi, lo]).decode("gb2312")
                code = ord(char)
                if code >= 0x20:
                    codes.add(code)
            except UnicodeDecodeError:
                continue

    return sorted(codes)


def write_unicodes_file(codes, path):
    # 把连续码点合并为区间，控制文件体积
    ranges = []
    start = prev = codes[0]
    for code in codes[1:]:
        if code == prev + 1:
            prev = code
            continue
        ranges.append((start, prev))
        start = prev = code
    ranges.append((start, prev))

    lines = [f"U+{start:04X}-{end:04X}" if start != end else f"U+{start:04X}" for start, end in ranges]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(",".join(lines))


def main():
    if not os.path.isdir(FONTS_DIR):
        print("fonts/ 目录不存在")
        sys.exit(1)

    os.makedirs(BACKUP_DIR, exist_ok=True)
    unicodes = collect_unicodes()
    unicodes_path = os.path.join(BACKUP_DIR, ".subset-unicodes.txt")
    write_unicodes_file(unicodes, unicodes_path)
    print(f"字符集共 {len(unicodes)} 个码位（{len(unicodes) and len(open(unicodes_path).read().split(','))} 个区间）")

    ttfs = [f for f in os.listdir(FONTS_DIR) if f.lower().endswith(".ttf")]
    if not ttfs:
        print("fonts/ 下没有 TTF 文件")
        sys.exit(1)

    for name in ttfs:
        src = os.path.join(FONTS_DIR, name)
        backup = os.path.join(BACKUP_DIR, name)
        if not os.path.exists(backup):
            shutil.copy2(src, backup)

        before = os.path.getsize(src)
        tmp = src + ".subset.ttf"
        result = subprocess.run([
            sys.executable, "-m", "fontTools.subset", src,
            f"--unicodes-file={unicodes_path}",
            f"--output-file={tmp}",
            "--layout-features=*",
            "--name-IDs=*",
            "--glyph-names",
            "--notdef-outline",
            "--recommended-glyphs",
        ])
        if result.returncode != 0:
            print(f"[跳过] {name}: 子集化失败，保留原文件")
            if os.path.exists(tmp):
                os.remove(tmp)
            continue

        after = os.path.getsize(tmp)
        if after >= before:
            print(f"[跳过] {name}: 子集未变小，保留原文件")
            os.remove(tmp)
            continue

        os.replace(tmp, src)
        print(f"[完成] {name}: {before / 1024 / 1024:.1f}MB -> {after / 1024 / 1024:.1f}MB")

    # woff2 是 RN 不支持的格式，一并清理
    for name in list(os.listdir(FONTS_DIR)):
        if name.lower().endswith((".woff2", ".woff")):
            backup = os.path.join(BACKUP_DIR, name)
            if not os.path.exists(backup):
                shutil.copy2(os.path.join(FONTS_DIR, name), backup)
            os.remove(os.path.join(FONTS_DIR, name))
            print(f"[清理] woff 文件已备份并移除: {name}")


if __name__ == "__main__":
    main()
