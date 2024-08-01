import {
    ArrayCamera,
    DepthFormat,
    DepthStencilFormat,
    DepthTexture,
    EventDispatcher,
    Mesh,
    PerspectiveCamera,
    PlaneGeometry,
    RGBAFormat,
    ShaderMaterial,
    Texture,
    UnsignedByteType,
    UnsignedInt248Type,
    UnsignedIntType,
    Vector2,
    Vector3,
    Vector4,
    WebGLRenderer,
    WebGLRenderTarget,
} from "three";
import { RAD2DEG } from "three/src/math/MathUtils.js";


function WebGLAnimation() {

    let context = null;
    let isAnimating = false;
    let animationLoop = null;
    let requestId = null;

    function onAnimationFrame(time, frame) {

        animationLoop(time, frame);

        requestId = context.requestAnimationFrame(onAnimationFrame);

    }

    return {

        start: function () {

            if (isAnimating === true) return;
            if (animationLoop === null) return;

            requestId = context.requestAnimationFrame(onAnimationFrame);

            isAnimating = true;

        },

        stop: function () {

            context.cancelAnimationFrame(requestId);

            isAnimating = false;

        },

        setAnimationLoop: function (callback) {

            animationLoop = callback;

        },

        setContext: function (value) {

            context = value;

        }

    };

}

class WebXRController {

    constructor() {

        this._targetRay = null;
        this._grip = null;
        this._hand = null;

    }

    getHandSpace() {

        if (this._hand === null) {

            this._hand = new Group();
            this._hand.matrixAutoUpdate = false;
            this._hand.visible = false;

            this._hand.joints = {};
            this._hand.inputState = { pinching: false };

        }

        return this._hand;

    }

    getTargetRaySpace() {

        if (this._targetRay === null) {

            this._targetRay = new Group();
            this._targetRay.matrixAutoUpdate = false;
            this._targetRay.visible = false;
            this._targetRay.hasLinearVelocity = false;
            this._targetRay.linearVelocity = new Vector3();
            this._targetRay.hasAngularVelocity = false;
            this._targetRay.angularVelocity = new Vector3();

        }

        return this._targetRay;

    }

    getGripSpace() {

        if (this._grip === null) {

            this._grip = new Group();
            this._grip.matrixAutoUpdate = false;
            this._grip.visible = false;
            this._grip.hasLinearVelocity = false;
            this._grip.linearVelocity = new Vector3();
            this._grip.hasAngularVelocity = false;
            this._grip.angularVelocity = new Vector3();

        }

        return this._grip;

    }

    dispatchEvent(event) {

        if (this._targetRay !== null) {

            this._targetRay.dispatchEvent(event);

        }

        if (this._grip !== null) {

            this._grip.dispatchEvent(event);

        }

        if (this._hand !== null) {

            this._hand.dispatchEvent(event);

        }

        return this;

    }

    connect(inputSource) {

        if (inputSource && inputSource.hand) {

            const hand = this._hand;

            if (hand) {

                for (const inputjoint of inputSource.hand.values()) {

                    // Initialize hand with joints when connected
                    this._getHandJoint(hand, inputjoint);

                }

            }

        }

        this.dispatchEvent({ type: 'connected', data: inputSource });

        return this;

    }

    disconnect(inputSource) {

        this.dispatchEvent({ type: 'disconnected', data: inputSource });

        if (this._targetRay !== null) {

            this._targetRay.visible = false;

        }

        if (this._grip !== null) {

            this._grip.visible = false;

        }

        if (this._hand !== null) {

            this._hand.visible = false;

        }

        return this;

    }

