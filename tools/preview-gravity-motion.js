// Render a five-second landscape motion proof using the real decoded assets.
// Requires @napi-rs/canvas. Optional argument 2 is an older gravity-art.js for
// a side-by-side comparison. Encode the numbered PNGs using ffmpeg at 20 fps.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const {session}=require('./check-background-scenes');
(async()=>{
    const output=path.resolve(process.argv[2]||'/tmp/gravity-motion');fs.mkdirSync(output,{recursive:true});
    const old=process.argv[3],w=640,h=360,states=[];
    const wells=[{x:350,y:170,radius:55},{x:465,y:105,radius:55},{x:480,y:245,radius:55}];
    for(const source of old?[path.resolve(old),null]:[null]){
        const env=session(w,h,source);env.game.gameMode='gravity';env.game.gravityInteraction={activeWells:wells};
        const c=createCanvas(w,h),ctx=c.getContext('2d'),r=new env.sandbox.Renderer(ctx,w,h);
        r.setMode('gravity');r._renderModeBackground(ctx,w,h);
        env.sandbox.window.GravityArt.drawWell(ctx,350,170,55,0);await env.ready();if(!source){const status=env.sandbox.window.GravityArt.status();assert(status.surfaceReady&&status.wellFlowReady,'decoded material paths must be active');}states.push({env,c,ctx});
    }
    const c=createCanvas(w*states.length,h+30),ctx=c.getContext('2d'),cost=[];
    for(let frame=0;frame<100;frame++){
        const time=frame/20;ctx.fillStyle='#080d18';ctx.fillRect(0,0,c.width,c.height);
        states.forEach((state,index)=>{
            const art=state.env.sandbox.window.GravityArt,start=performance.now();
            state.ctx.clearRect(0,0,w,h);art.drawBackground(state.ctx,w,h,time,state.env.game.gravityInteraction);
            wells.forEach((well,j)=>art.drawWell(state.ctx,well.x,well.y,well.radius,time,.25,j%2?-1:1,j*1.7));
            if(index===states.length-1)cost.push(performance.now()-start);
            ctx.drawImage(state.c,index*w,30);ctx.fillStyle='#eaf2ff';ctx.font='bold 16px sans-serif';
            ctx.fillText(old&&index===0?'BEFORE · rigid images':'AFTER · moving material, fixed centres',index*w+12,22);
        });
        fs.writeFileSync(path.join(output,String(frame).padStart(3,'0')+'.png'),c.toBuffer('image/png'));
    }
    cost.sort((a,b)=>a-b);const result={frames:100,fps:20,medianCpuCanvasMs:cost[50],p95CpuCanvasMs:cost[95]};
    fs.writeFileSync(path.join(output,'motion-check.json'),JSON.stringify(result,null,2));console.log(result);
})().catch(error=>{console.error(error);process.exitCode=1;});
