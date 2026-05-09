const fs = require('fs');
const paths = ['c:/Users/emi/Desktop/101/PingPong/game-enhancements.js', 'c:/Users/emi/Desktop/101/PingPong/game-modes.js'];
for (const path of paths) {
  const text = fs.readFileSync(path, 'utf8');
  try {
    new Function(text);
    console.log(path, 'OK');
  } catch (e) {
    console.error(path, 'ERROR', e.message);
    process.exit(1);
  }
}