    update(inputSource, frame, referenceSpace) {

        let inputPose = null;
        let gripPose = null;
        let handPose = null;

        const targetRay = this._targetRay;
        const grip = this._grip;
        const hand = this._hand;

        if (inputSource && frame.session.visibilityState !== 'visible-blurred') {

            if (hand && inputSource.hand) {

                handPose = true;

                for (const inputjoint of inputSource.hand.values()) {

                    // Update the joints groups with the XRJoint poses
                    const jointPose = frame.getJointPose(inputjoint, referenceSpace);

                    // The transform of this joint will be updated with the joint pose on each frame
                    const joint = this._getHandJoint(hand, inputjoint);

                    if (jointPose !== null) {

                        joint.matrix.fromArray(jointPose.transform.matrix);
                        joint.matrix.decompose(joint.position, joint.rotation, joint.scale);
                        joint.matrixWorldNeedsUpdate = true;
                        joint.jointRadius = jointPose.radius;

                    }

                    joint.visible = jointPose !== null;

                }

                // Custom events

                // Check pinchz
                const indexTip = hand.joints['index-finger-tip'];
                const thumbTip = hand.joints['thumb-tip'];
                const distance = indexTip.position.distanceTo(thumbTip.position);

                const distanceToPinch = 0.02;
                const threshold = 0.005;

                if (hand.inputState.pinching && distance > distanceToPinch + threshold) {

                    hand.inputState.pinching = false;
                    this.dispatchEvent({
                        type: 'pinchend',
                        handedness: inputSource.handedness,
                        target: this
                    });

                } else if (!hand.inputState.pinching && distance <= distanceToPinch - threshold) {

                    hand.inputState.pinching = true;
                    this.dispatchEvent({
                        type: 'pinchstart',
                        handedness: inputSource.handedness,
                        target: this
                    });

                }

            } else {

                if (grip !== null && inputSource.gripSpace) {

                    gripPose = frame.getPose(inputSource.gripSpace, referenceSpace);

                    if (gripPose !== null) {

                        grip.matrix.fromArray(gripPose.transform.matrix);
                        grip.matrix.decompose(grip.position, grip.rotation, grip.scale);
                        grip.matrixWorldNeedsUpdate = true;

                        if (gripPose.linearVelocity) {

                            grip.hasLinearVelocity = true;
                            grip.linearVelocity.copy(gripPose.linearVelocity);

                        } else {

                            grip.hasLinearVelocity = false;

                        }

                        if (gripPose.angularVelocity) {

                            grip.hasAngularVelocity = true;
                            grip.angularVelocity.copy(gripPose.angularVelocity);

                        } else {

                            grip.hasAngularVelocity = false;

                        }

                    }

                }

            }

            if (targetRay !== null) {

                inputPose = frame.getPose(inputSource.targetRaySpace, referenceSpace);

                // Some runtimes (namely Vive Cosmos with Vive OpenXR Runtime) have only grip space and ray space is equal to it
                if (inputPose === null && gripPose !== null) {

                    inputPose = gripPose;

                }

                if (inputPose !== null) {

                    targetRay.matrix.fromArray(inputPose.transform.matrix);
                    targetRay.matrix.decompose(targetRay.position, targetRay.rotation, targetRay.scale);
                    targetRay.matrixWorldNeedsUpdate = true;

                    if (inputPose.linearVelocity) {

                        targetRay.hasLinearVelocity = true;
                        targetRay.linearVelocity.copy(inputPose.linearVelocity);

                    } else {

                        targetRay.hasLinearVelocity = false;

                    }

                    if (inputPose.angularVelocity) {

                        targetRay.hasAngularVelocity = true;
                        targetRay.angularVelocity.copy(inputPose.angularVelocity);

                    } else {

                        targetRay.hasAngularVelocity = false;

                    }

                    this.dispatchEvent(_moveEvent);

                }

            }


        }

        if (targetRay !== null) {

            targetRay.visible = (inputPose !== null);

        }

        if (grip !== null) {

            grip.visible = (gripPose !== null);

        }

        if (hand !== null) {

            hand.visible = (handPose !== null);

        }

        return this;

    }

    // private method

    _getHandJoint(hand, inputjoint) {

        if (hand.joints[inputjoint.jointName] === undefined) {

            const joint = new Group();
            joint.matrixAutoUpdate = false;
            joint.visible = false;
            hand.joints[inputjoint.jointName] = joint;

            hand.add(joint);

        }

        return hand.joints[inputjoint.jointName];

    }

}

