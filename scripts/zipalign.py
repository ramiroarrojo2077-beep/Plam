#!/usr/bin/env python3
# zipalign mínimo: copia el ZIP alineando los datos de las entradas sin comprimir
# (4 bytes; 4096 para bibliotecas .so), como exige Android para resources.arsc.
import sys
import zipfile

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w') as zout:
    for info in zin.infolist():
        data = zin.read(info.filename)
        zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        zi.create_system = info.create_system
        if info.compress_type == zipfile.ZIP_STORED:
            align = 4096 if info.filename.endswith('.so') else 4
            name = info.filename.encode('utf-8')
            base = zout.fp.tell() + 30 + len(name)
            pad = (-base) % align
            zi.extra = b'\0' * pad
        zout.writestr(zi, data)
