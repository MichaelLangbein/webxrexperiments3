import { WebGLRenderer, WebXRManager } from "three";
import { Graph } from "../../../engine3/engine3/src/engine.more";
import { DataTexture, Buffer, Framebuffer, GlobalState, Texture } from "../../../engine3/engine3/src/engine";
import { webglLoggingProxy } from "../../../engine3/engine3/src/utils/debugUtils";

export class HtsMgmt {
    constructor(private xr: WebXRManager) {}

    public getHts() {
        if (this.hts) return this.hts;
        this.loadHts();
        return undefined;
    }

    private hts?: XRHitTestSource;
    private requestOngoing = false;
    private loadHts() {
        if (this.requestOngoing) return;
        this.requestOngoing = true;
        const session = this.xr.getSession();
        if (!session || !session.requestHitTestSource) {
            this.requestOngoing = false;
            return;
        }
        session.requestReferenceSpace("viewer").then((viewerRefSpace) => {
            // @ts-ignore
            session.requestHitTestSource({ space: viewerRefSpace }).then((hts) => {
                this.hts = hts;
                this.requestOngoing = false;
            });
        });
        session.addEventListener("end", () => {
            this.requestOngoing = false;
            this.hts = undefined;
        });
    }
}

export class DepthInformationMgmt {
    /*
    https://developer.mozilla.org/en-US/docs/Web/API/XRWebGLBinding/getDepthInformation

    requiredFeatures: ["depth-sensing"],
    depthSensing: {
        usagePreference: ["gpu-optimized"],
        formatPreference: ["luminance-alpha"],
    },
    */
    constructor(private renderer: WebGLRenderer) {}

    private webGlBinding?: XRWebGLBinding;
    private getWebGlBinding() {
        if (this.webGlBinding) return this.webGlBinding;
        const session = this.renderer.xr.getSession();
        if (!session) return undefined;
        const context = this.renderer.getContext();
        const binding = new XRWebGLBinding(session, context);
        this.webGlBinding = binding;
        session.addEventListener("end", () => {
            this.webGlBinding = undefined;
        });
        return binding;
    }

    public getDepthInformation(frame: XRFrame): XRWebGLDepthInformation[] {
        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace) return [];

        const viewerPose = frame.getViewerPose(refSpace);
        if (!viewerPose) return [];

        const binding = this.getWebGlBinding();
        if (!binding) return [];

        const depthInformations: XRWebGLDepthInformation[] = [];
        for (const view of viewerPose?.views) {
            const depthInformation = binding.getDepthInformation(view);
            if (depthInformation) depthInformations.push(depthInformation);
        }

        return depthInformations;
    }
}

export class RawCameraMgmt {
    constructor(private renderer: WebGLRenderer) {}

    private webGlBinding?: XRWebGLBinding;
    private getWebGlBinding() {
        if (this.webGlBinding) return this.webGlBinding;
        const session = this.renderer.xr.getSession();
        if (!session) return undefined;
        const context = this.renderer.getContext();
        const binding = new XRWebGLBinding(session, context);
        this.webGlBinding = binding;
        session.addEventListener("end", () => {
            this.webGlBinding = undefined;
        });
        return binding;
    }

    private t2c?: RawTex2Corner;
    private getT2C(texture: WebGLTexture, width: number, height: number) {
        if (this.t2c) return this.t2c;
        const gl = this.renderer.getContext();
        const nrBindPoints = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
        const freeBindPoint = nrBindPoints - 1;
        this.t2c = new RawTex2Corner(this.renderer, texture, width, height, freeBindPoint, [
            10,
            height - 100,
            200,
            200,
        ]);
        return this.t2c;
    }

    public getRawWebGlTextureRefs(frame: XRFrame): { texture: WebGLTexture; width: number; height: number }[] {
        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace) return [];

        const viewerPose = frame.getViewerPose(refSpace);
        if (!viewerPose) return [];

        const binding = this.getWebGlBinding();
        if (!binding) return [];

        const textureRefs: {
            texture: WebGLTexture;
            width: number;
            height: number;
        }[] = [];
        for (const view of viewerPose?.views) {
            // @ts-ignore  <- as of yet no types for this new feature
            if (view.camera) {
                // API taken from here: https://immersive-web.github.io/raw-camera-access/#xrcamera-camera-image
                // @ts-ignore  <- as of yet no types for this new feature
                const webGlCameraTexture = binding.getCameraImage(view.camera);
                // @ts-ignore  <- as of yet no types for this new feature
                const width = view.camera.width;
                // @ts-ignore  <- as of yet no types for this new feature
                const height = view.camera.height;
                textureRefs.push({
                    texture: webGlCameraTexture,
                    width,
                    height,
                });
            }
        }

