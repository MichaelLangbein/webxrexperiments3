import {
    TextureLoader,
    WebGLRenderer,
    WebXRManager,
    Event,
    PCFSoftShadowMap,
    AdditiveBlending,
    CircleGeometry,
    DataTexture,
    FloatType,
    Group,
    LinearFilter,
    Mesh,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    PointLight,
    RedFormat,
    Scene,
    SphereGeometry,
    Vector2,
    Vector3,
    WebGLProgramParametersWithUniforms,
    PerspectiveCamera,
    Texture,
} from "three";
import { ARButton, HTMLMesh } from "three/examples/jsm/Addons.js";
import { PickHelper, SpinningCursor } from "./utils";

type Body = "sun" | "earth" | "moon";

const dn = document.getElementById("debugNotes") as HTMLDivElement;
const container = document.getElementById("app") as HTMLDivElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const depthContainer = document.getElementById("depthContainer") as HTMLCanvasElement;
const exitButton = document.getElementById("exit") as HTMLButtonElement;
const pauseButton = document.getElementById("stop") as HTMLButtonElement;
const selection = document.getElementById("planets") as HTMLSelectElement;

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

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

/**
 * Responsible for
 *  - managing threejs scene
 *  - using depth-data
 */
class SceneMgmt {
    readonly scene: Scene;
    readonly sun: Mesh;
    readonly earth: Mesh;
    readonly clouds: Mesh;
    readonly moon: Mesh;
    readonly earthOrbit: Group;
    readonly lunarOrbit: Group;
    readonly sunBloom: Mesh;
    readonly sunBloom2: Mesh;
    readonly picker: PickHelper;
    readonly cursor: SpinningCursor;
    private planetData: { [name: string]: { mesh: Mesh; orbit: Group; info: HTMLMesh } };
    private realWorldDepthData?: Float32Array;
    private realWorldDepth?: DataTexture;
    private coordTrans?: Vector2;

