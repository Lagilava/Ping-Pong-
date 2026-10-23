const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const sandbox = {window: {devicePixelRatio: 2}, screen: {width:1920,height:1080},
    navigator: {hardwareConcurrency:8,deviceMemory:8},
    document: {documentElement: {classList: {add:noop}},body: {classList: {toggle:noop}}}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/core/globals.js'),'utf8')+'\nglobalThis.gov = PerfGovernor;',sandbox);
sandbox.window.game = {gameMode:'gravity'};
const gov = sandbox.gov;
gov._effective = {...gov.ULTRA}; gov.fxActive = false;
assert.equal(gov.renderScale,1,'Gravity does not allocate a supersampled gameplay surface');
assert.equal(gov.glowScale,0,'disabling bloom does not turn expensive Canvas shadows back on');
sandbox.window.game.gameMode = 'speed';
assert.equal(gov.renderScale,2,'other modes retain their quality setting');
vm.runInContext(fs.readFileSync(path.join(__dirname,'../game/js/core/game.js'),'utf8'),sandbox);
let quality = null;
sandbox.window.PostFX = sandbox.PostFX = {create:()=>({setQuality:q=>{quality=q;},setGrade:noop})};
const game = Object.create(sandbox.window.Game.prototype);
game.gameMode='gravity'; game.canvas={};
game.ensurePostFx();
assert.equal(quality,3,'Gravity disables the full-screen upload/bloom/composite pipeline');
console.log('Gravity resolution, shadow and post-processing budgets passed.');
