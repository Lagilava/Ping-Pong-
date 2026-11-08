"""Make Tour motion layers from the original art; no generated imagery."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / 'game/assets/images/tour'
# Rectangles are in the 960x540 reference view; final values scale with source.
SPECS = {
 'hall': [(86,87,128,166,145),(247,88,292,166,145),(449,72,510,174,148),(669,87,716,166,145),(831,87,877,166,145)],
 'mirage': [(223,21,272,116,0),(762,55,813,139,0),(294,125,316,163,0),(644,99,661,130,0)]
}
for name, shapes in SPECS.items():
    original = Image.open(ROOT / (name + '.webp')).convert('RGB')
    w, h = original.size
    sx, sy = w / 960, h / 540
    base = original.copy()
    atlas_w = max(round((x2-x1+12)*sx) for x1,y1,x2,y2,_ in shapes)
    atlas_h = sum(round((y2-y1+12)*sy) for x1,y1,x2,y2,_ in shapes)
    atlas = Image.new('RGBA', (atlas_w, atlas_h))
    entries = []
    top = 0
    for x1,y1,x2,y2,tip in shapes:
        ax, ay, bx, by = (round(x1*sx), round(y1*sy), round(x2*sx), round(y2*sy))
        px, py = round(6*sx), round(6*sy)
        x0, y0, x3, y3 = ax-px, ay-py, bx+px, by+py
        mask = Image.new('L', (w,h)); d = ImageDraw.Draw(mask)
        if tip:
            ty=round(tip*sy)
            d.polygon([(ax,ay),(bx,ay),(bx,ty),((ax+bx)//2,by),(ax,ty)],fill=255)
        else:
            # Cover the irregular rock silhouette including its sharp corners;
            # an ellipse leaves dark slivers behind when the layer moves.
            polygons = {
                (223,21): [(242,21),(259,22),(271,45),(270,76),(257,116),(239,102),(223,69),(225,40)],
                (762,55): [(762,85),(789,61),(805,55),(813,75),(805,112),(782,139),(764,120)],
                (294,125): [(301,125),(312,128),(316,143),(309,163),(299,157),(294,142)],
                (644,99): [(650,99),(657,101),(661,113),(653,130),(645,124),(644,110)]
            }
            d.polygon([(round(x*sx),round(y*sy)) for x,y in polygons[(x1,y1)]], fill=255)
            mask = mask.filter(ImageFilter.MaxFilter(9))
        mask=mask.filter(ImageFilter.GaussianBlur(max(1, 1.1*sx)))
        # Replace only the moving shape, using adjacent scene pixels at the same
        # height. The original object is preserved on its own transparent layer.
        offset = round((x2-x1+14)*sx)
        if name == 'mirage' and x1 == 762:
            offset = -offset  # sample open sky, not the stone arch to the right
        donor = Image.new('RGB', (w,h)); donor.paste(original.crop((x0+offset,y0,x3+offset,y3)), (x0,y0))
        base.paste(donor,(0,0),mask)
        sprite=original.crop((x0,y0,x3,y3)).convert('RGBA')
        sprite.putalpha(mask.crop((x0,y0,x3,y3)))
        atlas.alpha_composite(sprite,(0,top))
        entries.append({'x': x0/w,'y': y0/h,'w': (x3-x0)/w,'h': (y3-y0)/h,
                        'atlasY': top, 'atlasW': x3-x0, 'atlasH': y3-y0})
        top += y3-y0
    base.save(ROOT / (name + '-motion-base.webp'), 'WEBP',quality=85,method=6)
    atlas.save(ROOT / (name + '-motion-parts.webp'), 'WEBP',lossless=True,method=6)
    (ROOT / (name + '-motion.json')).write_text(json.dumps(entries,indent=2)+'\n',encoding='utf-8')
    print(name, original.size, atlas.size)
