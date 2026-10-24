import zipfile,struct,sys,json,hashlib
from pathlib import Path
p=Path(sys.argv[1])
with zipfile.ZipFile(p) as z:
 assert z.testzip() is None
 names=z.namelist()
 assert 'assets/project.binary' in names
 imported=[n for n in names if n.startswith('assets/.godot/imported/')]
 assert len(imported)>200, f'Missing Godot imports: {len(imported)}'
 assert 'assets/.godot/extension_list.cfg' in names
 for n in ['LICENSE','LICENSE.exceptions','NOTICE']:
  assert 'assets/licenses/openpigeon/'+n in names
 assert not any(b'Lcom/openbubbles/openpigeon/crazy8/' in z.read(n) for n in names if n.endswith('.dex'))
 libs={}
 for n in names:
  if n.startswith('lib/') and n.endswith('.so'):
   assert n.startswith('lib/arm64-v8a/')
   b=z.read(n); assert b[:6]==b'\x7fELF\x02\x01'
   off=struct.unpack_from('<Q',b,32)[0]; size,count=struct.unpack_from('<HH',b,54)
   align=[struct.unpack_from('<IIQQQQQQ',b,off+i*size)[-1] for i in range(count) if struct.unpack_from('<I',b,off+i*size)[0]==1]
   assert align and min(align)>=16384,(n,align)
   libs[n]={'loadAlignments':align,'sha256':hashlib.sha256(b).hexdigest()}
 for key in ['libgodot_android.so','libopenbubblesextension.so','libgodot-box2d.android.template_release.arm64.so']:
  assert any(n.endswith('/'+key) for n in libs), key
 print(json.dumps({'apk':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'godotImportedAssets':len(imported),'nativeLibraries':libs},indent=2))
