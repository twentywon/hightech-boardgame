#!/usr/bin/env python3
"""Import project and parse every GDScript; fail even if Godot logs errors but exits 0."""
import os,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve()
if not (root/'project.godot').is_file():
    sys.exit('Missing project.godot: '+str(root))
godot=os.environ.get('GODOT_BIN', 'godot')
def run(args):
    p=subprocess.run([godot,'--headless','--path',str(root),*args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
    print(p.stdout,end='')
    if p.returncode or any(s in p.stdout for s in ['SCRIPT ERROR:', 'Parse Error:', '\nERROR:']):
        sys.exit(p.returncode or 1)
run(['--editor','--import'])
scripts=[p for p in root.rglob('*.gd') if not any(x in p.relative_to(root).parts for x in ['.godot','.git'])]
for script in sorted(scripts):
    run(['--check-only','--script','res://'+script.relative_to(root).as_posix()])
print(f'PARSE_OK: {len(scripts)} GDScript files')
