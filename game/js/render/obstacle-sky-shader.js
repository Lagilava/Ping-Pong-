// One bounded GPU pass over cached scenery. No post-processing of the ball,
// obstacles or HUD; software renderers retain the inexpensive canvas scene.
class ObstacleSkyShader {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ok = false;
        this.canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            this.ok = false;
        });
        this.canvas.addEventListener('webglcontextrestored', () => this._init());
        this._init();
    }

    _init() {
        this.ok = false;
        const gl = this.canvas.getContext('webgl', {
            alpha: false, antialias: false, depth: false, stencil: false,
            preserveDrawingBuffer: false, powerPreference: 'low-power'
        });
        if (!gl) return;
        this.gl = gl;
        if (!ObstacleSkyShader.allowSoftware && typeof ObstacleFloorShader !== 'undefined' && ObstacleFloorShader.isSoftware(gl)) return;
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source); gl.compileShader(shader);
            if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
            gl.deleteShader(shader);
            return null;
        };
        const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 aPos; varying vec2 vUV; void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}');
        const fs = compile(gl.FRAGMENT_SHADER, ObstacleSkyShader.FRAGMENT);
        if (!vs || !fs) return;
        const program = gl.createProgram();
        gl.attachShader(program, vs); gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, 'aPos');
        gl.linkProgram(program);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        this.program = program;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.uTime = gl.getUniformLocation(program, 'uTime');
        this.uMotion = gl.getUniformLocation(program, 'uMotion');
        this.source = null;
        this.ok = true;
    }

    render(source, time, motion) {
        if (!this.ok || this.gl.isContextLost()) return null;
        const gl = this.gl;
        if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
            this.canvas.width = source.width;
            this.canvas.height = source.height;
        }
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (this.source !== source) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            this.source = source;
        }
        gl.uniform1f(this.uTime, time % 512);
        gl.uniform1f(this.uMotion, motion ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return this.canvas;
    }
}
ObstacleSkyShader.allowSoftware = false;
ObstacleSkyShader.FRAGMENT = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uScene;
uniform float uTime;
uniform float uMotion;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
void main(){
    vec2 uv=vUV;
    float t=uTime*uMotion;
    vec3 col=texture2D(uScene,uv).rgb;
    float edge=smoothstep(0.22,0.47,abs(uv.x-0.5));
    // Colour-key the painted falls: flow stays on cyan water, never the court.
    float water=smoothstep(0.025,0.11,min(col.b-col.r,col.g-col.r))*edge;
    float ribbons=0.5+0.5*sin(uv.x*480.0+sin(uv.y*18.0+t)*1.8);
    float flow=pow(0.5+0.5*sin(uv.y*95.0+t*5.0+ribbons*3.0),5.0);
    col+=vec3(0.06,0.28,0.38)*water*(0.15+flow*0.65);
    // Travelling glints on the existing amber seams, with no geometry warp.
    float gold=smoothstep(0.06,0.22,col.r-col.b)*smoothstep(0.15,0.42,col.r)*edge;
    float glint=pow(0.5+0.5*sin(uv.x*19.0+uv.y*12.0-t*1.2),10.0);
    col+=vec3(0.20,0.105,0.025)*gold*glint;
    // Very faint drifting cloud light: low frequency, no flashes or blur.
    float cloud=noise(uv*vec2(5.0,3.5)+vec2(t*0.025,-t*0.018));
    float veil=(cloud-0.5)*0.024*(1.0-edge);
    col+=vec3(0.8,0.55,0.65)*veil;
    gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
}`;
