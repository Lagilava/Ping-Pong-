const fs = require('fs');
const text = fs.readFileSync('c:/Users/emi/Desktop/101/PingPong/ping_pong.html', 'utf8');
const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
let match;
let idx = 0;
while ((match = regex.exec(text)) !== null) {
  idx += 1;
  if (idx === 1) {
    const s = match[1];
    const stack = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (c === '{') stack.push(i);
      else if (c === '}') stack.pop();
    }
    console.log('unmatched count', stack.length);
    if (stack.length > 0) {
      const pos = stack[stack.length - 1];
      console.log('last unmatched pos', pos);
      const before = s.slice(Math.max(0, pos - 200), pos).replace(/\n/g, '\\n');
      const after = s.slice(pos, Math.min(s.length, pos + 400)).replace(/\n/g, '\\n');
      console.log('before', before);
      console.log('after', after);
    }
  }
}
