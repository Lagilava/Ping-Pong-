const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({window: {game: {
    gameMode: 'customise', customSettings: {}, getCustomBackgroundToneFilter: () => 'brightness(0.8)'
}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,
    '../game/js/render/background-renderer.js'), 'utf8') + '\nglobalThis.Renderer = BackgroundRenderer;', context);
const r = Object.create(context.Renderer.prototype), events = [];
r.width = 640; r.height = 360;
r.ctx = {save() {}, restore() {}, drawImage() { events.push('toned copy'); }};
r._customToneBaseCanvas = {};
r._customToneBaseCtx = {save() {}, restore() {}, setTransform() {}, clearRect() {}};
r._ensureCustomToneBuffers = () => {};
r._renderCachedBackground = () => false;
r._renderModeBackground = () => events.push('scenery');
r.renderEnhancedLighting = () => events.push('lighting');
r.render();
assert.deepEqual(events, ['scenery', 'lighting', 'toned copy'],
    'Custom matches must grade the complete lit scene just like previews, without an extra ungraded light pass');
console.log('Custom match lighting and tone compositing order passed.');
