import {
    AdditiveBlending,
    CircleGeometry,
    DataTexture,
    DepthFormat,
    FloatType,
    Group,
    Line,
    LinearFilter,
    LuminanceAlphaFormat,
    LuminanceFormat,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    PCFSoftShadowMap,
    PointLight,
    RedFormat,
    Scene,
    SphereGeometry,
    Texture,
    TextureLoader,
    UnsignedByteType,
    Vector2,
    Vector3,
    WebGLProgramParametersWithUniforms,
    WebGLRenderer,
} from "three";
import { ARButton, HTMLMesh } from "three/examples/jsm/Addons.js";

import { StateMgmt } from "./state_mgmt";
import { PickHelper, SpinningCursor } from "./utils";

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
 *    - but pretty new. There is a polyfill (https://github.com/immersive-web/webxr-layers-polyfill) but not working well with threejs
 *
 *
 *
 * Threejs:
 *  - threejs doesn't do post-processing in webxr: https://discourse.threejs.org/t/is-it-possible-to-use-threejs-postprocessing-in-web-vr/36333
 *  - currently, threejs only creates glBinding if the webxr-layers-module is active: https://github.com/mrdoob/three.js/blob/423f285d5d868dd128d6f143dc8ec31154018f57/src/renderers/webxr/WebXRManager.js#L282
 *  - currently, threejs only supports gpu-optimized depth-sensing: https://github.com/mrdoob/three.js/blob/423f285d5d868dd128d6f143dc8ec31154018f57/src/renderers/webxr/WebXRManager.js#L775
 *      - the syntax for cpu-optimized sensing is different: frame.getDepthInformation(views[0])
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

// import WebXRLayersPolyfill from "./webxr_layers_polyfill.js";
// let layersPolyfill = new WebXRLayersPolyfill();

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
        requiredFeatures: ["hit-test", "dom-overlay", "depth-sensing"],
        optionalFeatures: [],
        domOverlay: {
            root: overlay,
        },
        depthSensing: {
            usagePreference: ["cpu-optimized"],
            dataFormatPreference: ["luminance-alpha", "float32"],
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
     * Depth material
     ****************************************************************************************************/

    // https://github.com/graemeniedermayer/ArExperiments/blob/main/javascript/depthDiscard.js
    // https://github.com/graemeniedermayer/ArExperiments/blob/302c2021874dc7fd3f016ee81a172ba2ffbb4c22/html/depthOcclusion.html#L21
    // https://discourse.threejs.org/t/data3dtexture-where-each-pixel-is-16-bits-precision/49321/6

    const realWorldDepthData = new Uint8Array(160 * 90);
    const realWorldDepth = new DataTexture(realWorldDepthData, 160, 90, RedFormat, UnsignedByteType);
    realWorldDepth.magFilter = LinearFilter;

    const myBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        shader.uniforms.realWorldDepth = { value: realWorldDepth };

        let token = "#include <common>";
        let insert = /* glsl */ `
                uniform sampler2D realWorldDepth;
            `;
        shader.fragmentShader = shader.fragmentShader.replace(token, token + insert);

        token = "#include <dithering_fragment>";
        insert = /* glsl */ `
                float depth = texture(realWorldDepth, vMapUv).x;
                gl_FragColor.a = (1.0 - depth) / 1.0;
                gl_FragColor = vec4(depth, depth, depth, 1.0);
            `;
        shader.fragmentShader = shader.fragmentShader.replace(token, token + insert);
    };

    /****************************************************************************************************
     * solar system
     ****************************************************************************************************/

    const scene = new Scene();

    const solarSystem = new Group();
    solarSystem.position.set(0, 0, -4);
    scene.add(solarSystem);

    const sun = new Mesh(
        new SphereGeometry(0.5, 32, 32),
        new MeshBasicMaterial({ color: "yellow", map: sunTex, depthTest: true, depthWrite: true })
    );
    sun.userData["name"] = "sun";
    sun.material.onBeforeCompile = myBeforeCompile;
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
    earth.material.onBeforeCompile = myBeforeCompile;
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
    lights.material.onBeforeCompile = myBeforeCompile;

    const clouds = new Mesh(
        new SphereGeometry(0.205, 32, 32),
        new MeshLambertMaterial({ transparent: true, map: earthCloudTex })
    );
    clouds.receiveShadow = true;
    earth.add(clouds);
    clouds.material.onBeforeCompile = myBeforeCompile;

    const lunarOrbit = new Group();
    earth.add(lunarOrbit);
    const moon = new Mesh(new SphereGeometry(0.1, 32, 32), new MeshPhongMaterial({ map: moonTex }));
    moon.castShadow = true;
    moon.receiveShadow = true;
    moon.userData["name"] = "moon";
    moon.material.onBeforeCompile = myBeforeCompile;
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

    function redScaleDepth(depth: number, dMin: number, dMax: number) {
        const rMin = 0;
        const rMax = 255;
        const frac = (depth - dMin) / (dMax - dMin);
        const r = frac * (rMax - rMin) + rMin;
        return [r, 0, 0, 255];
    }

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

        renderer.setAnimationLoop((time: number, frame: XRFrame) => {
            const state = stateMgmt.getCurrentState();
            if (!state.vrActive) return;
            const camera = renderer.xr.getCamera();

            // @ts-ignore
            if (renderer.xr.getDepthTextureCpu) {
                // @ts-ignore
                const depthCpu = renderer.xr.getDepthTextureCpu();
                // @ts-ignore
                if (depthCpu && depthCpu.type === "uint16") {
                    const dsci = depthCpu.depthSensingCpuInfo;
                    const colorArr = new Uint8ClampedArray(dsci.width * dsci.height * 4);
                    let i = 0;
                    for (let r = 0; r < dsci.height; r++) {
                        for (let c = 0; c < dsci.width; c++) {
                            // @ts-ignore
                            const depth = renderer.xr.getDepthTextureCpuInMeters(r, c);
                            const color = redScaleDepth(depth, 0, 10);
                            colorArr[i + 0] = color[0];
                            colorArr[i + 1] = color[1];
                            colorArr[i + 2] = color[2];
                            colorArr[i + 3] = color[3];
                            i += 4;
                        }
                    }
                    const ctx = depthContainer.getContext("2d");
                    depthContainer.width = dsci.width;
                    depthContainer.height = dsci.height;
                    const imgData = new ImageData(colorArr, dsci.width, dsci.height);
                    ctx!.putImageData(imgData, 0, 0);

                    // parse as uint16
                    const uint16data = new Uint16Array(dsci.data);
                    // cast to uint8
                    const uint8data = new Uint8Array(uint16data);
                    // upload
                    realWorldDepthData.set(uint8data);
                    realWorldDepth.needsUpdate = true;

                    console.log({ uint16: uint16data.slice(100, 110), unt8: uint8data.slice(100, 110) });
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
const container = document.getElementById("app") as HTMLDivElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const depthContainer = document.getElementById("depthContainer") as HTMLCanvasElement;

async function run() {
    try {
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
