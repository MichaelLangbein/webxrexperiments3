import {
    Group, Mesh, MeshBasicMaterial, RingGeometry, Scene, SphereGeometry, WebGLRenderer, WebXRManager
} from "three";
import { ARButton } from "three/examples/jsm/Addons.js";


/**
 * https://threejs.org/manual/#en/webxr-look-to-select
 * https://github.com/mrdoob/three.js/blob/master/examples/webxr_ar_hittest.html#L120
 * https://codelabs.developers.google.com/ar-with-webxr#0
 * https://github.com/mrdoob/three.js/blob/067f8a0ccc1d508a8819ba3fa0ea066be40e432c/examples/jsm/webxr/ARButton.js#L4
 *
 * Threejs:
 *  - camera per default looks into negative z direction
 *  - assuming camara starts off being held out horizontally:
 *  - z: out of the screen, x: right, y: up
 *
 * WebXR:
 *
 * Lingo:
 *  - user agent: the browser (in most normal cases)
 *  - viewer: the device in front of the user's eyes
 *  - inline: on page, before having clicked on `start AR` button
 *
 * Classes:
 *  - Session
 *  - ReferenceSpace:
 *      - headset and controllers have their own, different coordinate spaces
 *      - the controller's position must be mapped to the headset's space
 *      - `ReferenceSpaces` are spaces that allow being related to other spaces
 *      - different types:
 *          - local: 0/0/0 is at user's head when the app starts
 *          - bounded-floor: user not expected to leave a certain area
 *          - local-floor: like local, but 0/0/0 is at floor level at the user's feet
 *          - unbounded: users can walk as far as they wish
 *          - viewer: 0/0/0 *stays* at the user's head
 *      - obtaining:
 *          - overall world-space: XRSession.requestReferenceSpace()
 *  - XRViewerPose:
 *      - contains the matrix/es representing the users head
 *      - there may be multiple matrices (called `views`) associated with a viewer-pose (eg. when the device has one camera per eye)
 *  - Layer:
 *    - webgl-layer (usually set to be the base-layer)
 *    - webpgu-layer
 *    - composite-layer
 *      - quad-layer: place an image in the scene: much crisper than if placed in webgl-layer, but doesn't participate in depth-testing
 *
 *
 *
 * Concepts:
 *  - depth:
 *    - expensive: lidar
 *    - phones usually estimate depth by changing focal-length and measuring where image is sharpest
 *      not as good as lidar, but ok and cheap
 *  - occlusion: https://www.youtube.com/watch?v=ywtNVL-nkAw
 *    - problem: real world is rendered to screen first, then threejs world
 *    - solution: custom shader: take depth-map from real world, compare with threejs-depth map, make all threejs transparent where real world is closer.
 *    - caveats:
 *      - requires camera to be in motion a bit and occluding objects to be mostly static.
 *      - doesn't seem to work well in landscape mode?
 *    - alternative solution: use shadow-object and make it non-transparent
 */

const app = document.getElementById('app') as HTMLDivElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const renderer = new WebGLRenderer({
  alpha: true,
  canvas,
  failIfMajorPerformanceCaveat: true,
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;

const button = ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test', 'depth-sensing'],
  depthSensing: {
    usagePreference: ['cpu-optimized', 'gpu-optimized'],
    dataFormatPreference: ['luminance-alpha', 'float32'],
  },
});
app.appendChild(button);

const scene = new Scene();

const solarSystem = new Group();
solarSystem.position.set(0, 0, -2);
scene.add(solarSystem);

const sun = new Mesh(new SphereGeometry(0.5, 32, 32), new MeshBasicMaterial({ color: 'yellow' }));
solarSystem.add(sun);

const earthOrbit = new Group();
solarSystem.add(earthOrbit);
const earth = new Mesh(new SphereGeometry(0.2, 32, 32), new MeshBasicMaterial({ color: 'blue' }));
earth.position.set(2, 0, 0);
earthOrbit.add(earth);

const lunarOrbit = new Group();
earth.add(lunarOrbit);
const moon = new Mesh(new SphereGeometry(0.1, 32, 32), new MeshBasicMaterial({ color: 'gray' }));
moon.position.set(0.5, 0, 0);
lunarOrbit.add(moon);

const reticle = new Mesh(new RingGeometry(0.1, 0.2, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial());
reticle.visible = false;
reticle.matrixAutoUpdate = false;
scene.add(reticle);

class HtsMgmt {
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

function placeReticle(reticle: Mesh, hts: XRHitTestSource, frame: XRFrame, xr: WebXRManager) {
  const hitTestResults = frame.getHitTestResults(hts);

  function onErr() {
    reticle.visible = false;
  }

  if (hitTestResults.length) {
    const hit = hitTestResults[0];
    const baseRefSpace = xr.getReferenceSpace();
    if (!baseRefSpace) return onErr();
    const pose = hit.getPose(baseRefSpace);
    if (!pose) return onErr();
    reticle.matrix.fromArray(pose.transform.matrix);
    reticle.visible = true;
  } else {
    return onErr();
  }
}

class DepthMgmt {
  //   private session!: XRSession;
  private rootRefSpace!: XRReferenceSpace | XRBoundedReferenceSpace;

  constructor(private xr: WebXRManager) {}

  private initOngoing = false;
  public async init() {
    if (this.initOngoing) return;
    this.initOngoing = true;
    const session = this.xr.getSession();
    if (!session) throw Error();
    const rootRefSpace = await session.requestReferenceSpace('local');
    // this.session = session;
    this.rootRefSpace = rootRefSpace;
    this.initOngoing = false;
  }

  public getDepth(frame: XRFrame) {
    if (!this.rootRefSpace) {
      this.init();
      return;
    }

    const pose = frame.getViewerPose(this.rootRefSpace);
    if (!pose) return;
    const view = pose.views[0];
    if (!frame.getDepthInformation) return;
    const depthInformation = frame.getDepthInformation(view);
    if (!depthInformation) return;
    return depthInformation;
  }
}

const htsMgmt = new HtsMgmt(renderer.xr);
const depthMgmt = new DepthMgmt(renderer.xr);

button.addEventListener('click', () => {
  renderer.setAnimationLoop((_, frame) => {
    const hts = htsMgmt.getHts();
    if (hts) placeReticle(reticle, hts, frame, renderer.xr);

    const depth = depthMgmt.getDepth(frame);
    console.log(depth);

    earthOrbit.rotateY(0.01);
    lunarOrbit.rotateY(0.04);

    renderer.render(scene, renderer.xr.getCamera());
  });
});
