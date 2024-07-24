import {
    BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, PointLight, RingGeometry, Scene,
    WebGLRenderer
} from "three";
import { ARButton } from "three/examples/jsm/Addons.js";


/**
 * https://threejs.org/manual/#en/webxr-look-to-select
 * https://github.com/mrdoob/three.js/blob/master/examples/webxr_ar_hittest.html#L120
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
 *
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

let hitTestSourceRequested = false;
async function loop(time: DOMHighResTimeStamp, frame: XRFrame) {
  let hitTestSource: XRHitTestSource | undefined;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const session = renderer.xr.getSession();

  if (session && session.requestHitTestSource && hitTestSourceRequested === false) {
    const viewerReferenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = (await session.requestHitTestSource({ space: viewerReferenceSpace })) as XRHitTestSource;
    session.addEventListener('end', () => {
      hitTestSourceRequested = false;
      hitTestSource = undefined;
    });
  }

  if (hitTestSource) {
    //   const hitTestResults = frame.
  }

  cube.rotateY(0.01);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop);
