import re, glob, os
os.chdir(r'E:\Vibe Coding\Zcode\exa-gate')

used = set()
files = ['src/admin-ui/index.html'] + glob.glob('src/admin-ui/**/*.js', recursive=True)
for f in files:
    s = open(f, encoding='utf-8').read()
    # class="static classes"
    for m in re.finditer(r'class="([^"$<>]+)"', s):
        for c in m.group(1).split():
            if re.match(r'^[a-z][a-zA-Z0-9-]*$', c):
                used.add(c)
    # JS string templates: class="..." inside quotes with concatenation
    for m in re.finditer(r"class=\"((?:[^'\"\\]|\\.)*)\"", s):
        for c in m.group(1).split():
            c2 = c.split("'")[0]
            if re.match(r'^[a-z][a-zA-Z0-9-]*$', c2):
                used.add(c2)

defined = set()
for f in glob.glob('src/admin-ui/css/*.css'):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\.([a-zA-Z][a-zA-Z0-9-]*)', s):
        defined.add(m.group(1))

missing = sorted(c for c in used if c not in defined)
print('used:', len(used), 'defined:', len(defined), 'missing:', len(missing))
for c in missing:
    print(c)
