// Landscape animated proof for Classic/Zombie; uses the real scene clocks and
// joint updates. Optional argument 3 supplies pre-change renderer JS files.
const fs=require('node:fs'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const {session}=require('./check-background-scenes');
(async()=>{
    const mode=process.argv[2]||'classic',out=path.resolve(process.argv[3]||'/tmp/'+mode+'-motion');
    if(!['classic','zombie'].includes(mode))throw new Error('Choose classic or zombie');
    const old=process.argv[4],w=640,h=360,states=[];fs.mkdirSync(out,{recursive:true});
    for(const before of old?[true,false]:[false]){
        const overrides=before?{'classic-art':path.join(old,'classic-art.js'),'background-renderer':path.join(old,'background-renderer.js')}:null;
        const env=session(w,h,overrides);env.seed(73);env.game.gameMode=mode;env.game.scores={player:0,ai:0};
        const c=createCanvas(w,h),ctx=c.getContext('2d'),r=new env.sandbox.Renderer(ctx,w,h);
        r.setMode(mode);r._renderModeBackground(ctx,w,h);await env.ready();states.push({env,c,ctx,r,before});
    }
    const c=createCanvas(w*states.length,h+30),ctx=c.getContext('2d'),cost=[];
    for(let f=0;f<120;f++){
        const t=f/20;ctx.fillStyle='#080d18';ctx.fillRect(0,0,c.width,c.height);
        states.forEach((s,i)=>{
            s.env.game.rallyCount=Math.floor(t/1.1);s.env.game.scores.player=t>=3.2?1:0;
            s.r.update(1/20);const start=performance.now();s.ctx.clearRect(0,0,w,h);s.r._renderModeBackground(s.ctx,w,h);
            if(!s.before)cost.push(performance.now()-start);ctx.drawImage(s.c,i*w,30);
            ctx.fillStyle='#eaf2ff';ctx.font='bold 16px sans-serif';ctx.fillText((s.before?'BEFORE':'AFTER')+' · '+mode.toUpperCase(),i*w+12,22);
        });
        fs.writeFileSync(path.join(out,String(f).padStart(3,'0')+'.png'),c.toBuffer('image/png'));
    }
    cost.sort((a,b)=>a-b);const result={mode,frames:120,fps:20,medianCpuCanvasMs:cost[60],p95CpuCanvasMs:cost[114]};
    fs.writeFileSync(path.join(out,'motion-check.json'),JSON.stringify(result,null,2));console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1;});