const _occlusion_vertex = `
void main() {

	gl_Position = vec4( position, 1.0 );

}`;

const _occlusion_fragment = `
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;

class WebXRDepthSensing {
    constructor() {
        this.texture = null;
        this.mesh = null;

        this.depthNear = 0;
        this.depthFar = 0;
    }

    init(renderer, depthData, renderState) {
        if (this.texture === null) {
            const texture = new Texture();

            const texProps = renderer.properties.get(texture);
            texProps.__webglTexture = depthData.texture;

            if (depthData.depthNear != renderState.depthNear || depthData.depthFar != renderState.depthFar) {
                this.depthNear = depthData.depthNear;
                this.depthFar = depthData.depthFar;
            }

            this.texture = texture;
        }
    }

    getMesh(cameraXR) {
        if (this.texture !== null) {
            if (this.mesh === null) {
                const viewport = cameraXR.cameras[0].viewport;
                const material = new ShaderMaterial({
                    vertexShader: _occlusion_vertex,
                    fragmentShader: _occlusion_fragment,
                    uniforms: {
                        depthColor: { value: this.texture },
                        depthWidth: { value: viewport.z },
                        depthHeight: { value: viewport.w },
                    },
                });

                this.mesh = new Mesh(new PlaneGeometry(20, 20), material);
            }
        }

        return this.mesh;
    }

    reset() {
        this.texture = null;
        this.mesh = null;
    }

    getDepthTexture() {
        return this.texture;
    }
}

export class WebXRManager extends EventDispatcher {
    constructor(renderer, gl) {
        super();

        const scope = this;

        let session = null;

        let framebufferScaleFactor = 1.0;

        let referenceSpace = null;
        let referenceSpaceType = "local-floor";
        // Set default foveation to maximum.
        let foveation = 1.0;
        let customReferenceSpace = null;

        let pose = null;
        let glBinding = null;
        let glProjLayer = null;
        let glBaseLayer = null;
        let xrFrame = null;

        const depthSensing = new WebXRDepthSensing();
        let depthSensingCpuInfo = undefined;
        let depthSensingFrame = undefined;
        const attributes = gl.getContextAttributes();

        let initialRenderTarget = null;
        let newRenderTarget = null;

        const controllers = [];
        const controllerInputSources = [];

        const currentSize = new Vector2();
        let currentPixelRatio = null;

        //

        const cameraL = new PerspectiveCamera();
        cameraL.layers.enable(1);
        cameraL.viewport = new Vector4();

        const cameraR = new PerspectiveCamera();
        cameraR.layers.enable(2);
        cameraR.viewport = new Vector4();

        const cameras = [cameraL, cameraR];

        const cameraXR = new ArrayCamera();
        cameraXR.layers.enable(1);
        cameraXR.layers.enable(2);

        let _currentDepthNear = null;
        let _currentDepthFar = null;

        //

        this.cameraAutoUpdate = true;
        this.enabled = false;

        this.isPresenting = false;

        this.getController = function (index) {
            let controller = controllers[index];

            if (controller === undefined) {
                controller = new WebXRController();
                controllers[index] = controller;
            }

            return controller.getTargetRaySpace();
        };

        this.getControllerGrip = function (index) {
            let controller = controllers[index];

            if (controller === undefined) {
                controller = new WebXRController();
                controllers[index] = controller;
            }

            return controller.getGripSpace();
        };

        this.getHand = function (index) {
            let controller = controllers[index];

            if (controller === undefined) {
                controller = new WebXRController();
                controllers[index] = controller;
            }

            return controller.getHandSpace();
        };

        //

        function onSessionEvent(event) {
            const controllerIndex = controllerInputSources.indexOf(event.inputSource);

            if (controllerIndex === -1) {
                return;
            }

            const controller = controllers[controllerIndex];

            if (controller !== undefined) {
                controller.update(event.inputSource, event.frame, customReferenceSpace || referenceSpace);
                controller.dispatchEvent({ type: event.type, data: event.inputSource });
            }
        }

        function onSessionEnd() {
            session.removeEventListener("select", onSessionEvent);
            session.removeEventListener("selectstart", onSessionEvent);
            session.removeEventListener("selectend", onSessionEvent);
            session.removeEventListener("squeeze", onSessionEvent);
            session.removeEventListener("squeezestart", onSessionEvent);
            session.removeEventListener("squeezeend", onSessionEvent);
            session.removeEventListener("end", onSessionEnd);
            session.removeEventListener("inputsourceschange", onInputSourcesChange);

            for (let i = 0; i < controllers.length; i++) {
                const inputSource = controllerInputSources[i];

                if (inputSource === null) continue;

                controllerInputSources[i] = null;

                controllers[i].disconnect(inputSource);
            }

            _currentDepthNear = null;
            _currentDepthFar = null;

            depthSensing.reset();

            // restore framebuffer/rendering state

            renderer.setRenderTarget(initialRenderTarget);

            glBaseLayer = null;
            glProjLayer = null;
            glBinding = null;
            session = null;
            newRenderTarget = null;

            //

            animation.stop();

            scope.isPresenting = false;

            renderer.setPixelRatio(currentPixelRatio);
            renderer.setSize(currentSize.width, currentSize.height, false);

            scope.dispatchEvent({ type: "sessionend" });
        }

        this.setFramebufferScaleFactor = function (value) {
            framebufferScaleFactor = value;

            if (scope.isPresenting === true) {
                console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.");
            }
        };

        this.setReferenceSpaceType = function (value) {
            referenceSpaceType = value;

            if (scope.isPresenting === true) {
                console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.");
            }
        };

        this.getReferenceSpace = function () {
            return customReferenceSpace || referenceSpace;
        };

        this.setReferenceSpace = function (space) {
            customReferenceSpace = space;
        };

        this.getBaseLayer = function () {
            return glProjLayer !== null ? glProjLayer : glBaseLayer;
        };

        this.getBinding = function () {
            return glBinding;
        };

        this.getFrame = function () {
            return xrFrame;
        };

        this.getSession = function () {
            return session;
        };

        this.setSession = async function (value) {
            session = value;

            if (session !== null) {
                initialRenderTarget = renderer.getRenderTarget();

                session.addEventListener("select", onSessionEvent);
                session.addEventListener("selectstart", onSessionEvent);
                session.addEventListener("selectend", onSessionEvent);
                session.addEventListener("squeeze", onSessionEvent);
                session.addEventListener("squeezestart", onSessionEvent);
                session.addEventListener("squeezeend", onSessionEvent);
                session.addEventListener("end", onSessionEnd);
                session.addEventListener("inputsourceschange", onInputSourcesChange);

                if (attributes.xrCompatible !== true) {
                    await gl.makeXRCompatible();
                }

                currentPixelRatio = renderer.getPixelRatio();
                renderer.getSize(currentSize);

                // glBinding: created with or without `layers` support
                glBinding = new XRWebGLBinding(session, gl);

                // if layer-module is not active
                // https://developer.mozilla.org/en-US/docs/Web/API/XRRenderState/layers
                // actually: most likely not available in most browsers as of now:
                // https://developer.mozilla.org/en-US/docs/Web/API/XRRenderState/layers#browser_compatibility
                if (session.renderState.layers === undefined) {
                    const layerInit = {
                        antialias: attributes.antialias,
                        alpha: true,
                        depth: attributes.depth,
                        stencil: attributes.stencil,
                        framebufferScaleFactor: framebufferScaleFactor,
                    };

                    glBaseLayer = new XRWebGLLayer(session, gl, layerInit);

                    session.updateRenderState({ baseLayer: glBaseLayer });

                    renderer.setPixelRatio(1);
                    renderer.setSize(glBaseLayer.framebufferWidth, glBaseLayer.framebufferHeight, false);

                    newRenderTarget = new WebGLRenderTarget(
                        glBaseLayer.framebufferWidth,
                        glBaseLayer.framebufferHeight,
                        {
                            format: RGBAFormat,
                            type: UnsignedByteType,
                            colorSpace: renderer.outputColorSpace,
                            stencilBuffer: attributes.stencil,
                        }
                    );
                } else {
                    let depthFormat = null;
                    let depthType = null;
                    let glDepthFormat = null;

                    if (attributes.depth) {
                        glDepthFormat = attributes.stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24;
                        depthFormat = attributes.stencil ? DepthStencilFormat : DepthFormat;
                        depthType = attributes.stencil ? UnsignedInt248Type : UnsignedIntType;
                    }

                    const projectionlayerInit = {
                        colorFormat: gl.RGBA8,
                        depthFormat: glDepthFormat,
                        scaleFactor: framebufferScaleFactor,
                    };

                    // glBinding = new XRWebGLBinding( session, gl );

                    glProjLayer = glBinding.createProjectionLayer(projectionlayerInit);

                    session.updateRenderState({ layers: [glProjLayer] });

                    renderer.setPixelRatio(1);
                    renderer.setSize(glProjLayer.textureWidth, glProjLayer.textureHeight, false);

                    newRenderTarget = new WebGLRenderTarget(glProjLayer.textureWidth, glProjLayer.textureHeight, {
                        format: RGBAFormat,
                        type: UnsignedByteType,
                        depthTexture: new DepthTexture(
                            glProjLayer.textureWidth,
                            glProjLayer.textureHeight,
                            depthType,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            depthFormat
                        ),
                        stencilBuffer: attributes.stencil,
                        colorSpace: renderer.outputColorSpace,
                        samples: attributes.antialias ? 4 : 0,
                        resolveDepthBuffer: glProjLayer.ignoreDepthValues === false,
                    });
                }

                newRenderTarget.isXRRenderTarget = true; // TODO Remove this when possible, see #23278

                this.setFoveation(foveation);

                customReferenceSpace = null;
                referenceSpace = await session.requestReferenceSpace(referenceSpaceType);

                animation.setContext(session);
                animation.start();

                scope.isPresenting = true;

                scope.dispatchEvent({ type: "sessionstart" });
            }
        };

        this.getEnvironmentBlendMode = function () {
            if (session !== null) {
                return session.environmentBlendMode;
            }
        };

        this.getDepthTexture = function () {
            return depthSensing.getDepthTexture();
        };

        this.getDepthTextureCpu = function () {
            if (!session || !depthSensingCpuInfo) return undefined;
            if (!depthSensingFrame || depthSensingFrame.active !== true) return undefined;
            if (session.depthDataFormat === "luminance-alpha") {
                const uint16Data = new Uint16Array(depthSensingCpuInfo.data);
                return { ...depthSensingCpuInfo, type: "uint16", data: uint16Data };
            } else if (session.depthDataFormat === "float32") {
                const float32Data = new Float32Array(depthSensingCpuInfo.data);
                return { ...depthSensingCpuInfo, type: "float32", data: float32Data };
            }
            return undefined;
        };

        this.getDepthTextureCpuInMeters = function (r, c) {
            // Alternatively, the depth data is also available via the depthInfo.data attribute.
            // The entries are stored in a row-major order, without padding, and the entry size & data format
            // is determined by the depth format that can be queried from the XRSession.
            // The raw values obtained from the buffer can be converted to meters by multiplying the value by depthInfo.rawValueToMeters.
            // For example, to access the data at row r, column c of the buffer that has "luminance-alpha" format, the app can use:
            if (!depthSensingCpuInfo) return undefined;
            if (session.depthDataFormat === "luminance-alpha") {
                const uint16Data = new Uint16Array(depthSensingCpuInfo.data);
                const index = c + r * depthSensingCpuInfo.width;
                const depthInMetres = uint16Data[index] * depthSensingCpuInfo.rawValueToMeters;
                return depthInMetres;
            } else if (session.depthDataFormat === "float32") {
                const float32Data = new Float32Array(depthSensingCpuInfo.data);
                const index = c + r * depthSensingCpuInfo.width;
                const depthInMetres = float32Data[index] * depthSensingCpuInfo.rawValueToMeters;
                return depthInMetres;
            }
        };

        this.getDepthNormalizedViewCoords = function (r, c) {
            // Normalize depth buffer coordinates (c, r) to range [0...1]:
            const normDepthBufferCoordinates = [
                c / depthSensingCpuInfo.width,
                r / depthSensingCpuInfo.height,
                0.0,
                1.0,
            ];
            const normViewFromNormDepthBuffer = depthSensingCpuInfo.normDepthBufferFromNormView.inverse.matrix;

            // Transform to normalized view coordinates (with the origin in upper left corner of the screen),
            // using your favorite matrix multiplication library:
            const normalizedViewCoordinates = normViewFromNormDepthBuffer * normDepthBufferCoordinates;

            // The above can also be denormalized to obtain absolute coordinates using viewport dimensions:
            const viewCoordinates = [
                normalizedViewCoordinates[0] * viewport.width,
                normalizedViewCoordinates[1] * viewport.height,
            ];

            return { normalizedViewCoordinates, viewCoordinates };
        };

        function onInputSourcesChange(event) {
            // Notify disconnected

            for (let i = 0; i < event.removed.length; i++) {
                const inputSource = event.removed[i];
                const index = controllerInputSources.indexOf(inputSource);

                if (index >= 0) {
                    controllerInputSources[index] = null;
                    controllers[index].disconnect(inputSource);
                }
            }

            // Notify connected

            for (let i = 0; i < event.added.length; i++) {
                const inputSource = event.added[i];

                let controllerIndex = controllerInputSources.indexOf(inputSource);

                if (controllerIndex === -1) {
                    // Assign input source a controller that currently has no input source

                    for (let i = 0; i < controllers.length; i++) {
                        if (i >= controllerInputSources.length) {
                            controllerInputSources.push(inputSource);
                            controllerIndex = i;
                            break;
                        } else if (controllerInputSources[i] === null) {
                            controllerInputSources[i] = inputSource;
                            controllerIndex = i;
                            break;
                        }
                    }

                    // If all controllers do currently receive input we ignore new ones

                    if (controllerIndex === -1) break;
                }

                const controller = controllers[controllerIndex];

                if (controller) {
                    controller.connect(inputSource);
                }
            }
        }

        //

        const cameraLPos = new Vector3();
        const cameraRPos = new Vector3();

        /**
         * Assumes 2 cameras that are parallel and share an X-axis, and that
         * the cameras' projection and world matrices have already been set.
         * And that near and far planes are identical for both cameras.
         * Visualization of this technique: https://computergraphics.stackexchange.com/a/4765
         */
        function setProjectionFromUnion(camera, cameraL, cameraR) {
            cameraLPos.setFromMatrixPosition(cameraL.matrixWorld);
            cameraRPos.setFromMatrixPosition(cameraR.matrixWorld);

            const ipd = cameraLPos.distanceTo(cameraRPos);

            const projL = cameraL.projectionMatrix.elements;
            const projR = cameraR.projectionMatrix.elements;

            // VR systems will have identical far and near planes, and
            // most likely identical top and bottom frustum extents.
            // Use the left camera for these values.
            const near = projL[14] / (projL[10] - 1);
            const far = projL[14] / (projL[10] + 1);
            const topFov = (projL[9] + 1) / projL[5];
            const bottomFov = (projL[9] - 1) / projL[5];

            const leftFov = (projL[8] - 1) / projL[0];
            const rightFov = (projR[8] + 1) / projR[0];
            const left = near * leftFov;
            const right = near * rightFov;

            // Calculate the new camera's position offset from the
            // left camera. xOffset should be roughly half `ipd`.
            const zOffset = ipd / (-leftFov + rightFov);
            const xOffset = zOffset * -leftFov;

            // TODO: Better way to apply this offset?
            cameraL.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
            camera.translateX(xOffset);
            camera.translateZ(zOffset);
            camera.matrixWorld.compose(camera.position, camera.quaternion, camera.scale);
            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

            // Find the union of the frustum values of the cameras and scale
            // the values so that the near plane's position does not change in world space,
            // although must now be relative to the new union camera.
            const near2 = near + zOffset;
            const far2 = far + zOffset;
            const left2 = left - xOffset;
            const right2 = right + (ipd - xOffset);
            const top2 = ((topFov * far) / far2) * near2;
            const bottom2 = ((bottomFov * far) / far2) * near2;

            camera.projectionMatrix.makePerspective(left2, right2, top2, bottom2, near2, far2);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        }

        function updateCamera(camera, parent) {
            if (parent === null) {
                camera.matrixWorld.copy(camera.matrix);
            } else {
                camera.matrixWorld.multiplyMatrices(parent.matrixWorld, camera.matrix);
            }

            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        }

        this.updateCamera = function (camera) {
            if (session === null) return;

            if (depthSensing.texture !== null) {
                camera.near = depthSensing.depthNear;
                camera.far = depthSensing.depthFar;
            }

            cameraXR.near = cameraR.near = cameraL.near = camera.near;
            cameraXR.far = cameraR.far = cameraL.far = camera.far;

            if (_currentDepthNear !== cameraXR.near || _currentDepthFar !== cameraXR.far) {
                // Note that the new renderState won't apply until the next frame. See #18320

                session.updateRenderState({
                    depthNear: cameraXR.near,
                    depthFar: cameraXR.far,
                });

                _currentDepthNear = cameraXR.near;
                _currentDepthFar = cameraXR.far;

                cameraL.near = _currentDepthNear;
                cameraL.far = _currentDepthFar;
                cameraR.near = _currentDepthNear;
                cameraR.far = _currentDepthFar;

                cameraL.updateProjectionMatrix();
                cameraR.updateProjectionMatrix();
                camera.updateProjectionMatrix();
            }

            const parent = camera.parent;
            const cameras = cameraXR.cameras;

            updateCamera(cameraXR, parent);

            for (let i = 0; i < cameras.length; i++) {
                updateCamera(cameras[i], parent);
            }

            // update projection matrix for proper view frustum culling

            if (cameras.length === 2) {
                setProjectionFromUnion(cameraXR, cameraL, cameraR);
            } else {
                // assume single camera setup (AR)

                cameraXR.projectionMatrix.copy(cameraL.projectionMatrix);
            }

            // update user camera and its children

            updateUserCamera(camera, cameraXR, parent);
        };

        function updateUserCamera(camera, cameraXR, parent) {
            if (parent === null) {
                camera.matrix.copy(cameraXR.matrixWorld);
            } else {
                camera.matrix.copy(parent.matrixWorld);
                camera.matrix.invert();
                camera.matrix.multiply(cameraXR.matrixWorld);
            }

            camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
            camera.updateMatrixWorld(true);

            camera.projectionMatrix.copy(cameraXR.projectionMatrix);
            camera.projectionMatrixInverse.copy(cameraXR.projectionMatrixInverse);

            if (camera.isPerspectiveCamera) {
                camera.fov = RAD2DEG * 2 * Math.atan(1 / camera.projectionMatrix.elements[5]);
                camera.zoom = 1;
            }
        }

        this.getCamera = function () {
            return cameraXR;
        };

        this.getFoveation = function () {
            if (glProjLayer === null && glBaseLayer === null) {
                return undefined;
            }

            return foveation;
        };

        this.setFoveation = function (value) {
            // 0 = no foveation = full resolution
            // 1 = maximum foveation = the edges render at lower resolution

            foveation = value;

            if (glProjLayer !== null) {
                glProjLayer.fixedFoveation = value;
            }

            if (glBaseLayer !== null && glBaseLayer.fixedFoveation !== undefined) {
                glBaseLayer.fixedFoveation = value;
            }
        };

        this.hasDepthSensing = function () {
            return depthSensing.texture !== null;
        };

        this.getDepthSensingMesh = function () {
            return depthSensing.getMesh(cameraXR);
        };

        // Animation Loop

        let onAnimationFrameCallback = null;

        function onAnimationFrame(time, frame) {
            pose = frame.getViewerPose(customReferenceSpace || referenceSpace);
            xrFrame = frame;

            if (pose !== null) {
                const views = pose.views;

                if (glBaseLayer !== null) {
                    renderer.setRenderTargetFramebuffer(newRenderTarget, glBaseLayer.framebuffer);
                    renderer.setRenderTarget(newRenderTarget);
                }

                let cameraXRNeedsUpdate = false;

                // check if it's necessary to rebuild cameraXR's camera list

                if (views.length !== cameraXR.cameras.length) {
                    cameraXR.cameras.length = 0;
                    cameraXRNeedsUpdate = true;
                }

                for (let i = 0; i < views.length; i++) {
                    const view = views[i];

                    let viewport = null;

                    if (glBaseLayer !== null) {
                        viewport = glBaseLayer.getViewport(view);
                    } else {
                        const glSubImage = glBinding.getViewSubImage(glProjLayer, view);
                        viewport = glSubImage.viewport;

                        // For side-by-side projection, we only produce a single texture for both eyes.
                        if (i === 0) {
                            renderer.setRenderTargetTextures(
                                newRenderTarget,
                                glSubImage.colorTexture,
                                glProjLayer.ignoreDepthValues ? undefined : glSubImage.depthStencilTexture
                            );

                            renderer.setRenderTarget(newRenderTarget);
                        }
                    }

                    let camera = cameras[i];

                    if (camera === undefined) {
                        camera = new PerspectiveCamera();
                        camera.layers.enable(i);
                        camera.viewport = new Vector4();
                        cameras[i] = camera;
                    }

                    camera.matrix.fromArray(view.transform.matrix);
                    camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
                    camera.projectionMatrix.fromArray(view.projectionMatrix);
                    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
                    camera.viewport.set(viewport.x, viewport.y, viewport.width, viewport.height);

                    if (i === 0) {
                        cameraXR.matrix.copy(camera.matrix);
                        cameraXR.matrix.decompose(cameraXR.position, cameraXR.quaternion, cameraXR.scale);
                    }

                    if (cameraXRNeedsUpdate === true) {
                        cameraXR.cameras.push(camera);
                    }
                }

                const enabledFeatures = session.enabledFeatures;

                if (enabledFeatures && enabledFeatures.includes("depth-sensing")) {
                    // https://github.com/immersive-web/depth-sensing/blob/main/explainer.md :
                    // Irrespective of the usage, XRDepthInformation & derived interfaces
                    // are only valid within the requestAnimationFrame() callback
                    // (i.e. only if the XRFrame is active and animated) in which they were obtained.
                    if (session.depthUsage === "gpu-optimized") {
                        const depthData = glBinding.getDepthInformation(views[0]);
                        if (depthData && depthData.isValid && depthData.texture) {
                            depthSensing.init(renderer, depthData, session.renderState);
                        }
                    } else {
                        depthSensingCpuInfo = frame.getDepthInformation(views[0]);
                        depthSensingFrame = frame;
                    }
                }
            }

            //

            for (let i = 0; i < controllers.length; i++) {
                const inputSource = controllerInputSources[i];
                const controller = controllers[i];

                if (inputSource !== null && controller !== undefined) {
                    controller.update(inputSource, frame, customReferenceSpace || referenceSpace);
                }
            }

            if (onAnimationFrameCallback) onAnimationFrameCallback(time, frame);

            if (frame.detectedPlanes) {
                scope.dispatchEvent({ type: "planesdetected", data: frame });
            }

            xrFrame = null;
        }

        const animation = new WebGLAnimation();

        animation.setAnimationLoop(onAnimationFrame);

        this.setAnimationLoop = function (callback) {
            onAnimationFrameCallback = callback;
        };

        this.dispose = function () { };
    }
}