    constructor(private depth: "none" | "cpu" | "gpu") {
        const pickingDuration = 750;
        const picker = new PickHelper(pickingDuration);

        const scene = new Scene();

        const solarSystem = new Group();
        solarSystem.position.set(0, 0, -2);
        scene.add(solarSystem);

        const sun = new Mesh(
            new SphereGeometry(0.5, 32, 32),
            new MeshBasicMaterial({ map: sunTexture, depthTest: true, depthWrite: true })
        );
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
                map: earthTexture,
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
        const moon = new Mesh(new SphereGeometry(0.1, 32, 32), new MeshPhongMaterial({ map: moonTexture }));
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
            infoBox.position.set(
                planet.position.x + offset.x,
                planet.position.y + offset.y,
                planet.position.z + offset.z
            );
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

        this.scene = scene;
        this.sun = sun;
        this.earth = earth;
        this.clouds = clouds;
        this.moon = moon;
        this.earthOrbit = earthOrbit;
        this.lunarOrbit = lunarOrbit;
        this.sunBloom = sunBloom;
        this.sunBloom2 = sunBloom2;
        this.picker = picker;
        this.cursor = cursor;
        this.planetData = planetData;

        if (this.depth === "cpu") {
            // https://github.com/graemeniedermayer/ArExperiments/blob/main/javascript/depthDiscard.js
            // https://github.com/graemeniedermayer/ArExperiments/blob/302c2021874dc7fd3f016ee81a172ba2ffbb4c22/html/depthOcclusion.html#L21
            // https://discourse.threejs.org/t/data3dtexture-where-each-pixel-is-16-bits-precision/49321/6

            const realWorldDepthData = new Float32Array(160 * 90);
            const realWorldDepth = new DataTexture(realWorldDepthData, 160, 90, RedFormat, FloatType);
            realWorldDepth.magFilter = LinearFilter;
            const coordTrans = new Vector2();

            this.realWorldDepthData = realWorldDepthData;
            this.realWorldDepth = realWorldDepth;
            this.coordTrans = coordTrans;

            const myBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
                shader.uniforms.realWorldDepth = { value: realWorldDepth };
                shader.uniforms.coordTrans = { value: coordTrans };

                // vertex: register varying `zDepthScene`
                let token = "#include <common>";
                let insert = `
                varying float zDepthScene;
            `;
                shader.vertexShader = shader.vertexShader.replace(token, token + insert);

                // vertex: output varying `zDepthScene`
                token = "#include <project_vertex>";
                insert = `
                zDepthScene = -1.0 * mvPosition.z;
            `;
                shader.vertexShader = shader.vertexShader.replace(token, token + insert);

                // fragment: register realWorldDepth texture
                token = "#include <common>";
                insert = `
                    varying float zDepthScene;
                    uniform sampler2D realWorldDepth;
                    uniform vec2 coordTrans; 
                `;
                shader.fragmentShader = shader.fragmentShader.replace(token, token + insert);

                // fragment: read from realWorldDepth texture
                token = "#include <dithering_fragment>";
                insert = `
                    vec2 coord = coordTrans * gl_FragCoord.xy + vec2(1.0,1.0);
                    float zDepthReal = texture2D(realWorldDepth, coord.yx).x;
    
                    // if depth-information given at all:
                    if (zDepthReal > 0.01) {
                        // if "distance to object" > "distance to next wall":
                        if (zDepthScene > zDepthReal * 1.1) {
                            gl_FragColor.a = 0.01;
                        }
                    }
    
                `;
                shader.fragmentShader = shader.fragmentShader.replace(token, token + insert);
            };

            sun.material.onBeforeCompile = myBeforeCompile;
            earth.material.onBeforeCompile = myBeforeCompile;
            lights.material.onBeforeCompile = myBeforeCompile;
            clouds.material.onBeforeCompile = myBeforeCompile;
            moon.material.onBeforeCompile = myBeforeCompile;
        }
    }

    animate(time: number, frame: XRFrame, camera: PerspectiveCamera, depthData: DepthInfo, activeBody?: Body) {
        // 1: picker & cursor
        const { object, fraction } = this.picker.pick(new Vector2(0, 0), this.scene, camera, time);
        if (object && fraction < 1.0) {
            const cursorMesh = this.cursor.getMesh();
            const meshRadius = (object as Mesh).geometry?.boundingSphere?.radius;
            if (meshRadius) cursorMesh.scale.setScalar(1.2 * meshRadius);
            cursorMesh.visible = true;
            object.add(cursorMesh);
            const id = object.userData["name"];
            this.cursor.update(time, id);
            cursorMesh.lookAt(camera.position);
        } else {
            this.cursor.getMesh().visible = false;
        }

        // 2. highlighting
        for (const [name, { mesh: _, info }] of Object.entries(this.planetData)) {
            if (name === activeBody) {
                info.visible = true;
                info.lookAt(camera.position);
            } else {
                info.visible = false;
            }
        }

        // 3. movement
        this.sun.rotateY(-0.005);
        this.earth.rotateY(0.1);
        this.clouds.rotateY(-0.01);
        this.moon.rotateY(0.01);
        this.earthOrbit.rotateY(0.01);
        this.lunarOrbit.rotateY(0.02);
        this.sunBloom.lookAt(camera.position);
        this.sunBloom.rotateZ(time / 10_000);
        this.sunBloom2.lookAt(camera.position);
        this.sunBloom2.rotateZ(-time / 10_000);

        // 4. update depth textures
        if (this.depth === "cpu" && depthData["cpu"]) {
            const { depthSensingCpuInfo, type, viewport } = depthData["cpu"];
            if (type === "uint16") {
                /**
                 * Uploading depth data to GPU.
                 * We could directly upload the raw data ...
                 * ... but the raw data is Ui16, for which there is no common WebGL texture-format.
                 * One could use Ui8, but then we loose every value > 255.
                 * So the next best thing is to use f32 ... and since this requires some re-scaling anyway,
                 * we might as well do the `rawValueToMeters` multiplication here on the CPU.
                 * Would be more performant on the GPU, of course.
                 */
                // parse as uint16
                const uint16data = new Uint16Array(depthSensingCpuInfo.data);
                // cast to uint8
                const float32data = new Float32Array(uint16data.length);
                for (let i = 0; i < uint16data.length; i++) {
                    float32data[i] = uint16data[i] * depthSensingCpuInfo.rawValueToMeters;
                }
                // upload
                this.realWorldDepthData!.set(float32data);
                this.realWorldDepth!.needsUpdate = true;
                this.coordTrans!.x = -1 / viewport.width;
                this.coordTrans!.y = -1 / viewport.height;
            }
        } else if (this.depth === "gpu" && depthData["gpu"]) {
            // @TODO
        }

        // 5. return current state
        return { scene: this.scene, gazedObject: object, pickFraction: fraction };
    }
}

interface DepthInfo {
    cpu?: { depthSensingCpuInfo: XRCPUDepthInformation; type: "uint16" | "float32"; viewport: XRViewport };
    gpu?: Texture;
}

interface State {
    session: boolean;
    playing: boolean;
    pickedBody?: Body;
}

/**
 * Responsible for
 *  - handling webxr state
 *      - pick gpu or cpu depth
 *  - handling app state
 *  - handling user events
 */
class App {
    readonly renderer: WebGLRenderer;
    private sceneMgmt?: SceneMgmt;
    private state: State;
    private subscribers: ((state: State) => void)[] = [];

