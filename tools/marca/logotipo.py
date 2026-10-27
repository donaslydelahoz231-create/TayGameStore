"""Genera el logotipo de TayGameStore en trazos vectoriales (src/web/public/brand).

«TayGameStore» se compone con Unbounded 700 (la fuente de la tienda, OFL 1.1, que permite usarla
en logotipos) y se convierte en trazos: el logotipo se ve igual en cualquier lugar, aunque la
fuente no esté instalada. Junto al texto va el emblema de Tay (brand/tay-mark.svg).

    python3 -m venv /tmp/venv-marca
    /tmp/venv-marca/bin/pip install fonttools brotli uharfbuzz
    /tmp/venv-marca/bin/python tools/marca/logotipo.py

Salida: brand/tay-logo.svg (texto claro, para fondos oscuros) y brand/tay-logo-tinta.svg (texto
oscuro, para fondos claros).
"""

import io
import re
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAIZ = Path(__file__).resolve().parents[2]
PUBLICO = RAIZ / 'src/web/public'
TEXTO = 'TayGameStore'
CORTE = 7  # «TayGame» | «Store»


def trazos():
    fuente = instancer.instantiateVariableFont(
        TTFont(PUBLICO / 'fonts/unbounded-latin.woff2'), {'wght': 700}
    )
    fuente.flavor = None
    datos = io.BytesIO()
    fuente.save(datos)
    buffer = hb.Buffer()
    buffer.add_str(TEXTO)
    buffer.guess_segment_properties()
    hb.shape(hb.Font(hb.Face(datos.getvalue())), buffer, {'kern': True, 'liga': True})
    glifos = fuente.getGlyphSet()
    orden = fuente.getGlyphOrder()
    x = 0
    partes = {'game': [], 'store': []}
    for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions):
        pluma = SVGPathPen(glifos)
        glifos[orden[info.codepoint]].draw(TransformPen(pluma, (1, 0, 0, -1, x + pos.x_offset, 0)))
        partes['game' if info.cluster < CORTE else 'store'].append(pluma.getCommands())
        x += pos.x_advance
    return partes, x, fuente['OS/2'].sCapHeight


def emblema():
    svg = (PUBLICO / 'brand/tay-mark.svg').read_text(encoding='utf-8')
    interior = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    interior = re.sub(r'<title>.*?</title>', '', interior)
    for ident in re.findall(r'id="([^"]+)"', interior):
        interior = interior.replace(f'id="{ident}"', f'id="e{ident}"').replace(
            f'url(#{ident})', f'url(#e{ident})'
        )
    return interior.strip()


def logotipo(tinta, partes, ancho, mayuscula):
    escala = 64 / mayuscula
    x0 = 160 + 26
    total = round(x0 + ancho * escala + 4)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!-- TayGameStore · «Tay» (2026-10-27). Diseño propio de la tienda. -->\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="160" '
        f'viewBox="0 0 {total} 160" role="img" aria-label="TayGameStore"><title>TayGameStore</title>'
        '<defs><linearGradient id="wmStore" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#22c3ff"/><stop offset=".55" stop-color="#6f7dff"/>'
        '<stop offset="1" stop-color="#a45bff"/></linearGradient></defs>'
        + emblema()
        + f'<g transform="translate({x0} 112) scale({escala:.5f})">'
        f'<path d="{" ".join(partes["game"])}" fill="{tinta}"/>'
        f'<path d="{" ".join(partes["store"])}" fill="url(#wmStore)"/></g></svg>\n'
    )


if __name__ == '__main__':
    partes, ancho, mayuscula = trazos()
    for nombre, tinta in (('tay-logo.svg', '#f3f5ff'), ('tay-logo-tinta.svg', '#141a4a')):
        (PUBLICO / 'brand' / nombre).write_text(
            logotipo(tinta, partes, ancho, mayuscula), encoding='utf-8'
        )
    print('Logotipo generado en src/web/public/brand')
