import { WebGLRenderer, WebXRManager } from "three";
import { Graph } from "../../../engine3/engine3/src/engine.more";
import { DataTexture, Buffer, Framebuffer, GlobalState, Texture } from "../../../engine3/engine3/src/engine";

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

    private t2c?: Tex2CanvasDrawer;
    private getT2C(canvas: HTMLCanvasElement) {
        if (this.t2c) return this.t2c;
        this.t2c = new Tex2CanvasDrawer(canvas);
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

    public drawWebGlTextureToCanvas(texture: WebGLTexture, width: number, height: number, canvas: HTMLCanvasElement) {
        const t2c = this.getT2C(canvas);
        t2c.replaceTexture(texture, width, height);
        t2c.draw();
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

class Tex2CanvasDrawer {
    private graph: Graph;
    private tex: Texture;

    constructor(private canvas: HTMLCanvasElement) {
        // use raw webgl to render the texture to a canvas
        const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;

        const tex = new DataTexture(gl, { data: [], t: "ubyte4" });

        const gs = new GlobalState(gl, {
            allowAlpha: true,
            viewport: [0, 0, canvas.width, canvas.height],
        });

        const rectVertices = [
            [-1, +1, 0, 1], // lt
            [-1, -1, 0, 1], // lb
            [+1, -1, 0, 1], // rb
            [-1, +1, 0, 1], // lt
            [+1, -1, 0, 1], // rb
            [+1, +1, 0, 1], // rt
        ];

        const graph = new Graph(gs, {
            program: {
                vertexSource: `#version 300 es
                    in vec4 position;
                    void main() {
                        gl_Position = vec4(position.xy, 0, 1);
                    }`,
                fragmentSource: `#version 300 es
                    precision highp float;
                    uniform sampler2D tex;
                    out vec4 fragColor;
                    void main() {
                        vec2 uv = vec2(
                            gl_FragCoord.x / ${canvas.width.toFixed(1)}, 
                            gl_FragCoord.y / ${canvas.height.toFixed(1)}
                        );
                        vec4 color = texture(tex, uv);
                        fragColor = color;
                    }`,
            },
            inputs: {
                textures: {
                    tex,
                },
                attributes: {
                    position: {
                        buffer: new Buffer(gl, { data: new Float32Array(rectVertices.flat()), changesOften: false }),
                        config: { normalize: false, nrInstances: 0, type: "vec4" },
                    },
                },
                uniforms: {},
            },
            outputs: {},
            settings: {
                drawingMode: "triangles",
                instanced: false,
                nrVertices: 6,
                viewport: [0, 0, canvas.width, canvas.height],
            },
        });

        this.graph = graph;
        this.tex = tex;
    }

    public replaceTexture(tex: WebGLTexture, width: number, height: number) {
        this.tex.destroy();

        const gl = this.graph.gs.gl;

        // @ts-ignore  <-- is actually a protected method.
        const textureParas = Texture.getTextureParas(gl, "ubyte4", []);

        const wrappedTexture = new Texture(
            gl,
            "ubyte4",
            tex,
            0,
            textureParas.internalFormat,
            textureParas.format,
            textureParas.type,
            width,
            height,
            0
        );
        this.graph.updateTexture("tex", wrappedTexture);
        this.tex = wrappedTexture;
    }

    public draw() {
        this.graph.draw();
    }
}
