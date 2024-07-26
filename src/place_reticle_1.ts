import {
    BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, PointLight, RingGeometry, Scene,
    WebGLRenderer
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
 */

const container = document.getElementById('app') as HTMLDivElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const renderer = new WebGLRenderer({
  alpha: true,
  antialias: true,
  canvas: canvas,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;

const arb = ARButton.createButton(renderer, {
  // type: https://immersive-web.github.io/webxr/#feature-dependencies
  requiredFeatures: ['hit-test'],
});

container.appendChild(arb);

const scene = new Scene();

const camera = new PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 1.6, 0);

const cube = new Mesh(
  new BoxGeometry(0.2, 0.2, 0.2, 2, 2, 2),
  new MeshBasicMaterial({
    color: 'green',
  })
);
cube.position.set(0, 1.6, -2);
scene.add(cube);

const reticle = new Mesh(new RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial());
// we will calculate position and rotation manually on every frame
reticle.matrixAutoUpdate = false;
reticle.visible = false; // only made visible when hitting wall or floor
scene.add(reticle);

const light = new PointLight('white', 1);
scene.add(light);

const controller = renderer.xr.getController(0);
controller.addEventListener('select', (evt) => {
  console.log(evt);
});

class XrMgmt {
  public getHitTestSource() {
    if (this.hitTestSource) return this.hitTestSource;
    else {
      this.watchHitTestSource();
      return undefined;
    }
  }

  private hitTestSource: XRHitTestSource | undefined;
  private requestOngoing = false;

  private async watchHitTestSource() {
    if (this.requestOngoing) return;
    console.log('getting hittestsource');
    this.requestOngoing = true;

    // session: lasts from click on "start ar" until click on "stop ar"
    const session = renderer.xr.getSession();
    if (!session || !session.requestHitTestSource) {
      this.requestOngoing = false;
      return;
    }

    // viewerRefSpace: 0/0/0 is at user's head all the time
    const viewerRefSpace = await session.requestReferenceSpace('viewer');
    console.log({ viewerRefSpace });
    this.hitTestSource = await session.requestHitTestSource({ space: viewerRefSpace });
    this.requestOngoing = false;

    if (this.hitTestSource) {
      console.log('got hittestsource');
      session.addEventListener('end', () => {
        this.requestOngoing = false;
        this.hitTestSource = undefined;
        console.log('lost session');
      });
    }
  }
}

function placeReticle(hitTestSource: XRHitTestSource, frame: XRFrame) {
  const hitTestResults = frame.getHitTestResults(hitTestSource);

  if (hitTestResults.length) {
    const hit = hitTestResults[0];
    reticle.visible = true;

    // localRefSpace: 0/0/0 is at user's head when the app starts
    const localReferenceSpace = renderer.xr.getReferenceSpace();
    if (!localReferenceSpace) return;
    console.log({ rootRefSpace: localReferenceSpace });
    const pose = hit.getPose(localReferenceSpace!);
    if (!pose) return;
    reticle.matrix.fromArray(pose!.transform.matrix);
  } else {
    reticle.visible = false;
  }
}

const webXrMgmt = new XrMgmt();

/**
 * 1. viewerRefSpace -> hitTestSource        <-- get hit-test from user's current head
 * 2. frame + hitTestSource -> hit
 * 3. localRefSpace + hit -> pose            <-- calculate pose relative to model-space, which has origin where user's head *was* at *start* of app
 * 4. reticle.matrix = pose.matrix
 *
 */

async function loop(_: DOMHighResTimeStamp, frame: XRFrame) {
  const hitTestSource = webXrMgmt.getHitTestSource();
  if (hitTestSource) placeReticle(hitTestSource, frame);

  cube.rotateY(0.01);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop);
