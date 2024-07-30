import {
    AdditiveBlending,
    CircleGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    PCFSoftShadowMap,
    PointLight,
    Scene,
    SphereGeometry,
    Texture,
    TextureLoader,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";
import { ARButton, HTMLMesh } from "three/examples/jsm/Addons.js";

import { StateMgmt } from "./state_mgmt";
import { SpinningCursor, PickHelper } from "./utils";
import { RawCameraMgmt } from "./webxr";

/**
 * https://threejs.org/manual/#en/webxr-look-to-select
 * https://github.com/mrdoob/three.js/blob/master/examples/webxr_ar_hittest.html#L120
 * https://github.com/mrdoob/three.js/blob/067f8a0ccc1d508a8819ba3fa0ea066be40e432c/examples/jsm/webxr/ARButton.js#L4
 * https://glitch.com/edit/#!/complete-webxr?path=README.md%3A1%3A0
 *
 * Threejs:
 *  - camera per default looks into negative z direction
 *  - assuming camera starts off being held out horizontally:
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
 *
 *
 * Concepts:
 *
 *  - depth:
 *    - expensive: lidar (some apple devices have that)
 *    - phones usually estimate depth by changing focal-length and measuring where image is sharpest
 *      not as good as lidar, but ok and cheap
 *
 *  - occlusion: https://www.youtube.com/watch?v=ywtNVL-nkAw
 *    - https://github.com/immersive-web/depth-sensing/blob/main/explainer.md
 *    - problem: real world is rendered to screen first, then threejs world
 *    - solution: custom shader: take depth-map from real world, compare with threejs-depth map, make all threejs transparent where real world is closer.
 *          - might be able to use post-processing instead of a per-object shader (advantage: can keep the complex Phong-Shaders that threejs gives by default)
 *    - caveats:
 *      - requires camera to be in motion a bit and occluding objects to be mostly static.
 *      - doesn't seem to work well in landscape mode?
 *    - alternative solution: use shadow-object and make it non-transparent
 *    - alternative solution: use tensorflow-js to read the camera-feed and estimate depth
 *          - problem with that: needs access to the camera(s), which requires a lot of calculations: https://immersive-web.github.io/raw-camera-access/
 *
 * - raw camera access
 *      - https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md
 *
 *  - marker tracking
 *      - https://github.com/immersive-web/marker-tracking/blob/main/explainer.md
 *
 *  - html
 *      - DOM-overlay: places html over canvas without any perspective effect on them.
 *          - think of a always-on HUD
 *          - https://github.com/immersive-web/dom-overlays/blob/main/explainer.md
 *      - as part of scene: use threejs'es HtmlMesh
 *          - but that uses html2canvas, which is icky: doesn't play well with images, not full css support.
 *          - some caveats for HtmlMesh
 *              - requires you to get some dom from the window, you can't create new dom on the fly.
 *              - doesn't display back-side per default
 *              - doesn't work in browser-AR-emulator
 *              - html2canvas doesn't automatically do line-breaks: https://discourse.threejs.org/t/htmlmesh-incorrect-text-line-break/49227
 *      - as a separate layer: use layer-api
 *
 * - Layer:
 *    - https://github.com/immersive-web/layers/blob/main/explainer.md
 *    - good for performance and legibility:
 *      - can have different resolutions (eg low for webgl, high for text-overlays)
 *      - layers need less render-pipeline, and no depth.testing (or some such)
 *    - webgl-layer (usually set to be the base-layer)
 *    - webpgu-layer
 *    - composite-layer
 *      - quad-layer: place an image in the scene: much crisper than if placed in webgl-layer, but doesn't participate in depth-testing
 *    - threejs actually supports layers: https://threejs.org/examples/webxr_vr_layers.html
 *
 *
 *
 * Emulation:
 *  - I have an AMD-ryzen on a gigabyte-motherboard
 *  - enable hardware accelleration in bios: https://support.salad.com/article/281-enable-virtualization-by-motherboard-gigabyte
 *  - ensure that android studio uses hardware acceleration: https://developer.android.com/studio/run/emulator-acceleration
 *  - create a device: https://developers.google.com/ar/develop/c/emulator
 *      - must use x86 or x86_64 architecture and at least api 33
 *  - verify that XR works in device: https://immersive-web.github.io/webxr-samples/tests/
 *  - maybe: install AR-core package separately? https://stackoverflow.com/questions/49818161/cant-install-arcore-emulator-for-android-studio?rq=3
 *      - installation instructions: https://developers.google.com/ar/develop/java/emulator#update-arcore
 *
 */

async function main(
    container: HTMLDivElement,
    canvas: HTMLCanvasElement,
    overlay: HTMLDivElement,
    sunTex: Texture,
    moonTex: Texture,
    earthTex: Texture,
    earthSpecularTex: Texture,
    earthNormalTex: Texture,
    earthCloudTex: Texture,
    earthNightTex: Texture,
    sunCoronaTex: Texture
) {
    /****************************************************************************************************
     * root elements
     ****************************************************************************************************/

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const renderer = new WebGLRenderer({
        alpha: true,
        canvas,
        failIfMajorPerformanceCaveat: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap; // default THREE.PCFShadowMap

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;

    const button = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test", "dom-overlay"],
        optionalFeatures: ["depth-sensing", "camera-access"],
        domOverlay: {
            root: overlay,
        },
    });
    container.appendChild(button);

    const stateMgmt = new StateMgmt({
        vrActive: false,
        running: true,
        gazedPlanet: undefined,
        selectedPlanet: undefined,
    });

    const pickingDuration = 750;

    const picker = new PickHelper(pickingDuration);

    /****************************************************************************************************
     * solar system
     ****************************************************************************************************/

    const scene = new Scene();

    const solarSystem = new Group();
    solarSystem.position.set(0, 0, -4);
    scene.add(solarSystem);

    const sun = new Mesh(new SphereGeometry(0.5, 32, 32), new MeshBasicMaterial({ color: "yellow", map: sunTex }));
    sun.userData["name"] = "sun";
    solarSystem.add(sun);
    const sunLight = new PointLight("white", 10);
    sunLight.castShadow = true;
    //Set up shadow properties for the light
    sunLight.shadow.mapSize.width = 512; // default
    sunLight.shadow.mapSize.height = 512; // default
    sunLight.shadow.camera.near = 0.5; // default
    sunLight.shadow.camera.far = 500; // default
    sun.add(sunLight);

    const sunBloomGeometry = new CircleGeometry(0.6, 32);
    const sunBloom = new Mesh(
        sunBloomGeometry,
        new MeshBasicMaterial({
            transparent: true,
            map: sunCoronaTex,
            opacity: 0.125,
        })
    );
    const sunBloom2 = new Mesh(
        sunBloomGeometry,
        new MeshBasicMaterial({
            transparent: true,
            map: sunCoronaTex,
            opacity: 0.07,
        })
    );
    solarSystem.add(sunBloom);
    solarSystem.add(sunBloom2);

    const earthOrbit = new Group();
    solarSystem.add(earthOrbit);
    const earth = new Mesh(
        new SphereGeometry(0.2, 32, 32),
        new MeshPhongMaterial({
            map: earthTex,
            specularMap: earthSpecularTex,
            normalMap: earthNormalTex,
            bumpScale: 2,
        })
    );
    earth.userData["name"] = "earth";
    earth.position.set(2, 0, 0);
    earth.castShadow = true;
    earth.receiveShadow = true;
    earthOrbit.add(earth);

    const lights = new Mesh(
        new SphereGeometry(0.2, 32, 32),
        new MeshBasicMaterial({
            map: earthNightTex,
            blending: AdditiveBlending,
        })
    );
    earth.add(lights);

    const clouds = new Mesh(
        new SphereGeometry(0.205, 32, 32),
        new MeshLambertMaterial({ transparent: true, map: earthCloudTex })
    );
    clouds.receiveShadow = true;
    earth.add(clouds);

    const lunarOrbit = new Group();
    earth.add(lunarOrbit);
    const moon = new Mesh(new SphereGeometry(0.1, 32, 32), new MeshPhongMaterial({ map: moonTex }));
    moon.castShadow = true;
    moon.receiveShadow = true;
    moon.userData["name"] = "moon";
    moon.position.set(0.5, 0, 0);
    lunarOrbit.add(moon);

    function getPlanetInfoMesh(planet: Mesh, orbit: Group, offset?: Vector3) {
        const name = planet.userData["name"];
        const dom = document.getElementById(`${name}Info`) as HTMLDivElement;
        const infoBox = new HTMLMesh(dom);
        if (!offset) offset = new Vector3(1, 1, 0);
        infoBox.position.set(planet.position.x + offset.x, planet.position.y + offset.y, planet.position.z + offset.z);
        infoBox.scale.setScalar(3);
        orbit.add(infoBox);
        return infoBox;
    }

    const planetData: {
        [name: string]: {
            mesh: Mesh;
            orbit: Group;
            info: HTMLMesh;
        };
    } = {
        sun: {
            mesh: sun,
            orbit: solarSystem,
            info: getPlanetInfoMesh(sun, solarSystem),
        },
        moon: {
            mesh: moon,
            orbit: lunarOrbit,
            info: getPlanetInfoMesh(moon, earthOrbit, new Vector3(0, 1, 0)),
        },
        earth: {
            mesh: earth,
            orbit: earthOrbit,
            info: getPlanetInfoMesh(earth, earthOrbit),
        },
    };

    const cursor = new SpinningCursor(1, pickingDuration);
    const rawCameraMgmt = new RawCameraMgmt(renderer);

    /****************************************************************************************************
     * loop
     ****************************************************************************************************/
    button.addEventListener("click", () => {
        stateMgmt.handleAction({ type: "app init", payload: {} });

        setTimeout(() => {
            const session = renderer.xr.getSession();
            if (session) {
                console.log(session.enabledFeatures);
                dn.innerHTML = session.enabledFeatures?.join(" ") || "";
            }
        }, 1000);

        renderer.setAnimationLoop((time, frame) => {
            const state = stateMgmt.getCurrentState();
            if (!state.vrActive) return;
            const camera = renderer.xr.getCamera();

            if (frame) {
                const rawTextures = rawCameraMgmt.getRawWebGlTextureRefs(frame);
                if (rawTextures.length) {
                    const { texture, height, width } = rawTextures[0];
                    rawCameraMgmt.drawWebGlTextureIntoCorner(texture, width, height);
                }
            }

            // state-input

            const { object, fraction } = picker.pick(new Vector2(0, 0), scene, camera, time);
            if (object && object.userData["name"])
                stateMgmt.handleAction({
                    type: "Gazing",
                    payload: { planet: object.userData["name"], fraction },
                });
            else
                stateMgmt.handleAction({
                    type: "Gazing",
                    payload: { planet: undefined, fraction: undefined },
                });

            // state-output

            if (state.gazedPlanet) {
                const { mesh, info: _ } = planetData[state.gazedPlanet];
                const cursorMesh = cursor.getMesh();
                const meshRadius = mesh.geometry?.boundingSphere?.radius;
                if (meshRadius) cursorMesh.scale.setScalar(1.2 * meshRadius);
                cursorMesh.visible = true;
                mesh.add(cursorMesh);
                cursor.update(time, state.gazedPlanet);
                cursorMesh.lookAt(camera.position);
            } else {
                cursor.getMesh().visible = false;
            }

            for (const [name, { mesh: _, info }] of Object.entries(planetData)) {
                if (name === state.selectedPlanet) {
                    info.visible = true;
                    info.lookAt(camera.position);
                } else {
                    info.visible = false;
                }
            }

            if (state.running) {
                sun.rotateY(-0.005);
                earth.rotateY(0.1);
                clouds.rotateY(-0.01);
                moon.rotateY(0.01);
                earthOrbit.rotateY(0.01);
                lunarOrbit.rotateY(0.02);
                sunBloom.lookAt(camera.position);
                sunBloom.rotateZ(time / 10_000);
                sunBloom2.lookAt(camera.position);
                sunBloom2.rotateZ(-time / 10_000);
            }

            renderer.render(scene, camera);
        });
    });

    stateMgmt.listen((state) => {
        if (state.vrActive) overlay.style.setProperty("visibility", "visible");
        else overlay.style.setProperty("visibility", "hidden");
    });

    /****************************************************************************************************
     * hud
     ****************************************************************************************************/
    const exitButton = document.getElementById("exit") as HTMLButtonElement;
    const pauseButton = document.getElementById("stop") as HTMLButtonElement;
    const selection = document.getElementById("planets") as HTMLSelectElement;

    exitButton.addEventListener("click", (_) => stateMgmt.handleAction({ type: "app exit", payload: {} }));
    pauseButton.addEventListener("click", (_) => {
        if (pauseButton.innerHTML.includes("□")) stateMgmt.handleAction({ type: "pause", payload: {} });
        else stateMgmt.handleAction({ type: "play", payload: {} });
    });
    selection.addEventListener("change", (evt: any) =>
        stateMgmt.handleAction({
            type: "selection",
            payload: { planet: evt.target.value },
        })
    );

    stateMgmt.listen((state) => {
        if (state.running) pauseButton.innerHTML = "□";
        else pauseButton.innerHTML = "▷";
        if (state.selectedPlanet) selection.value = state.selectedPlanet;
        else selection.value = "none";
        if (!state.vrActive) {
            renderer.xr.getSession()?.end();
        }
    });
}

/****************************************************************************************************
 * Entrypoint, catching possible errors
 ****************************************************************************************************/

const dn = document.getElementById("debugNotes") as HTMLDivElement;

async function run() {
    try {
        const container = document.getElementById("app") as HTMLDivElement;
        const canvas = document.getElementById("canvas") as HTMLCanvasElement;
        const overlay = document.getElementById("overlay") as HTMLDivElement;

        const tl = new TextureLoader();
        const [
            sunTexture,
            moonTexture,
            earthTexture,
            earthSpecularTex,
            earthNormalTex,
            earthCloudTex,
            earthNightTex,
            sunCoronaTex,
        ] = await Promise.all([
            tl.loadAsync("./2k_sun.jpg"),
            tl.loadAsync("./2k_moon.jpg"),
            tl.loadAsync("./2k_earth_daymap.jpg"),
            tl.loadAsync("./2k_earth_specular_map.jpg"),
            tl.loadAsync("./2k_earth_normal_map.jpg"),
            tl.loadAsync("./2k_earth_clouds.png"),
            tl.loadAsync("./2k_earth_nightmap.jpg"),
            tl.loadAsync("./sun_corona.png"),
        ]);

        main(
            container,
            canvas,
            overlay,
            sunTexture,
            moonTexture,
            earthTexture,
            earthSpecularTex,
            earthNormalTex,
            earthCloudTex,
            earthNightTex,
            sunCoronaTex
        );
    } catch (error) {
        console.error(error);
        dn.innerHTML = JSON.stringify(error);
    }
}
run();
