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
import { OrbitControls as Controlls } from 'three/examples/jsm/Addons.js';

/**
 * Threejs: camera per default looks into negative x direction
 */

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const renderer = new WebGLRenderer({
    alpha: false,
    antialias: true,
    canvas: canvas,
});

const scene = new Scene();

const camera = new PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(-10, 0, 0);
camera.lookAt(new Vector3(0, 0, 0));
// scene.add(camera);

const controls = new Controlls(camera, canvas);

const ah = new AxesHelper(3);
ah.position.set(0, 0, 0);
scene.add(ah);

const cube = new Mesh(
    new BoxGeometry(1, 1, 1, 2, 2, 2),
    new MeshBasicMaterial({
        color: 'green',
    })
);
cube.position.set(2, 2, 0);
scene.add(cube);

const light = new PointLight('white', 1);
scene.add(light);

const loopTime = 30;
function loop() {
    const startTime = new Date().getTime();

    controls.update(loopTime);
    cube.rotateOnAxis(new Vector3(1, 1, 1), 0.01);
    renderer.render(scene, camera);

    const endTime = new Date().getTime();
    const timePassed = endTime - startTime;
    const timeLeft = loopTime - timePassed;
    setTimeout(() => requestAnimationFrame(loop), timeLeft);
}

loop();
