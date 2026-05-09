const fs = require('fs');
const path = 'c:/Users/emi/Desktop/101/PingPong/ping_pong.html';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);
const start = 31949;
const end = 33609;
const script = lines.slice(start - 1, end).join('\n');
try {
  new Function(script);
  console.log('parsed OK');
} catch (e) {
  console.error('ERROR', e.message);
  if (e.loc) console.error('loc', e.loc);
}
