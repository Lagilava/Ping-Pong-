const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = {Math, window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game/js/ui/match-intro.js'), 'utf8') + '\nthis.Intro = Intro;', context);
const sizes = [[320,568],[568,320],[800,600],[1280,720],[1920,1080],[2560,1080],[3440,1440],[3840,2160],[5120,1440],[220,180]];
for (const mode of ['classic','zombie','gravity','speed','obstacle','customise']) {
    for (const [w,h] of sizes) for (const dpr of [0.75,1,1.5,2,3]) {
        const intro = Object.create(context.Intro.prototype);
        intro.game = {width:w,height:h,gameMode:mode};
        intro.canvas = {width:w*dpr,height:h*dpr};
        let fontFactor = 0.8;
        intro.ctx = {measureText(text) {return {width:text.length * parseFloat(this.font.match(/([\d.]+)px/)[1]) * fontFactor};}};
        intro.duration = 8.8;
        intro.initTextConfigs(); intro.createAnimatedTexts();
        const check = () => {
            const fit = intro.getTextFit();
            assert.equal(intro.viewWidth,w);
            assert.equal(intro.viewHeight,h);
            assert.ok(Number.isFinite(fit) && fit>0);
            for (const letter of intro.texts) for (const t of [0.05,0.2,0.45,0.7,1]) {
                intro.updateTextAnimation(letter,t,letter.entrance);
                const x = w/2 + letter.offsetX*fit, y = h*letter.y + letter.dropY*fit;
                const glyph = intro.measureTextWidth(letter.char,letter.fontSize)*fit*letter.scale;
                const halfHeight = letter.fontSize*fit*letter.scale*0.7;
                assert.ok(x >= w*0.03 && x+glyph <= w*0.97, mode+' glyph fits width');
                assert.ok(y-halfHeight >= 0 && y+halfHeight <= h, mode+' glyph fits height');
            }
        };
        check();
        // Late web-font load must reflow without losing animation state.
        intro.texts[0].alpha = 0.73;
        fontFactor = 1.1; intro.refreshTextMetrics();
        assert.equal(intro.texts[0].alpha,0.73);
        check();
        // A resize mid-intro uses the new logical dimensions immediately.
        intro.game.width=h; intro.game.height=w;
        const fit = intro.getTextFit();
        assert.ok(intro.textBlocks.every(b=>b.width*fit <= h*0.82+0.001));
    }
}
console.log('All six intro modes fit 10 viewport sizes, five DPRs, late fonts and resize.');
