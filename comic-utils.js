// Chapter 1 Visual Utils - Ported for Ch2 Quality
// Deterministic PRNG
function dRand(seed){return(Math.sin(seed*127.1)*43758.5453)%1;}
function dRand2(a,b){return(Math.sin(a*127.1+b*311.7)*43758.5453)%1;}

// Lightning (recursive branching)
function buildBoltSegments(x1,y1,x2,y2,displacement,depth,seed,segments){
  if(depth<=0||displacement<1){segments.push([x1,y1,x2,y2,depth]);return;}
  const mx=(x1+x2)/2,my=(y1+y2)/2;
  const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)||1;
  const perpX=-dy/len,perpY=dx/len;
  const offset=(dRand2(seed,depth)*2-1)*displacement;
  const nx=mx+perpX*offset,ny=my+perpY*offset;
  buildBoltSegments(x1,y1,nx,ny,displacement*0.55,depth-1,seed+7,segments);
  buildBoltSegments(nx,ny,x2,y2,displacement*0.55,depth-1,seed+13,segments);
  if(depth>=3&&Math.abs(dRand2(seed+3,depth))>0.62){
    const bAngle=Math.atan2(dy,dx)+(dRand2(seed+5,depth)*0.8-0.4);
    const bLen=len*0.38;buildBoltSegments(nx,ny,nx+Math.cos(bAngle)*bLen,ny+Math.sin(bAngle)*bLen,displacement*0.35,depth-2,seed+31,segments);
  }
}
function drawLightningBolt(ctx,x1,y1,x2,y2,seed,alpha,color='255,255,255'){const segments=[];const dist=Math.sqrt((x2-x1)**2+(y2-y1)**2);buildBoltSegments(x1,y1,x2,y2,dist*0.22,6,seed,segments);ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';for(const[ax,ay,bx,by,d]of segments){const baseAlpha=alpha*(0.12+(d/6)*0.08);ctx.strokeStyle=`rgba(${color},${baseAlpha.toFixed(3)})`;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();}for(const[ax,ay,bx,by,d]of segments){ctx.strokeStyle=`rgba(255,255,255,${(alpha*0.9).toFixed(3)})`;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();}ctx.restore();}

// Sea (layered, dynamic)
function drawSea(ctx,W,H,horizonY,t,flash,heroX,heroY,aiX,aiY){const seaGrad=ctx.createLinearGradient(0,horizonY,0,H);seaGrad.addColorStop(0,'#0d1c2e');seaGrad.addColorStop(0.3,'#091422');seaGrad.addColorStop(0.7,'#050c16');seaGrad.addColorStop(1,'#030810');ctx.fillStyle=seaGrad;ctx.fillRect(0,horizonY,W,H-horizonY);const mist=ctx.createLinearGradient(0,horizonY-10,0,horizonY+40);mist.addColorStop(0,'rgba(180,215,240,0.22)');mist.addColorStop(0.6,'rgba(100,160,200,0.06)');mist.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=mist;ctx.fillRect(0,horizonY-10,W,52);ctx.save();for(let row=0;row<14;row++){const yPos=horizonY+10+row*(H-horizonY)*0.065;const perspective=row/13;const waveAmp=1.5+perspective*4;const waveFreq=0.018-perspective*0.006;const alpha=(0.04+perspective*0.12+flash*0.06);ctx.strokeStyle=`rgba(160,210,250,${alpha.toFixed(3)})`;ctx.lineWidth=0.8+perspective*1.4;ctx.beginPath();for(let x=0;x<=W;x+=3){const wave=Math.sin(x*waveFreq+t*(1.4+perspective*0.6)+row*0.9)*waveAmp;if(x===0)ctx.moveTo(x,yPos+wave);else ctx.lineTo(x,yPos+wave);}ctx.stroke();}ctx.restore();ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<28;i++){const sx=((i*113.7+t*22)%W);const syBase=horizonY+18+((i*71.3)%(H-horizonY-20));const sy=syBase+Math.sin(t*3+i)*2;const brightness=0.08+Math.abs(Math.sin(t*4+i*0.7))*0.18+flash*0.08;const size=0.8+((i%5)*0.3);ctx.fillStyle=`rgba(220,240,255,${brightness.toFixed(3)})`;ctx.beginPath();ctx.arc(sx,sy,size,0,Math.PI*2);ctx.fill();}ctx.restore();if(heroX!==undefined){ctx.save();ctx.globalCompositeOperation='screen';const heroReflGrad=ctx.createLinearGradient(0,horizonY,0,Math.min(H,horizonY+(H-horizonY)*0.55));heroReflGrad.addColorStop(0,`rgba(0,255,200,${(0.10+flash*0.04).toFixed(3)})`);heroReflGrad.addColorStop(1,'rgba(0,255,200,0)');ctx.fillStyle=heroReflGrad;const rw=8+Math.sin(t*2)*3;ctx.fillRect(heroX-rw/2,horizonY,(rw)*(1+Math.sin(t*1.2)*0.15),(H-horizonY)*0.55);ctx.restore();}if(aiX!==undefined){ctx.save();ctx.globalCompositeOperation='screen';const aiReflGrad=ctx.createLinearGradient(0,horizonY,0,Math.min(H,horizonY+(H-horizonY)*0.45));aiReflGrad.addColorStop(0,`rgba(255,80,40,${(0.08+flash*0.05).toFixed(3)})`);aiReflGrad.addColorStop(1,'rgba(255,80,40,0)');ctx.fillStyle=aiReflGrad;const rw=6+Math.sin(t*1.8)*2;ctx.fillRect(aiX-rw/2,horizonY,rw,(H-horizonY)*0.45);ctx.restore();}if(flash>0.05){ctx.save();ctx.globalCompositeOperation='screen';const lrGrad=ctx.createLinearGradient(0,horizonY,0,horizonY+(H-horizonY)*0.4);lrGrad.addColorStop(0,`rgba(200,230,255,${(flash*0.30).toFixed(3)})`);lrGrad.addColorStop(1,'rgba(200,230,255,0)');ctx.fillStyle=lrGrad;ctx.fillRect(0,horizonY,W,(H-horizonY)*0.4);ctx.restore();}}

