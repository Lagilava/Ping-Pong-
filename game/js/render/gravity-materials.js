// Moving material, fixed silhouettes: shared spherical UV maps and accretion
// shells. Geometry, light and source textures are prepared once after decode.
(function () {
    'use strict';
    const TAU = Math.PI * 2;
    function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    function makePlanet(image, purple) {
        const detail=window.PPResolution?.detail() || 1, tex=Math.round(256*detail), sourceW=tex*2;
        const source=canvas(sourceW,tex),sx=source.getContext('2d');
        sx.drawImage(image,0,0,sourceW,tex);
        const src=sx.getImageData(0,0,sourceW,tex).data;
        const tier=typeof PerfGovernor!=='undefined'?PerfGovernor.current:null;
        const small=typeof PerfGovernor!=='undefined'&&(PerfGovernor.isMobile||(tier?.bgFps>0&&tier.bgFps<=30));
        const side=Math.round((purple?(small?96:128):(small?128:192))*detail), half=side*.5, radius=half-2;
        const output=canvas(side),ctx=output.getContext('2d'),frame=ctx.createImageData(side,side);
        const normals=new Float32Array(side*side*3),shade=new Float32Array(side*side),rim=new Float32Array(side*side);
        const albedo=new Float32Array(tex*tex*3);
        // Recover cloud albedo from the source's front hemisphere. Normalising
        // its baked key light prevents the bright patch rotating with the gas.
        for(let y=0;y<tex;y++)for(let x=0;x<tex;x++){
            const nx=(x/detail-130)/100,ny=(y/detail-129)/100,z=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
            const l=.35+.65*Math.max(0,-nx*.48-ny*.48+z*.73);
            const p=(y*sourceW+x)*4,q=(y*tex+x)*3;
            const r=src[p]/l,g=src[p+1]/l,b=src[p+2]/l;
            albedo[q]=purple?r*.45+b*.55:r;
            albedo[q+1]=purple?g*.78+b*.035:g;
            albedo[q+2]=purple?b*.82+r*.18:b;
        }
        for(let y=0;y<side;y++)for(let x=0;x<side;x++){
            const nx=(x+.5-half)/radius,ny=(y+.5-half)/radius,r2=nx*nx+ny*ny,i=y*side+x;
            if(r2>=1)continue;
            const z=Math.sqrt(1-r2),n=i*3;
            normals[n]=nx;normals[n+1]=ny;normals[n+2]=z;
            shade[i]=.12+.88*Math.max(0,-nx*.48-ny*.48+z*.73);
            rim[i]=(1-z)**4*Math.max(0,.5-nx*.35-ny*.35)*25;
            frame.data[i*4+3]=Math.min(255,(1-Math.sqrt(r2))*radius*255);
        }
        return {output,ctx,frame,normals,shade,rim,albedo,side,purple,tex,detail,stamp:-Infinity};
    }
    function planetFrame(planet,time){
        const stamp=Math.floor(time*30);
        if(planet.stamp===stamp)return planet.output;
        planet.stamp=stamp;
        const {side,normals,shade,rim,albedo,frame,tex,detail}=planet,t=stamp/30,stride=tex*3;
        for(let y=0;y<side;y++){
            const lat=(y+.5-side*.5)/(side*.5-2);
            const phase=t*((planet.purple?-.24:.34)+Math.sin(lat*9)*.035);
            const cs=Math.cos(phase),sn=Math.sin(phase);
            for(let x=0;x<side;x++){
                const i=y*side+x,p=i*4;if(!frame.data[p+3])continue;
                const n=i*3,nx=normals[n],ny=normals[n+1],z=normals[n+2];
                const u=(130+(nx*cs+z*sn)*100)*detail,v=(129+ny*100)*detail;
                const ix=u|0,iy=v|0,fx=u-ix,fy=v-iy,q=(iy*tex+ix)*3,L=shade[i];
                const w0=(1-fx)*(1-fy)*L,w1=fx*(1-fy)*L,w2=(1-fx)*fy*L,w3=fx*fy*L;
                frame.data[p]=albedo[q]*w0+albedo[q+3]*w1+albedo[q+stride]*w2+albedo[q+stride+3]*w3+rim[i]*.25;
                frame.data[p+1]=albedo[q+1]*w0+albedo[q+4]*w1+albedo[q+stride+1]*w2+albedo[q+stride+4]*w3+rim[i]*.6;
                frame.data[p+2]=albedo[q+2]*w0+albedo[q+5]*w1+albedo[q+stride+2]*w2+albedo[q+stride+5]*w3+rim[i];
            }
        }
        planet.ctx.putImageData(frame,0,0);return planet.output;
    }
    function buildPlanets(image){
        const blue=makePlanet(image,false),purple=makePlanet(image,true);
        const detail=window.PPResolution?.detail() || 1, w=Math.round(512*detail), h=Math.round(256*detail);
        const ring=canvas(w,h),ctx=ring.getContext('2d');ctx.drawImage(image,0,0,w,h);
        window.SceneCompositor?.cleanMatte(ring,{minIslandPixels:16});
        const data=ctx.getImageData(0,0,w,h);
        // Preserve the source rings, removing its painted body. The front arc
        // alone may occlude the animated sphere; the rear arc stays behind it.
        const cx=w*.748,cy=h*.51,r=w*.143,cs=Math.cos(-.55),sn=Math.sin(-.55);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const dx=(x-cx)/r,dy=(y-cy)/r,p=(y*w+x)*4;
            if(x<w/2){data.data[p+3]=0;continue;}
            if(dx*dx+dy*dy<1.025){
                const u=dx*cs+dy*sn,v=-dx*sn+dy*cs;
                const outer=u*u/(1.95*1.95)+v*v/(.5*.5);
                const inner=u*u/(1.17*1.17)+v*v/(.30*.30);
                if(!(v>0&&outer<1&&inner>1))data.data[p+3]=0;
            }
        }
        ctx.putImageData(data,0,0);return {blue,purple,ring};
    }
    function drawPlanet(ctx,maps,index,px,py,side,time){
        const p=index?maps.purple:maps.blue;
        const image=planetFrame(p,time);
        if(!index){
            const size=side*.94;ctx.drawImage(image,px-size*.5,py-size*.5,size,size);return;
        }
        // Same measured atlas proportions as the original ringed silhouette.
        const h=side*.83/(.528*2),cx=px+side*.023,cy=py+h*.042,size=side*.542;
        ctx.drawImage(image,cx-size*.5,cy-size*.5,size,size);
        const rw=maps.ring.width,rh=maps.ring.height;
        ctx.drawImage(maps.ring,rw*.472,rh*.06,rw*.528,rh*.83,px-side*.5,py-h*.5,side,h);
        // A sparse stream follows the ring plane; its rear half is hidden by
        // the sphere, rather than shining through it as a flat overlay.
        ctx.save();ctx.translate(cx,cy);ctx.rotate(-.55);ctx.fillStyle='#d4c7ff';
        for(let i=0;i<7;i++){
            const a=time*.43+i*TAU/7,x=Math.cos(a)*size*.85,y=Math.sin(a)*size*.22;
            if(y<0&&x*x+y*y<size*size*.25)continue;
            ctx.globalAlpha=.2+.25*(.5+.5*Math.sin(a));ctx.fillRect(x,y,1.1,1.1);
        }
        ctx.restore();
    }
    function buildWell(image){
        const side=Math.round(256*(window.PPResolution?.detail() || 1)),source=canvas(side),ctx=source.getContext('2d');ctx.drawImage(image,0,0,side,side);
        const original=ctx.getImageData(0,0,side,side),bands=[];
        // Three shared annuli retain differential flow with fewer translucent
        // blits per well. Their angular density is baked once after decode.
        for(let b=0;b<3;b++){
            const c=canvas(side),x=c.getContext('2d'),data=x.createImageData(side,side);
            const center=[.43,.66,.89][b];
            for(let y=0;y<side;y++)for(let u=0;u<side;u++){
                const r=Math.hypot(u+.5-side*.5,y+.5-side*.5)/(side*.5);
                const weight=Math.max(0,1-Math.abs(r-center)/.19),p=(y*side+u)*4;
                if(r<.315||weight<=0)continue;
                // Uneven spiral density makes differential rotation legible.
                // Bake the density into the seven shared textures, not each frame.
                const angle=Math.atan2(y+.5-side*.5,u+.5-side*.5);
                const flow=.73+.17*Math.cos(angle*3-r*16+b*.85)
                    +.10*Math.sin(angle*7+r*23-b*.6);
                data.data[p]=original.data[p];data.data[p+1]=original.data[p+1];data.data[p+2]=original.data[p+2];
                data.data[p+3]=original.data[p+3]*weight*flow;
            }
            x.putImageData(data,0,0);bands.push(c);
        }
        return bands;
    }
    function drawWell(ctx,bands,x,y,radius,time,excitement=0,spin=1,phase=0){
        const size=radius*2.95,t=time,hot=Math.max(0,Math.min(1,excitement));
        ctx.save();ctx.translate(x,y);
        ctx.globalCompositeOperation='screen';
        for(let i=2;i>=0;i--){
            const r=[.43,.66,.89][i],omega=(.28+.34/Math.pow(r,1.5))*(1+hot*.35);
            ctx.save();ctx.rotate(spin*(t*omega+phase));
            ctx.drawImage(bands[i],-size*.5,-size*.5,size,size);ctx.restore();
        }
        // A single sweeping highlight makes the inner orbit readable.
        ctx.lineWidth=Math.max(.8,radius/80);
        const a=spin*(t*(1.25+hot*.4)+phase);
        ctx.globalAlpha=.22+hot*.24;
        ctx.strokeStyle='#b9eaff';
        ctx.beginPath();ctx.arc(0,0,size*.178,a,a+.58*spin,spin<0);ctx.stroke();
        if(typeof areParticleEffectsEnabled!=='function'||areParticleEffectsEnabled()){
            // Sparse infalling sparks with curved trails. Fixed path count and
            // no per-frame gradients, offscreen surfaces or Canvas shadows.
            ctx.lineWidth=Math.max(.7,radius/120);
            for(let group=0;group<2;group++){
                ctx.strokeStyle=group?'#c7abff':'#a4dcff';
                ctx.globalAlpha=(.31+hot*.27)*(group?.7:1);
                ctx.beginPath();
                for(let i=group;i<8;i+=2){
                    const age=((t*(.19+(i%3)*.026)+i*.6180339+phase)%1+1)%1;
                    for(let j=0;j<3;j++){
                        const u=Math.max(0,age-j*.034),r=size*(.47-u*.30);
                        const a=spin*(i*2.399+u*5.8+t*.2)+phase;
                        const px=Math.cos(a)*r,py=Math.sin(a)*r;
                        if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
                    }
                }
                ctx.stroke();
            }
        }
        // Paint the event horizon last so even bright gas and sparks vanish
        // behind the silhouette. The boundary stays fixed as the disk flows.
        ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
        ctx.fillStyle='#01030b';ctx.beginPath();ctx.arc(0,0,size*.169,0,TAU);ctx.fill();
        ctx.restore();
    }
    window.GravityMaterials={buildPlanets,drawPlanet,buildWell,drawWell};
})();
