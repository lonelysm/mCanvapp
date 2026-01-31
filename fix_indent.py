# -*- coding: utf-8 -*-
# 과도한 들여쓰기(32, 34, 36...)를 4칸 기준으로 변환
# - 0칸 -> 0칸, 32 -> 4, 34 -> 8, 36 -> 12, 38 -> 16 ...
import os

d = r"c:\work\mCanvapp"
files = [
    "app.js", "canvas_renderer.js", "const.js", "editor_input_controller.js",
    "index.html", "shapes.js", "style.css", "util.js",
]

def to_four_space_indent(line):
    n = 0
    for c in line:
        if c == " ":
            n += 1
        else:
            break
    if n == 0:
        return line
    rest = line[n:]
    if n >= 32:
        level = (n - 32) // 2 + 1
        new_len = level * 4
    else:
        new_len = 4
    return " " * new_len + rest

for fn in files:
    path = os.path.join(d, fn)
    if not os.path.exists(path):
        print("SKIP", fn)
        continue
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    lines = content.split("\n")
    new_lines = [to_four_space_indent(line) for line in lines]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(new_lines))
    print("OK", fn)
