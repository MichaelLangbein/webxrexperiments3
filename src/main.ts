import {
    AxesHelper,
    BoxGeometry,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    PointLight,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';
import { ARButton } from 'three/examples/jsm/Addons.js';

/**
 * Threejs:
 *  - camera per default looks into negative z direction
 *  - assuming camara starts off being held out horizontally:
 *  - z: out of the screen, x: right, y: up
 *  -
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
renderer.xr.enabled = true;

const arb = ARButton.createButton(renderer, {
    // type: https://immersive-web.github.io/webxr/#feature-dependencies
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

const light = new PointLight('white', 1);
scene.add(light);

function loop() {
    cube.rotateY(0.01);
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop);