// Storm Flash
function stormFlash(t,seed){const s=Math.sin(t*1.3+seed)+Math.sin(t*7.3+seed*2)*0.55;return Math.max(0,Math.min(1,(s-0.85)*1.4));}

// Bloom Pass (cached buffer)
const _bbuf={canvas:null,w:0,h:0};function applyBloomPass(ctx,W,H,intensity=0.22,blur=10){if(!_bbuf.canvas||_bbuf.w!==W||_bbuf.h!==H){_bbuf.canvas=document.createElement('canvas');_bbuf.canvas.width=W;_bbuf.canvas.height=H;_bbuf.w=W;_bbuf.h=H;}const bc=_bbuf.canvas,bctx=bc.getContext('2d');bctx.clearRect(0,0,W,H);bctx.filter=`blur(${blur}px)`;bctx.drawImage(ctx.canvas,0,0);bctx.filter='none';ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=intensity;ctx.drawImage(bc,0,0);ctx.restore();}

// Paddle Glow/Shadow (Ch1 exact)
function drawPaddleGlow(ctx,x,y,w,h,t,kind,intensity){const hero=kind==='hero';const flicker=0.7+0.3*Math.abs(Math.sin(t*9+(hero?0.2:1.4))+Math.sin(t*19+(hero?0.4:2.8))*0.45);const strength=intensity*flicker;const rgb=hero?'120,255,230':'255,95,75';const edge=hero?'200,255,245':'255,210,180';ctx.save();ctx.globalCompositeOperation='screen';const auraR=Math.max(w,h)*(1.18+strength*0.45);const glow=ctx.createRadialGradient(x,y,0,x,y,auraR);glow.addColorStop(0,`rgba(${edge},${(0.18+strength*0.15).toFixed(3)})`);glow.addColorStop(0.35,`rgba(${rgb},${(0.15+strength*0.14).toFixed(3)})`);glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(x,y,auraR*0.8,auraR,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawPaddleShadow(ctx,x,y,w,h,horizonY,kind){if(y>=horizonY)return;const rgb=kind==='hero'?'0,255,180':'255,70,30';const heightFrac=Math.max(0,Math.min(1,(horizonY-y)/(horizonY)));const shadowW=(w*0.8+heightFrac*w*1.6);const shadowH=Math.max(2,8-heightFrac*6);const shadowAlpha=0.12+heightFrac*0.08;ctx.save();ctx.globalCompositeOperation='screen';const sg=ctx.createRadialGradient(x,horizonY,0,x,horizonY,shadowW);sg.addColorStop(0,`rgba(${rgb},${shadowAlpha.toFixed(3)})`);sg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sg;ctx.beginPath();ctx.ellipse(x,horizonY+shadowH,shadowW,shadowH*2,0,0,Math.PI*2);ctx.fill();ctx.restore();}

// Stars
function drawStars(ctx,W,H,n,alpha){ctx.save();for(let i=0;i<n;i++){const sx=((i*137.5)%1)*W,sy=((i*97.3)%1)*H*0.82;const r=0.4+((i*47)%10)*0.09;ctx.globalAlpha=alpha*(0.3+((i*31)%10)*0.07);ctx.fillStyle=i%5===0?'#ffecc0':'#ffffff';ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.restore();}

// Vignette
function drawVignette(ctx,W,H,strength){const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.2,W/2,H/2,Math.max(W,H)*0.8);v.addColorStop(0,'transparent');v.addColorStop(0.5,'rgba(0,0,0,0.08)');v.addColorStop(1,`rgba(0,0,0,${strength})`);ctx.fillStyle=v;ctx.fillRect(0,0,W,H);}

