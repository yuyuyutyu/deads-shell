# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw
import os

S = 1024
img = Image.new("RGBA", (S, S), (11, 11, 15, 255))
d = ImageDraw.Draw(img)
# 圆角背景渐变感：画一个略亮的圆
d.ellipse([S*0.10, S*0.10, S*0.90, S*0.90], fill=(22, 22, 30, 255))
# 禁止符：外环
w = int(S*0.055)
d.ellipse([S*0.24, S*0.24, S*0.76, S*0.76], outline=(240, 60, 80, 255), width=w)
# 斜杠
d.line([S*0.30, S*0.70, S*0.70, S*0.30], fill=(240, 60, 80, 255), width=w)
# 中间的 AD 用小方块代替（避免字体依赖）
d.rectangle([S*0.42, S*0.44, S*0.58, S*0.56], fill=(230, 230, 235, 255))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(out, exist_ok=True)
for name, size in [("AppIcon60x60@2x.png", 120), ("AppIcon60x60@3x.png", 180),
                   ("AppIcon76x76@2x~ipad.png", 152), ("AppIcon1024.png", 1024)]:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, name))
    print("wrote", name, size)
