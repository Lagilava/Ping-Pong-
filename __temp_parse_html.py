from html.parser import HTMLParser
from pathlib import Path

html = Path('c:/Users/emi/Desktop/101/PingPong/ping_pong.html').read_text(encoding='utf-8', errors='replace')
script_count = 0
errors = []

class ScriptParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_script = False
        self.script_text = ''
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'script':
            self.in_script = True
            self.script_text = ''
    def handle_endtag(self, tag):
        if tag.lower() == 'script' and self.in_script:
            self.scripts.append(self.script_text)
            self.in_script = False
    def handle_data(self, data):
        if self.in_script:
            self.script_text += data

parser = ScriptParser()
parser.feed(html)
print('script tags', len(parser.scripts))
for idx, script in enumerate(parser.scripts, start=1):
    if script.strip() == '':
        print('script', idx, 'empty')
    else:
        try:
            compile(script, f'<script {idx}>', 'exec')
        except Exception as e:
            errors.append((idx, str(e)))
            print('script', idx, 'ERROR', e)
            break

if not errors:
    print('all script content compiled OK')
