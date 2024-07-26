import { PerspectiveCamera, Scene, WebGLRenderer } from "three";


async function checkSupport() {
  const isArSessionSupported =
    navigator.xr && navigator.xr.isSessionSupported && navigator.xr.isSessionSupported('immersive-ar');
  return isArSessionSupported;
}

class App {
  private xrSession: XRSession | undefined;
  private localRefSpace: XRReferenceSpace | XRBoundedReferenceSpace | undefined;
  private viewerRefSpace: XRReferenceSpace | XRBoundedReferenceSpace | undefined;
  private hitTestSource: XRHitTestSource | undefined;
  private gl: WebGL2RenderingContext | undefined;
  private renderer: WebGLRenderer | undefined;
  private scene: Scene | undefined;
  private camera: PerspectiveCamera | undefined;

  constructor(private canvas: HTMLCanvasElement) {}

  public async activateXr() {
    this.xrSession = await navigator.xr?.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      //domOverlay: {root: document.body}
    });
    if (!this.xrSession) throw Error(`no XRSession created`);

    this.gl = this.initXrCanvas(this.canvas, this.xrSession);

    this.setupThreeJs(this.canvas);

    // scene-root ref-space: 0/0/0 is where user's head was at start of application
    this.localRefSpace = await this.xrSession.requestReferenceSpace('local');
    // viewer ref-space: 0/0/0 is at user's head all the time
    this.viewerRefSpace = await this.xrSession.requestReferenceSpace('viewer');
    // do hit tests by casting ray from viewer ref-space; later convert to scene-root ref-space.
    this.hitTestSource = await this.xrSession.requestHitTestSource!({ space: this.viewerRefSpace });

    this.xrSession.requestAnimationFrame(this.onLoop);
    this.xrSession.addEventListener('select', this.onSelect);
  }

  private initXrCanvas(canvas: HTMLCanvasElement, session: XRSession) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const gl = canvas.getContext('webgl2', { xrCompatible: true })!;
    session.updateRenderState({
      baseLayer: new XRWebGLLayer(session, gl),
    });
    return gl;
  }

  private setupThreeJs(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      canvas,
      context: this.gl,
    });
    this.renderer.autoClear = false;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
  }

  private onSelect(session: XRSession, evt: XRInputSourceEvent): void {
    console.log('select: ', evt);
  }

  private onLoop(time: DOMHighResTimeStamp, frame: XRFrame) {
    // Getting framebuffer from Xr, activating it in WebGL, connecting it to Threejs
    const framebuffer = this.xrSession!.renderState.baseLayer!.framebuffer;
    this.gl!.bindFramebuffer(this.gl!.FRAMEBUFFER, framebuffer);
    this.renderer!.setFramebuffer(framebuffer);

    // sync pose with scene
    const pose = frame.getViewerPose(this.localRefSpace!);
    if (pose) {
      // in mobile AR, we only have one view
      const view = pose.views[0];

      // update canvas size
      const viewport = this.xrSession!.renderState.baseLayer!.getViewport(view);
      if (viewport) this.renderer!.setSize(viewport.width, viewport.height);

      // update camera
      this.camera!.matrix.fromArray(view.transform.matrix);
      this.camera!.projectionMatrix.fromArray(view.projectionMatrix);
      this.camera!.updateMatrixWorld(true);

      // hit test
      // getting hit-test (from viewer ref-space)
      const hitTestResults = frame.getHitTestResults(this.hitTestSource!);
      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        // relating hit-test to local ref-space
        const hitPose = hit.getPose(this.localRefSpace!);

        // update reticle
        if (hitPose) {
          this.reticle.visible = true;
          this.reticle.position.set(
            hitPose.transform.position.x,
            hitPose.transform.position.y,
            hitPose.transform.position.z
          );
          this.retcle.updateMatrixWorld(true);
        }
      }
    }

    this.renderer.render(this.scene, this.camera);

    this.xrSession?.requestAnimationFrame(this.onLoop);
  }
}
