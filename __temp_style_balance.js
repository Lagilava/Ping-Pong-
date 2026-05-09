const fs = require('fs');
const text = fs.readFileSync('c:/Users/emi/Desktop/101/PingPong/ping_pong.html', 'utf8');
const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
let match, idx = 0;
while ((match = regex.exec(text)) !== null) {
  idx += 1;
  const style = match[1];
  let depth = 0, firstNeg = null;
  for (let i = 0; i < style.length; i += 1) {
    const ch = style[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0 && firstNeg === null) {
      firstNeg = i;
      break;
    }
  }
  console.log('style', idx, 'length', style.length, 'depth', depth, 'firstNeg', firstNeg);
}
