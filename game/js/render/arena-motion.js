// Cached material and articulated crowd helpers shared by the arena/cemetery.
// Wind changes the free edges; attachment points and seated roots stay fixed.
(function(){
    'use strict';
    const TAU=Math.PI*2;
    function fabric(ctx,source,rect,x,y,time,amplitude=5,strips=12,root='top'){
        const {sx=0,sy=0,sw=source.width,sh=source.height,w=sw,h=sh}=rect;
        const offset=v=>{
            const free=root==='bottom'?1-v:Math.max(0,(v-.24)/.76);
            return (Math.sin(time*1.35-v*5)*.72+Math.sin(time*2.13-v*8)*.28)*amplitude*free*free;
        };
        const height=v=>{const free=root==='bottom'?1-v:Math.max(0,(v-.24)/.76);
            return h*v+Math.sin(time*1.7-v*6)*h*.007*free*free;};
        const alpha=ctx.globalAlpha;
        ctx.save();ctx.translate(x,y);
        for(let i=0;i<strips;i++){
            const v0=i/strips,v1=(i+1)/strips,dy=h/strips;
            const a=offset(v0),b=offset(v1);
            ctx.save();ctx.translate(a,height(v0));ctx.transform(1,0,(b-a)/dy,(height(v1)-height(v0))/dy,0,0);
            // Adjacent rows share their deformed boundary; the half-pixel
            // source overlap prevents transparent cracks at subpixel offsets.
            const overlap=Math.min(.35,sh*(1-v1));
            ctx.globalAlpha=alpha;
            ctx.drawImage(source,sx,sy+sh*v0,sw,sh/strips+overlap,0,0,w,dy+overlap*h/sh);
            if(rect.shadeDark&&rect.shadeLight){
                const fold=Math.sin(time*1.35-(v0+v1)*2.5)*Math.max(0,(v0-.24)/.76)*.14;
                ctx.globalAlpha=alpha*Math.abs(fold);
                ctx.drawImage(fold<0?rect.shadeDark:rect.shadeLight,sx,sy+sh*v0,sw,sh/strips+overlap,0,0,w,dy+overlap*h/sh);
            }
            ctx.restore();
        }
        ctx.restore();
    }
    function crowdAtlas(){
        const density=window.PPResolution?.detail() || 1;
        const c=document.createElement('canvas');c.width=40*64*density;c.height=40*density;const x=c.getContext('2d');x.scale(density,density);
        for(let family=0;family<2;family++)for(let frame=0;frame<32;frame++){
            const t=frame/31,raise=family?(1-Math.cos(t*TAU))*.5:0;
            const lean=(family?.45:.8)*Math.sin(t*TAU);
            x.save();x.translate((family*32+frame)*40,0);x.beginPath();x.rect(0,0,40,25);x.clip();
            x.fillStyle='#220b15';x.beginPath();x.moveTo(11,25);x.quadraticCurveTo(10,20-raise*3,18+lean,21-raise*3);
            x.quadraticCurveTo(26+lean,20-raise*3,29,25);x.closePath();x.fill();
            x.fillStyle='#31121c';x.beginPath();x.arc(20+lean,14-raise*4,4,0,TAU);x.fill();
            x.strokeStyle='rgba(236,127,148,.48)';x.lineWidth=1;x.beginPath();x.arc(20+lean,14-raise*4,3.7,Math.PI*1.1,Math.PI*1.85);x.stroke();
            x.strokeStyle='#532333';x.lineWidth=2.2;x.lineCap='round';
            for(const side of [-1,1]){
                const lift=raise*(side===1?.9:1),a=side*(.35+lift*2.55);
                const shoulderX=20+lean+side*6,elbowX=shoulderX+Math.sin(a)*7,elbowY=22-raise*3+Math.cos(a)*7;
                const handX=elbowX+Math.sin(a+side*.3)*6,handY=elbowY+Math.cos(a+side*.3)*6;
                x.beginPath();x.moveTo(shoulderX,22-raise*3);x.lineTo(elbowX,elbowY);x.lineTo(handX,handY);x.stroke();
            }
            x.restore();
        }return c;
    }
    function drawCrowd(ctx,atlas,actors,time,eventTime){
        for(const a of actors){
            const elapsed=time-eventTime-a.delay;
            const cheer=elapsed>=0&&elapsed<1.8;
            const phase=cheer?Math.min(31,Math.floor(elapsed/1.8*32)):Math.floor((time*.32+a.phase)*32)%32;
            const frame=(cheer?32:0)+phase,s=a.scale;
            const cell=atlas.height;
            ctx.drawImage(atlas,frame*cell,0,cell,cell,a.x-20*s,a.y-25*s,40*s,40*s);
        }
    }
    function fog(){
        const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d'),p=x.createImageData(512,96);
        const hash=(a,b)=>{const v=Math.sin((a%16)*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
        const noise=(u,v)=>{const a=Math.floor(u),b=Math.floor(v),fx=u-a,fy=v-b,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
            return (hash(a,b)*(1-sx)+hash(a+1,b)*sx)*(1-sy)+(hash(a,b+1)*(1-sx)+hash(a+1,b+1)*sx)*sy;};
        for(let y=0;y<96;y++)for(let xx=0;xx<512;xx++){
            const n=noise(xx/32,y/24)*.65+noise(xx/16,y/12)*.35;
            const edge=Math.sin(Math.PI*(y+.5)/96)**2,i=(y*512+xx)*4;
            p.data[i]=107;p.data[i+1]=153;p.data[i+2]=137;p.data[i+3]=Math.max(0,n-.28)*edge*160;
        }
        x.putImageData(p,0,0);return c;
    }
    function drawFog(ctx,tile,w,h,time){
        ctx.save();
        for(const [top,height,speed,alpha,phase] of [[.68,.17,7,.32,0],[.82,.13,17,.48,239]]){
            const offset=((time*speed*Math.min(w,h)/720+phase)%w+w)%w;ctx.globalAlpha=alpha;
            ctx.drawImage(tile,-offset,h*top,w,h*height);ctx.drawImage(tile,w-offset,h*top,w,h*height);
        }ctx.restore();
    }
    window.ArenaMotion={fabric,crowdAtlas,drawCrowd,fog,drawFog};
})();
