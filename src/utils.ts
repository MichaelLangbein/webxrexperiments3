import {
    Camera,
    CustomBlending,
    DataTexture,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    NearestFilter,
    Object3D,
    Object3DEventMap,
    OneMinusDstColorFactor,
    OneMinusSrcColorFactor,
    Raycaster,
    Scene,
    TorusGeometry,
    Vector2,
} from 'three';

export class PickHelper {
    private raycaster: Raycaster;
    private pickedObject?: Object3D;

    constructor(readonly selectDuration: number) {
        this.raycaster = new Raycaster();
        this.pickedObject = undefined;
    }

    private lastTime = 0;
    private selectTimer = 0;
    pick(normalizedPosition: Vector2, scene: Scene, camera: Camera, time: number) {
        const elapsedTime = time - this.lastTime;
        this.lastTime = time;

        const lastPickedObject = this.pickedObject;
        this.pickedObject = undefined;

        // cast a ray through the frustum
        this.raycaster.setFromCamera(normalizedPosition, camera);
        // get the list of objects the ray intersected
        const intersectedObjects = this.raycaster.intersectObjects(scene.children);
        if (intersectedObjects.length) {
            // pick the first object. It's the closest one
            this.pickedObject = intersectedObjects[0].object;
        }

        let selected = false;
        if (this.pickedObject && lastPickedObject === this.pickedObject) {
            this.selectTimer += elapsedTime;
            if (this.selectTimer >= this.selectDuration) {
                this.selectTimer = 0;
                selected = true;
            }
        } else {
            this.selectTimer = 0;
        }

        return {
            object: this.pickedObject,
            fraction: selected ? 1 : this.selectTimer / this.selectDuration,
        };
    }
}

export function objectIsMesh(object: Object3D): object is Mesh {
    return object instanceof Mesh;
}

export class SpinningCursor {
    private cursor: Mesh<TorusGeometry, MeshBasicMaterial, Object3DEventMap>;
    private texture: DataTexture;

    constructor(radius: number, private selectDuration: number) {
        const cursorTexture = new DataTexture(new Uint8Array([64, 64, 64, 64, 255, 255, 255, 255]), 2, 1);
        cursorTexture.minFilter = NearestFilter;
        cursorTexture.magFilter = NearestFilter;
        cursorTexture.needsUpdate = true;

        const cursor = new Mesh(
            new TorusGeometry(radius, 0.1, 4, 64),
            new MeshBasicMaterial({
                color: 'white',
                map: cursorTexture,
                transparent: true,
                blending: CustomBlending,
                blendSrc: OneMinusDstColorFactor,
                blendDst: OneMinusSrcColorFactor,
            })
        );
        cursor.visible = false;

        this.cursor = cursor;
        this.texture = cursorTexture;
    }

    getMesh() {
        return this.cursor;
    }

    update(time: number) {
        const fromStart = 0;
        const fromEnd = this.selectDuration;
        const toStart = -0.5;
        const toEnd = 0.5;
        this.texture.offset.x = MathUtils.mapLinear(time % this.selectDuration, fromStart, fromEnd, toStart, toEnd);
    }
}
