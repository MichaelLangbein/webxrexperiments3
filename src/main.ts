import {
    BoxGeometry, Mesh, MeshBasicMaterial, RingGeometry, Scene, WebGLRenderer, WebXRManager
} from "three";
import { ARButton } from "three/examples/jsm/Addons.js";


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
  requiredFeatures: ['hit-test'],
});
app.appendChild(button);

const scene = new Scene();
const cube = new Mesh(new BoxGeometry(0.2, 0.2, 0.2, 2, 2, 2), new MeshBasicMaterial());
cube.position.set(0, 0, -2);
scene.add(cube);

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

const htsMgmt = new HtsMgmt(renderer.xr);

button.addEventListener('click', () => {
  renderer.setAnimationLoop((time, frame) => {
    const hts = htsMgmt.getHts();
    if (hts) placeReticle(reticle, hts, frame, renderer.xr);

    cube.rotateY(0.01);
    renderer.render(scene, renderer.xr.getCamera());
  });
});