        return textureRefs;
    }

    public drawWebGlTextureIntoCorner(texture: WebGLTexture, width: number, height: number) {
        const gl = this.renderer.getContext() as WebGL2RenderingContext;
        const t2c = this.getT2C(texture, width, height);
        t2c.draw(texture);
    }

    public getWebGlTexturePixels(texture: WebGLTexture, width: number, height: number, gl: WebGL2RenderingContext) {
        // @ts-ignore  <-- is actually a protected method.
        const textureParas = Texture.getTextureParas(gl, "ubyte4", []);
        const wrappedTexture = new Texture(
            gl,
            "ubyte4",
            texture,
            0,
            textureParas.internalFormat,
            textureParas.format,
            textureParas.type,
            width,
            height,
            0
        );
        const fb = new Framebuffer(gl, {});
        const pixels = wrappedTexture.getCurrentPixels(fb);
        fb.destroy();
        return pixels;
    }

    public webGlTextureToTensor(texture: WebGLTexture, width: number, height: number) {
        // https://js.tensorflow.org/api/latest/ -> grep `texture`
    }

    public convertWebGlTextureToThreejsTexture(texture: WebGLTexture, width: number, height: number) {
        // https://discourse.threejs.org/t/using-a-webgltexture-as-texture-for-three-js/46245/7
        // https://stackoverflow.com/questions/55082573/use-webgl-texture-as-a-three-js-texture-map
    }
}

class RawTex2Corner {
    private buffer: WebGLBuffer;
    private program: WebGLProgram;
    private gl: WebGL2RenderingContext;
    vao: WebGLVertexArrayObject;

    constructor(
        private renderer: WebGLRenderer,
        private texture: WebGLTexture,
        private width: number,
        private height: number,
        private bindPoint: number,
        private viewPort: number[]
    ) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        this.gl = gl;

        // rectangle vertex buffer
        const buffer0 = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer0);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, 1, 0, 1, -1, -1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, 1, -1, 0, 1, 1, 1, 0, 1]),
            gl.STATIC_DRAW
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.buffer = buffer0;

        // program
        const shader0 = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(
            shader0,
            `#version 300 es
                    in vec4 position;
                    void main() {
                        gl_Position = vec4(position.xy, 0, 1);
                    }`
        );
        gl.compileShader(shader0);
        gl.getShaderParameter(shader0, gl.COMPILE_STATUS);
        const shader1 = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(
            shader1,
            `#version 300 es
                    precision highp float;
                    uniform sampler2D tex;
                    out vec4 fragColor;
                    void main() {
                        vec2 uv = vec2(
                            gl_FragCoord.x / ${width.toFixed(1)}, 
                            gl_FragCoord.y / ${height.toFixed(1)}
                        );
                        vec4 color = texture(tex, uv);
                        fragColor = color;
                    }`
        );
        gl.compileShader(shader1);
        gl.getShaderParameter(shader1, gl.COMPILE_STATUS);
        const program0 = gl.createProgram()!;
        gl.attachShader(program0, shader0);
        gl.attachShader(program0, shader1);
        gl.linkProgram(program0);
        gl.getProgramParameter(program0, gl.LINK_STATUS);
        gl.detachShader(program0, shader0);
        gl.deleteShader(shader0);
        gl.detachShader(program0, shader1);
        gl.deleteShader(shader1);
        this.program = program0;

        // vao connecting buffer to program
        const vertexArr0 = gl.createVertexArray()!;
        this.vao = vertexArr0;

        // connect buffer to vao
        const attribLoc = gl.getAttribLocation(program0, `position`);
        gl.bindVertexArray(vertexArr0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer0);
        gl.enableVertexAttribArray(attribLoc);
        gl.vertexAttribPointer(attribLoc, 4, gl.FLOAT, false, 16, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // bind texture to slot
        gl.activeTexture(gl.TEXTURE0 + bindPoint);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // tell program which slot to find texture in
        gl.useProgram(program0);
        const uniformLocation = gl.getUniformLocation(program0, "tex");
        this.gl.uniform1i(uniformLocation, bindPoint);
    }

    destroy() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteTexture(this.texture);
        gl.deleteBuffer(this.buffer);
        gl.deleteProgram(this.program);
    }

    draw(texture: WebGLTexture) {
        const gl = this.gl;

        // remember state
        const vwp_orig = Array.from(gl.getParameter(gl.VIEWPORT)) as number[];
        const prg_orig = gl.getParameter(gl.CURRENT_PROGRAM);
        const vao_orig = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
        const activeUnit_orig = gl.getParameter(gl.ACTIVE_TEXTURE);

        // render
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(this.viewPort[0], this.viewPort[1], this.viewPort[2], this.viewPort[3]);

        gl.viewport(this.viewPort[0], this.viewPort[1], this.viewPort[2], this.viewPort[3]);
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.activeTexture(gl.TEXTURE0 + this.bindPoint);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const uniformLocation = gl.getUniformLocation(this.program, "tex");
        this.gl.uniform1i(uniformLocation, this.bindPoint);
        gl.drawArrays(gl.TRIANGLES, gl.NONE, 6);

        gl.disable(gl.SCISSOR_TEST);
        // gl.scissor(this.viewPort[0] + this.viewPort[2], 0, this.width - this.viewPort[2], this.height);

        // restore state
        gl.viewport(vwp_orig[0], vwp_orig[1], vwp_orig[2], vwp_orig[3]);
        gl.useProgram(prg_orig);
        gl.bindVertexArray(vao_orig);
        gl.activeTexture(activeUnit_orig);
    }
}
