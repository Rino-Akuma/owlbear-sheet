# Генерує js/glyphs.js — контури літер (DejaVu Sans Bold, вільна ліцензія) для підписів станів на токені,
# бо текстові елементи Owlbear у деяких версіях не малюються.
import re, json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
src = open('js/conditions.js', encoding='utf-8').read()
chars = set('+0123456789 ще')
for m in re.finditer(r"'([^']+)'", src.split('COND_COLORS')[0]): chars |= set(m.group(1).replace('’', "'"))
chars |= set('’')
font = TTFont('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf')
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
k = 1000 / upm
class P(BasePen):
    def __init__(s, g): super().__init__(g); s.c = []
    def _moveTo(s, p): s.c.append([0, round(p[0]*k), round(-p[1]*k)])
    def _lineTo(s, p): s.c.append([1, round(p[0]*k), round(-p[1]*k)])
    def _qCurveToOne(s, a, b): s.c.append([2, round(a[0]*k), round(-a[1]*k), round(b[0]*k), round(-b[1]*k)])
    def _curveToOne(s, a, b, c): s.c.append([4] + [round(v) for p in (a, b, c) for v in (p[0]*k, -p[1]*k)])
    def _closePath(s): s.c.append([5])
out = {}
for ch in sorted(chars):
    gn = cmap.get(ord(ch))
    if not gn: print('нема', ch, file=sys.stderr); continue
    p = P(gs); gs[gn].draw(p)
    out[ch] = [round(gs[gn].width * k), [v for c in p.c for v in c]]
js = ('// Згенеровано tools/build-glyphs.py (DejaVu Sans Condensed Bold). Контури в 1000 од./em, y вниз від базової лінії.\n'
      'const G = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
      '''/** Команди Path для рядка в координатах 1000/em (початок — ліва базова точка) і ширина. */
export function textCommands(str) {
  const cmds = []; let x = 0;
  for (const ch of String(str).replace(/'/g, '’')) {
    const g = G[ch] || G[' '];
    const a = g[1]; let i = 0;
    while (i < a.length) {
      const c = a[i]; const n = c === 0 || c === 1 ? 2 : c === 2 ? 4 : c === 3 ? 6 : 0;
      const row = [c];
      for (let j = 0; j < n; j += 2) row.push(a[i + 1 + j] + x, a[i + 2 + j]);
      cmds.push(row); i += 1 + n;
    }
    x += g[0];
  }
  return { cmds, width: x };
}
''')
open('js/glyphs.js', 'w', encoding='utf-8').write(js)
print(len(out), len(js))