    constructor(initialState: State) {
        const renderer = new WebGLRenderer({
            alpha: true,
            antialias: true,
            canvas: canvas,
            depth: true,
        });
        renderer.xr.enabled = true;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFSoftShadowMap;
        renderer.setPixelRatio(window.devicePixelRatio);

        renderer.xr.addEventListener("sessionstart", (evt) => this.onSessionStart(evt));
        renderer.xr.addEventListener("sessionend", (evt) => this.onSessionEnd(evt));
        renderer.setAnimationLoop((time, frame) => this.onAnimationLoop(time, frame));

        const arb = ARButton.createButton(renderer, {
            requiredFeatures: ["dom-overlay"],
            optionalFeatures: ["depth-sensing", "hit-test"],
            depthSensing: {
                usagePreference: ["cpu-optimized", "gpu-optimized"],
                dataFormatPreference: ["luminance-alpha"],
            },
        });

        container.append(arb);

        this.renderer = renderer;
        this.state = initialState;
    }

    private onSessionStart(evt: Event<"sessionstart", WebXRManager>) {
        const session = evt.target.getSession();
        if (!session) throw new Error("Couldn't get hold of session");
        if (session.enabledFeatures?.includes("depth-sensing")) {
            if (session.depthUsage === "gpu-optimized") {
                this.sceneMgmt = new SceneMgmt("gpu");
            } else {
                this.sceneMgmt = new SceneMgmt("cpu");
            }
        } else {
            this.sceneMgmt = new SceneMgmt("none");
        }
    }

    private onSessionEnd(evt: Event<"sessionend", WebXRManager>) {
        overlay.style.setProperty("visibility", "hidden");
    }

    private onAnimationLoop(time: number, frame?: XRFrame) {
        if (!this.state.playing) return;

        if (!this.sceneMgmt) return;
        if (!frame) return;
        const session = frame.session;
        const xrRefSpace = this.renderer.xr.getReferenceSpace();
        if (!xrRefSpace) return;
        const baseLayer = session.renderState.baseLayer;
        if (!baseLayer) return;
        const pose = frame.getViewerPose(xrRefSpace);
        if (!pose) return;

        // @TODO: should there be one camera and one scene per view?
        for (const view of pose.views) {
            const viewport = baseLayer.getViewport(view);
            if (!viewport) return;

            const depthData = this.getDepthData(session, viewport);
            const camera = this.renderer.xr.getCamera();
            const { scene, gazedObject, pickFraction } = this.sceneMgmt.animate(
                time,
                frame,
                camera,
                depthData,
                this.state.pickedBody
            );
            this.renderer.render(scene, camera);

            if (gazedObject && pickFraction > 0.99) {
                const pickedBody = gazedObject.userData["name"];
                this.setState({ ...this.state, pickedBody });
            }
        }
    }

    private getDepthData(session: XRSession, viewport: XRViewport): DepthInfo {
        const depthData: DepthInfo = {};
        if (session.enabledFeatures?.includes("depth-sensing")) {
            if (session.depthUsage === "gpu-optimized") {
                const depthTextue = this.renderer.xr.getDepthTexture();
                depthData["gpu"] = depthTextue || undefined;
            } else {
                // @ts-ignore
                const depthInfo = this.renderer.xr.getDepthTextureCpu();
                if (depthInfo) {
                    depthData["cpu"] = {
                        depthSensingCpuInfo: depthInfo.depthSensingCpuInfo,
                        type: depthInfo.type,
                        viewport,
                    };
                } else {
                    depthData["cpu"] = undefined;
                }
            }
        }
        return depthData;
    }

    public onBodyPicked(pickedBody: Body | undefined) {
        this.setState({ ...this.state, pickedBody });
    }

    public setPlaying(playing: boolean) {
        this.setState({ ...this.state, playing });
    }

    public onExitClicked() {
        this.setState({ pickedBody: undefined, playing: false, session: false });
    }

    public watchState(cb: (state: State) => void) {
        this.subscribers.push(cb);
    }

    private setState(state: State) {
        this.state = state;
        for (const cb of this.subscribers) {
            cb(this.state);
        }
        if (state.session === false) this.renderer.xr.getSession()?.end();
    }
}

const app = new App({ session: false, playing: true, pickedBody: undefined });

exitButton.addEventListener("click", (_) => app.onExitClicked());
pauseButton.addEventListener("click", (_) => {
    if (pauseButton.innerHTML.includes("□")) app.setPlaying(false);
    else app.setPlaying(true);
});
selection.addEventListener("change", (evt: any) => app.onBodyPicked(evt.target.value));
app.watchState((state) => {
    if (state.session) overlay.style.setProperty("visibility", "visible");
    else overlay.style.setProperty("visibility", "hidden");
    if (state.playing) pauseButton.innerHTML = "□";
    else pauseButton.innerHTML = "▷";
    if (state.pickedBody) selection.value = state.pickedBody;
    else selection.value = "none";
});
