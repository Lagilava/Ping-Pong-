from pathlib import Path
path = Path('c:/Users/emi/Desktop/101/PingPong/ping_pong.html')
text = path.read_text(encoding='utf-8', errors='replace')
lines = text.splitlines()
start = 31949
end = 33609
sub = '\n'.join(lines[start-1:end])
d = 0
neg = None
for i, ch in enumerate(sub, 1):
    if ch == '{':
        d += 1
    elif ch == '}':
        d -= 1
    if d < 0 and neg is None:
        neg = (i, sub[:i].count('\n') + start)
        break
print('final depth', d)
print('negative', neg)
print('script lines', end - start + 1)