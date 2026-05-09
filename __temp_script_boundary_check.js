const fs = require('fs');
const text = fs.readFileSync('c:/Users/emi/Desktop/101/PingPong/ping_pong.html', 'utf8');
let count = 0;
let i = 0;
const indices = [];
while ((i = text.indexOf('</script>', i)) !== -1) {
  count += 1;
  indices.push(i);
  i += 9;
}
console.log('closing script tags', count);
for (let j = 0; j < Math.min(indices.length, 20); j += 1) {
  const idx = indices[j];
  console.log('occurrence', j+1, 'pos', idx, 'context', text.slice(Math.max(0, idx-40), idx+20).replace(/\n/g, '\\n'));
}
