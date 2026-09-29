#!/usr/bin/env sh
# Inline style.css and main.js into a single-file preview at dist/preview.html.
set -e
cd "$(dirname "$0")"
mkdir -p dist
python3 - <<'PY'
import re
html = open('index.html').read()
head = html.split('<!--BODY-START-->')[0]
body = html.split('<!--BODY-START-->')[1].split('<!--BODY-END-->')[0]
fonts = re.search(r'<link href="https://fonts[^>]+>', head).group(0)
body = body.replace('<script src="main.js"></script>', '<script>\n' + open('main.js').read() + '\n</script>')
out = '<title>Hyperpad</title>\n' + fonts + '\n<style>\n' + open('style.css').read() + '\n</style>\n' + body
open('dist/preview.html', 'w').write(out)
PY
echo "wrote dist/preview.html"
