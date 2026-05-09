const fs = require('fs');
const text = fs.readFileSync('c:/Users/emi/Desktop/101/PingPong/ping_pong.html', 'utf8');
const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let idx = 0;
while ((match = regex.exec(text)) !== null) {
  idx += 1;
  const script = match[1];
  try {
    new Function(script);
  } catch (e) {
    console.error('SCRIPT', idx, 'ERROR', e.message);
    console.error('SCRIPT_SNIPPET_START', script.slice(0, 240).replace(/\n/g, '\\n'));
    process.exit(1);
  }
}
console.log('ALL SCRIPTS PARSED OK', idx);
