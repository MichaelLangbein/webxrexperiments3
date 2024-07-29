import { WebGLRenderer, WebXRManager } from 'three';
import { Graph } from '../../../engine3/engine3/src/engine.more';
import { Framebuffer, GlobalState, Texture } from '../../../engine3/engine3/src/engine';

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
        session.requestReferenceSpace('viewer').then((viewerRefSpace) => {
            // @ts-ignore
            session.requestHitTestSource({ space: viewerRefSpace }).then((hts) => {
                this.hts = hts;
                this.requestOngoing = false;
            });
        });
        session.addEventListener('end', () => {
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
        session.addEventListener('end', () => {
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
        session.addEventListener('end', () => {
            this.webGlBinding = undefined;
        });
        return binding;
    }

    public getRawWebGlTextureRefs(frame: XRFrame): { texture: WebGLTexture; width: number; height: number }[] {
        const refSpace = this.renderer.xr.getReferenceSpace();
        if (!refSpace) return [];

        const viewerPose = frame.getViewerPose(refSpace);
        if (!viewerPose) return [];

        const binding = this.getWebGlBinding();
        if (!binding) return [];

        const textureRefs: { texture: WebGLTexture; width: number; height: number }[] = [];
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
                textureRefs.push({ texture: webGlCameraTexture, width, height });
            }
        }

        return textureRefs;
    }

    public drawWebGlTextureToCanvas(texture: WebGLTexture, width: number, height: number, canvas: HTMLCanvasElement) {
        // currently assumes that images are ubyte4

        // use raw webgl to render the texture to a canvas
        const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
        canvas.width = width;
        canvas.height = height;
        // @ts-ignore  <-- is actually a protected method.
        const textureParas = Texture.getTextureParas(gl, 'ubyte4', []);
        const wrappedTexture = new Texture(
            gl,
            'ubyte4',
            texture,
            0,
            textureParas.internalFormat,
            textureParas.format,
            textureParas.type,
            width,
            height,
            0
        );

        const gs = new GlobalState(gl, {
            allowAlpha: true,
            viewport: [0, 0, canvas.width, canvas.height],
        });

        const graph = new Graph(gs, {
            program: {
                vertexSource: ``,
                fragmentSource: ``,
            },
            inputs: {
                textures: {
                    tex: wrappedTexture,
                },
                attributes: {},
                uniforms: {},
            },
            outputs: {},
            settings: {
                drawingMode: 'triangles',
                instanced: false,
                nrVertices: 6,
                viewport: [0, 0, canvas.width, canvas.height],
            },
        });

        graph.draw();
    }

    public getWebGlTexturePixels(texture: WebGLTexture, width: number, height: number, gl: WebGL2RenderingContext) {
        // @ts-ignore  <-- is actually a protected method.
        const textureParas = Texture.getTextureParas(gl, 'ubyte4', []);
        const wrappedTexture = new Texture(
            gl,
            'ubyte4',
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
