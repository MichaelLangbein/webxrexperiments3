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

class WebXRManager extends EventDispatcher {
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
            if (session.depthDataFormat === "luminance-alpha") {
                const uint16Data = new Uint16Array(depthSensingCpuInfo.data);
                return { ...depthSensingCpuInfo, data: uint16Data };
            } else if (session.depthDataFormat === "float32") {
                const float32Data = new Float32Array(depthSensingCpuInfo.data);
                return { ...depthSensingCpuInfo, data: float32Data };
            }
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
                        console.log({ depthSensingCpuInfo });
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

        this.dispose = function () {};
    }
}

const _e1 = /*@__PURE__*/ new Euler();
const _m1 = /*@__PURE__*/ new Matrix4();

function WebGLMaterials(renderer, properties) {
    function refreshTransformUniform(map, uniform) {
        if (map.matrixAutoUpdate === true) {
            map.updateMatrix();
        }

        uniform.value.copy(map.matrix);
    }

    function refreshFogUniforms(uniforms, fog) {
        fog.color.getRGB(uniforms.fogColor.value, getUnlitUniformColorSpace(renderer));

        if (fog.isFog) {
            uniforms.fogNear.value = fog.near;
            uniforms.fogFar.value = fog.far;
        } else if (fog.isFogExp2) {
            uniforms.fogDensity.value = fog.density;
        }
    }

    function refreshMaterialUniforms(uniforms, material, pixelRatio, height, transmissionRenderTarget) {
        if (material.isMeshBasicMaterial) {
            refreshUniformsCommon(uniforms, material);
        } else if (material.isMeshLambertMaterial) {
            refreshUniformsCommon(uniforms, material);
        } else if (material.isMeshToonMaterial) {
            refreshUniformsCommon(uniforms, material);
            refreshUniformsToon(uniforms, material);
        } else if (material.isMeshPhongMaterial) {
            refreshUniformsCommon(uniforms, material);
            refreshUniformsPhong(uniforms, material);
        } else if (material.isMeshStandardMaterial) {
            refreshUniformsCommon(uniforms, material);
            refreshUniformsStandard(uniforms, material);

            if (material.isMeshPhysicalMaterial) {
                refreshUniformsPhysical(uniforms, material, transmissionRenderTarget);
            }
        } else if (material.isMeshMatcapMaterial) {
            refreshUniformsCommon(uniforms, material);
            refreshUniformsMatcap(uniforms, material);
        } else if (material.isMeshDepthMaterial) {
            refreshUniformsCommon(uniforms, material);
        } else if (material.isMeshDistanceMaterial) {
            refreshUniformsCommon(uniforms, material);
            refreshUniformsDistance(uniforms, material);
        } else if (material.isMeshNormalMaterial) {
            refreshUniformsCommon(uniforms, material);
        } else if (material.isLineBasicMaterial) {
            refreshUniformsLine(uniforms, material);

            if (material.isLineDashedMaterial) {
                refreshUniformsDash(uniforms, material);
            }
        } else if (material.isPointsMaterial) {
            refreshUniformsPoints(uniforms, material, pixelRatio, height);
        } else if (material.isSpriteMaterial) {
            refreshUniformsSprites(uniforms, material);
        } else if (material.isShadowMaterial) {
            uniforms.color.value.copy(material.color);
            uniforms.opacity.value = material.opacity;
        } else if (material.isShaderMaterial) {
            material.uniformsNeedUpdate = false; // #15581
        }
    }

    function refreshUniformsCommon(uniforms, material) {
        uniforms.opacity.value = material.opacity;

        if (material.color) {
            uniforms.diffuse.value.copy(material.color);
        }

        if (material.emissive) {
            uniforms.emissive.value.copy(material.emissive).multiplyScalar(material.emissiveIntensity);
        }

        if (material.map) {
            uniforms.map.value = material.map;

            refreshTransformUniform(material.map, uniforms.mapTransform);
        }

        if (material.alphaMap) {
            uniforms.alphaMap.value = material.alphaMap;

            refreshTransformUniform(material.alphaMap, uniforms.alphaMapTransform);
        }

        if (material.bumpMap) {
            uniforms.bumpMap.value = material.bumpMap;

            refreshTransformUniform(material.bumpMap, uniforms.bumpMapTransform);

            uniforms.bumpScale.value = material.bumpScale;

            if (material.side === BackSide) {
                uniforms.bumpScale.value *= -1;
            }
        }

        if (material.normalMap) {
            uniforms.normalMap.value = material.normalMap;

            refreshTransformUniform(material.normalMap, uniforms.normalMapTransform);

            uniforms.normalScale.value.copy(material.normalScale);

            if (material.side === BackSide) {
                uniforms.normalScale.value.negate();
            }
        }

        if (material.displacementMap) {
            uniforms.displacementMap.value = material.displacementMap;

            refreshTransformUniform(material.displacementMap, uniforms.displacementMapTransform);

            uniforms.displacementScale.value = material.displacementScale;
            uniforms.displacementBias.value = material.displacementBias;
        }

        if (material.emissiveMap) {
            uniforms.emissiveMap.value = material.emissiveMap;

            refreshTransformUniform(material.emissiveMap, uniforms.emissiveMapTransform);
        }

        if (material.specularMap) {
            uniforms.specularMap.value = material.specularMap;

            refreshTransformUniform(material.specularMap, uniforms.specularMapTransform);
        }

        if (material.alphaTest > 0) {
            uniforms.alphaTest.value = material.alphaTest;
        }

        const materialProperties = properties.get(material);

        const envMap = materialProperties.envMap;
        const envMapRotation = materialProperties.envMapRotation;

        if (envMap) {
            uniforms.envMap.value = envMap;

            _e1.copy(envMapRotation);

            // accommodate left-handed frame
            _e1.x *= -1;
            _e1.y *= -1;
            _e1.z *= -1;

            if (envMap.isCubeTexture && envMap.isRenderTargetTexture === false) {
                // environment maps which are not cube render targets or PMREMs follow a different convention
                _e1.y *= -1;
                _e1.z *= -1;
            }

            uniforms.envMapRotation.value.setFromMatrix4(_m1.makeRotationFromEuler(_e1));

            uniforms.flipEnvMap.value = envMap.isCubeTexture && envMap.isRenderTargetTexture === false ? -1 : 1;

            uniforms.reflectivity.value = material.reflectivity;
            uniforms.ior.value = material.ior;
            uniforms.refractionRatio.value = material.refractionRatio;
        }

        if (material.lightMap) {
            uniforms.lightMap.value = material.lightMap;
            uniforms.lightMapIntensity.value = material.lightMapIntensity;

            refreshTransformUniform(material.lightMap, uniforms.lightMapTransform);
        }

        if (material.aoMap) {
            uniforms.aoMap.value = material.aoMap;
            uniforms.aoMapIntensity.value = material.aoMapIntensity;

            refreshTransformUniform(material.aoMap, uniforms.aoMapTransform);
        }
    }

    function refreshUniformsLine(uniforms, material) {
        uniforms.diffuse.value.copy(material.color);
        uniforms.opacity.value = material.opacity;

        if (material.map) {
            uniforms.map.value = material.map;

            refreshTransformUniform(material.map, uniforms.mapTransform);
        }
    }

    function refreshUniformsDash(uniforms, material) {
        uniforms.dashSize.value = material.dashSize;
        uniforms.totalSize.value = material.dashSize + material.gapSize;
        uniforms.scale.value = material.scale;
    }

    function refreshUniformsPoints(uniforms, material, pixelRatio, height) {
        uniforms.diffuse.value.copy(material.color);
        uniforms.opacity.value = material.opacity;
        uniforms.size.value = material.size * pixelRatio;
        uniforms.scale.value = height * 0.5;

        if (material.map) {
            uniforms.map.value = material.map;

            refreshTransformUniform(material.map, uniforms.uvTransform);
        }

        if (material.alphaMap) {
            uniforms.alphaMap.value = material.alphaMap;

            refreshTransformUniform(material.alphaMap, uniforms.alphaMapTransform);
        }

        if (material.alphaTest > 0) {
            uniforms.alphaTest.value = material.alphaTest;
        }
    }

    function refreshUniformsSprites(uniforms, material) {
        uniforms.diffuse.value.copy(material.color);
        uniforms.opacity.value = material.opacity;
        uniforms.rotation.value = material.rotation;

        if (material.map) {
            uniforms.map.value = material.map;

            refreshTransformUniform(material.map, uniforms.mapTransform);
        }

        if (material.alphaMap) {
            uniforms.alphaMap.value = material.alphaMap;

            refreshTransformUniform(material.alphaMap, uniforms.alphaMapTransform);
        }

        if (material.alphaTest > 0) {
            uniforms.alphaTest.value = material.alphaTest;
        }
    }

    function refreshUniformsPhong(uniforms, material) {
        uniforms.specular.value.copy(material.specular);
        uniforms.shininess.value = Math.max(material.shininess, 1e-4); // to prevent pow( 0.0, 0.0 )
    }

    function refreshUniformsToon(uniforms, material) {
        if (material.gradientMap) {
            uniforms.gradientMap.value = material.gradientMap;
        }
    }

    function refreshUniformsStandard(uniforms, material) {
        uniforms.metalness.value = material.metalness;

        if (material.metalnessMap) {
            uniforms.metalnessMap.value = material.metalnessMap;

            refreshTransformUniform(material.metalnessMap, uniforms.metalnessMapTransform);
        }

        uniforms.roughness.value = material.roughness;

        if (material.roughnessMap) {
            uniforms.roughnessMap.value = material.roughnessMap;

            refreshTransformUniform(material.roughnessMap, uniforms.roughnessMapTransform);
        }

        if (material.envMap) {
            //uniforms.envMap.value = material.envMap; // part of uniforms common

            uniforms.envMapIntensity.value = material.envMapIntensity;
        }
    }

    function refreshUniformsPhysical(uniforms, material, transmissionRenderTarget) {
        uniforms.ior.value = material.ior; // also part of uniforms common

        if (material.sheen > 0) {
            uniforms.sheenColor.value.copy(material.sheenColor).multiplyScalar(material.sheen);

            uniforms.sheenRoughness.value = material.sheenRoughness;

            if (material.sheenColorMap) {
                uniforms.sheenColorMap.value = material.sheenColorMap;

                refreshTransformUniform(material.sheenColorMap, uniforms.sheenColorMapTransform);
            }

            if (material.sheenRoughnessMap) {
                uniforms.sheenRoughnessMap.value = material.sheenRoughnessMap;

                refreshTransformUniform(material.sheenRoughnessMap, uniforms.sheenRoughnessMapTransform);
            }
        }

        if (material.clearcoat > 0) {
            uniforms.clearcoat.value = material.clearcoat;
            uniforms.clearcoatRoughness.value = material.clearcoatRoughness;

            if (material.clearcoatMap) {
                uniforms.clearcoatMap.value = material.clearcoatMap;

                refreshTransformUniform(material.clearcoatMap, uniforms.clearcoatMapTransform);
            }

            if (material.clearcoatRoughnessMap) {
                uniforms.clearcoatRoughnessMap.value = material.clearcoatRoughnessMap;

                refreshTransformUniform(material.clearcoatRoughnessMap, uniforms.clearcoatRoughnessMapTransform);
            }

            if (material.clearcoatNormalMap) {
                uniforms.clearcoatNormalMap.value = material.clearcoatNormalMap;

                refreshTransformUniform(material.clearcoatNormalMap, uniforms.clearcoatNormalMapTransform);

                uniforms.clearcoatNormalScale.value.copy(material.clearcoatNormalScale);

                if (material.side === BackSide) {
                    uniforms.clearcoatNormalScale.value.negate();
                }
            }
        }

        if (material.dispersion > 0) {
            uniforms.dispersion.value = material.dispersion;
        }

        if (material.iridescence > 0) {
            uniforms.iridescence.value = material.iridescence;
            uniforms.iridescenceIOR.value = material.iridescenceIOR;
            uniforms.iridescenceThicknessMinimum.value = material.iridescenceThicknessRange[0];
            uniforms.iridescenceThicknessMaximum.value = material.iridescenceThicknessRange[1];

            if (material.iridescenceMap) {
                uniforms.iridescenceMap.value = material.iridescenceMap;

                refreshTransformUniform(material.iridescenceMap, uniforms.iridescenceMapTransform);
            }

            if (material.iridescenceThicknessMap) {
                uniforms.iridescenceThicknessMap.value = material.iridescenceThicknessMap;

                refreshTransformUniform(material.iridescenceThicknessMap, uniforms.iridescenceThicknessMapTransform);
            }
        }

        if (material.transmission > 0) {
            uniforms.transmission.value = material.transmission;
            uniforms.transmissionSamplerMap.value = transmissionRenderTarget.texture;
            uniforms.transmissionSamplerSize.value.set(transmissionRenderTarget.width, transmissionRenderTarget.height);

            if (material.transmissionMap) {
                uniforms.transmissionMap.value = material.transmissionMap;

                refreshTransformUniform(material.transmissionMap, uniforms.transmissionMapTransform);
            }

            uniforms.thickness.value = material.thickness;

            if (material.thicknessMap) {
                uniforms.thicknessMap.value = material.thicknessMap;

                refreshTransformUniform(material.thicknessMap, uniforms.thicknessMapTransform);
            }

            uniforms.attenuationDistance.value = material.attenuationDistance;
            uniforms.attenuationColor.value.copy(material.attenuationColor);
        }

        if (material.anisotropy > 0) {
            uniforms.anisotropyVector.value.set(
                material.anisotropy * Math.cos(material.anisotropyRotation),
                material.anisotropy * Math.sin(material.anisotropyRotation)
            );

            if (material.anisotropyMap) {
                uniforms.anisotropyMap.value = material.anisotropyMap;

                refreshTransformUniform(material.anisotropyMap, uniforms.anisotropyMapTransform);
            }
        }

        uniforms.specularIntensity.value = material.specularIntensity;
        uniforms.specularColor.value.copy(material.specularColor);

        if (material.specularColorMap) {
            uniforms.specularColorMap.value = material.specularColorMap;

            refreshTransformUniform(material.specularColorMap, uniforms.specularColorMapTransform);
        }

        if (material.specularIntensityMap) {
            uniforms.specularIntensityMap.value = material.specularIntensityMap;

            refreshTransformUniform(material.specularIntensityMap, uniforms.specularIntensityMapTransform);
        }
    }

    function refreshUniformsMatcap(uniforms, material) {
        if (material.matcap) {
            uniforms.matcap.value = material.matcap;
        }
    }

    function refreshUniformsDistance(uniforms, material) {
        const light = properties.get(material).light;

        uniforms.referencePosition.value.setFromMatrixPosition(light.matrixWorld);
        uniforms.nearDistance.value = light.shadow.camera.near;
        uniforms.farDistance.value = light.shadow.camera.far;
    }

    return {
        refreshFogUniforms: refreshFogUniforms,
        refreshMaterialUniforms: refreshMaterialUniforms,
    };
}

function WebGLUniformsGroups(gl, info, capabilities, state) {
    let buffers = {};
    let updateList = {};
    let allocatedBindingPoints = [];

    const maxBindingPoints = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS); // binding points are global whereas block indices are per shader program

    function bind(uniformsGroup, program) {
        const webglProgram = program.program;
        state.uniformBlockBinding(uniformsGroup, webglProgram);
    }

    function update(uniformsGroup, program) {
        let buffer = buffers[uniformsGroup.id];

        if (buffer === undefined) {
            prepareUniformsGroup(uniformsGroup);

            buffer = createBuffer(uniformsGroup);
            buffers[uniformsGroup.id] = buffer;

            uniformsGroup.addEventListener("dispose", onUniformsGroupsDispose);
        }

        // ensure to update the binding points/block indices mapping for this program

        const webglProgram = program.program;
        state.updateUBOMapping(uniformsGroup, webglProgram);

        // update UBO once per frame

        const frame = info.render.frame;

        if (updateList[uniformsGroup.id] !== frame) {
            updateBufferData(uniformsGroup);

            updateList[uniformsGroup.id] = frame;
        }
    }

    function createBuffer(uniformsGroup) {
        // the setup of an UBO is independent of a particular shader program but global

        const bindingPointIndex = allocateBindingPointIndex();
        uniformsGroup.__bindingPointIndex = bindingPointIndex;

        const buffer = gl.createBuffer();
        const size = uniformsGroup.__size;
        const usage = uniformsGroup.usage;

        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, size, usage);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPointIndex, buffer);

        return buffer;
    }

    function allocateBindingPointIndex() {
        for (let i = 0; i < maxBindingPoints; i++) {
            if (allocatedBindingPoints.indexOf(i) === -1) {
                allocatedBindingPoints.push(i);
                return i;
            }
        }

        console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.");

        return 0;
    }

    function updateBufferData(uniformsGroup) {
        const buffer = buffers[uniformsGroup.id];
        const uniforms = uniformsGroup.uniforms;
        const cache = uniformsGroup.__cache;

        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);

        for (let i = 0, il = uniforms.length; i < il; i++) {
            const uniformArray = Array.isArray(uniforms[i]) ? uniforms[i] : [uniforms[i]];

            for (let j = 0, jl = uniformArray.length; j < jl; j++) {
                const uniform = uniformArray[j];

                if (hasUniformChanged(uniform, i, j, cache) === true) {
                    const offset = uniform.__offset;

                    const values = Array.isArray(uniform.value) ? uniform.value : [uniform.value];

                    let arrayOffset = 0;

                    for (let k = 0; k < values.length; k++) {
                        const value = values[k];

                        const info = getUniformSize(value);

                        // TODO add integer and struct support
                        if (typeof value === "number" || typeof value === "boolean") {
                            uniform.__data[0] = value;
                            gl.bufferSubData(gl.UNIFORM_BUFFER, offset + arrayOffset, uniform.__data);
                        } else if (value.isMatrix3) {
                            // manually converting 3x3 to 3x4

                            uniform.__data[0] = value.elements[0];
                            uniform.__data[1] = value.elements[1];
                            uniform.__data[2] = value.elements[2];
                            uniform.__data[3] = 0;
                            uniform.__data[4] = value.elements[3];
                            uniform.__data[5] = value.elements[4];
                            uniform.__data[6] = value.elements[5];
                            uniform.__data[7] = 0;
                            uniform.__data[8] = value.elements[6];
                            uniform.__data[9] = value.elements[7];
                            uniform.__data[10] = value.elements[8];
                            uniform.__data[11] = 0;
                        } else {
                            value.toArray(uniform.__data, arrayOffset);

                            arrayOffset += info.storage / Float32Array.BYTES_PER_ELEMENT;
                        }
                    }

                    gl.bufferSubData(gl.UNIFORM_BUFFER, offset, uniform.__data);
                }
            }
        }

        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    function hasUniformChanged(uniform, index, indexArray, cache) {
        const value = uniform.value;
        const indexString = index + "_" + indexArray;

        if (cache[indexString] === undefined) {
            // cache entry does not exist so far

            if (typeof value === "number" || typeof value === "boolean") {
                cache[indexString] = value;
            } else {
                cache[indexString] = value.clone();
            }

            return true;
        } else {
            const cachedObject = cache[indexString];

            // compare current value with cached entry

            if (typeof value === "number" || typeof value === "boolean") {
                if (cachedObject !== value) {
                    cache[indexString] = value;
                    return true;
                }
            } else {
                if (cachedObject.equals(value) === false) {
                    cachedObject.copy(value);
                    return true;
                }
            }
        }

        return false;
    }

    function prepareUniformsGroup(uniformsGroup) {
        // determine total buffer size according to the STD140 layout
        // Hint: STD140 is the only supported layout in WebGL 2

        const uniforms = uniformsGroup.uniforms;

        let offset = 0; // global buffer offset in bytes
        const chunkSize = 16; // size of a chunk in bytes

        for (let i = 0, l = uniforms.length; i < l; i++) {
            const uniformArray = Array.isArray(uniforms[i]) ? uniforms[i] : [uniforms[i]];

            for (let j = 0, jl = uniformArray.length; j < jl; j++) {
                const uniform = uniformArray[j];

                const values = Array.isArray(uniform.value) ? uniform.value : [uniform.value];

                for (let k = 0, kl = values.length; k < kl; k++) {
                    const value = values[k];

                    const info = getUniformSize(value);

                    // Calculate the chunk offset
                    const chunkOffsetUniform = offset % chunkSize;

                    // Check for chunk overflow
                    if (chunkOffsetUniform !== 0 && chunkSize - chunkOffsetUniform < info.boundary) {
                        // Add padding and adjust offset
                        offset += chunkSize - chunkOffsetUniform;
                    }

                    // the following two properties will be used for partial buffer updates

                    uniform.__data = new Float32Array(info.storage / Float32Array.BYTES_PER_ELEMENT);
                    uniform.__offset = offset;

                    // Update the global offset
                    offset += info.storage;
                }
            }
        }

        // ensure correct final padding

        const chunkOffset = offset % chunkSize;

        if (chunkOffset > 0) offset += chunkSize - chunkOffset;

        //

        uniformsGroup.__size = offset;
        uniformsGroup.__cache = {};

        return this;
    }

    function getUniformSize(value) {
        const info = {
            boundary: 0, // bytes
            storage: 0, // bytes
        };

        // determine sizes according to STD140

        if (typeof value === "number" || typeof value === "boolean") {
            // float/int/bool

            info.boundary = 4;
            info.storage = 4;
        } else if (value.isVector2) {
            // vec2

            info.boundary = 8;
            info.storage = 8;
        } else if (value.isVector3 || value.isColor) {
            // vec3

            info.boundary = 16;
            info.storage = 12; // evil: vec3 must start on a 16-byte boundary but it only consumes 12 bytes
        } else if (value.isVector4) {
            // vec4

            info.boundary = 16;
            info.storage = 16;
        } else if (value.isMatrix3) {
            // mat3 (in STD140 a 3x3 matrix is represented as 3x4)

            info.boundary = 48;
            info.storage = 48;
        } else if (value.isMatrix4) {
            // mat4

            info.boundary = 64;
            info.storage = 64;
        } else if (value.isTexture) {
            console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group.");
        } else {
            console.warn("THREE.WebGLRenderer: Unsupported uniform value type.", value);
        }

        return info;
    }

    function onUniformsGroupsDispose(event) {
        const uniformsGroup = event.target;

        uniformsGroup.removeEventListener("dispose", onUniformsGroupsDispose);

        const index = allocatedBindingPoints.indexOf(uniformsGroup.__bindingPointIndex);
        allocatedBindingPoints.splice(index, 1);

        gl.deleteBuffer(buffers[uniformsGroup.id]);

        delete buffers[uniformsGroup.id];
        delete updateList[uniformsGroup.id];
    }

    function dispose() {
        for (const id in buffers) {
            gl.deleteBuffer(buffers[id]);
        }

        allocatedBindingPoints = [];
        buffers = {};
        updateList = {};
    }

    return {
        bind: bind,
        update: update,

        dispose: dispose,
    };
}

export class WebGLRenderer {
    constructor(parameters = {}) {
        const {
            canvas = createCanvasElement(),
            context = null,
            depth = true,
            stencil = false,
            alpha = false,
            antialias = false,
            premultipliedAlpha = true,
            preserveDrawingBuffer = false,
            powerPreference = "default",
            failIfMajorPerformanceCaveat = false,
        } = parameters;

        this.isWebGLRenderer = true;

        let _alpha;

        if (context !== null) {
            if (typeof WebGLRenderingContext !== "undefined" && context instanceof WebGLRenderingContext) {
                throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");
            }

            _alpha = context.getContextAttributes().alpha;
        } else {
            _alpha = alpha;
        }

        const uintClearColor = new Uint32Array(4);
        const intClearColor = new Int32Array(4);

        let currentRenderList = null;
        let currentRenderState = null;

        // render() can be called from within a callback triggered by another render.
        // We track this so that the nested render call gets its list and state isolated from the parent render call.

        const renderListStack = [];
        const renderStateStack = [];

        // public properties

        this.domElement = canvas;

        // Debug configuration container
        this.debug = {
            /**
             * Enables error checking and reporting when shader programs are being compiled
             * @type {boolean}
             */
            checkShaderErrors: true,
            /**
             * Callback for custom error reporting.
             * @type {?Function}
             */
            onShaderError: null,
        };

        // clearing

        this.autoClear = true;
        this.autoClearColor = true;
        this.autoClearDepth = true;
        this.autoClearStencil = true;

        // scene graph

        this.sortObjects = true;

        // user-defined clipping

        this.clippingPlanes = [];
        this.localClippingEnabled = false;

        // physically based shading

        this._outputColorSpace = SRGBColorSpace;

        // tone mapping

        this.toneMapping = NoToneMapping;
        this.toneMappingExposure = 1.0;

        // internal properties

        const _this = this;

        let _isContextLost = false;

        // internal state cache

        let _currentActiveCubeFace = 0;
        let _currentActiveMipmapLevel = 0;
        let _currentRenderTarget = null;
        let _currentMaterialId = -1;

        let _currentCamera = null;

        const _currentViewport = new Vector4();
        const _currentScissor = new Vector4();
        let _currentScissorTest = null;

        const _currentClearColor = new Color(0x000000);
        let _currentClearAlpha = 0;

        //

        let _width = canvas.width;
        let _height = canvas.height;

        let _pixelRatio = 1;
        let _opaqueSort = null;
        let _transparentSort = null;

        const _viewport = new Vector4(0, 0, _width, _height);
        const _scissor = new Vector4(0, 0, _width, _height);
        let _scissorTest = false;

        // frustum

        const _frustum = new Frustum();

        // clipping

        let _clippingEnabled = false;
        let _localClippingEnabled = false;

        // camera matrices cache

        const _projScreenMatrix = new Matrix4();

        const _vector3 = new Vector3();

        const _vector4 = new Vector4();

        const _emptyScene = { background: null, fog: null, environment: null, overrideMaterial: null, isScene: true };

        let _renderBackground = false;

        function getTargetPixelRatio() {
            return _currentRenderTarget === null ? _pixelRatio : 1;
        }

        // initialize

        let _gl = context;

        function getContext(contextName, contextAttributes) {
            return canvas.getContext(contextName, contextAttributes);
        }

        try {
            const contextAttributes = {
                alpha: true,
                depth,
                stencil,
                antialias,
                premultipliedAlpha,
                preserveDrawingBuffer,
                powerPreference,
                failIfMajorPerformanceCaveat,
            };

            // OffscreenCanvas does not have setAttribute, see #22811
            if ("setAttribute" in canvas) canvas.setAttribute("data-engine", `three.js r${REVISION}`);

            // event listeners must be registered before WebGL context is created, see #12753
            canvas.addEventListener("webglcontextlost", onContextLost, false);
            canvas.addEventListener("webglcontextrestored", onContextRestore, false);
            canvas.addEventListener("webglcontextcreationerror", onContextCreationError, false);

            if (_gl === null) {
                const contextName = "webgl2";

                _gl = getContext(contextName, contextAttributes);

                if (_gl === null) {
                    if (getContext(contextName)) {
                        throw new Error("Error creating WebGL context with your selected attributes.");
                    } else {
                        throw new Error("Error creating WebGL context.");
                    }
                }
            }
        } catch (error) {
            console.error("THREE.WebGLRenderer: " + error.message);
            throw error;
        }

        let extensions, capabilities, state, info;
        let properties, textures, cubemaps, cubeuvmaps, attributes, geometries, objects;
        let programCache, materials, renderLists, renderStates, clipping, shadowMap;

        let background, morphtargets, bufferRenderer, indexedBufferRenderer;

        let utils, bindingStates, uniformsGroups;

        function initGLContext() {
            extensions = new WebGLExtensions(_gl);
            extensions.init();

            utils = new WebGLUtils(_gl, extensions);

            capabilities = new WebGLCapabilities(_gl, extensions, parameters, utils);

            state = new WebGLState(_gl);

            info = new WebGLInfo(_gl);
            properties = new WebGLProperties();
            textures = new WebGLTextures(_gl, extensions, state, properties, capabilities, utils, info);
            cubemaps = new WebGLCubeMaps(_this);
            cubeuvmaps = new WebGLCubeUVMaps(_this);
            attributes = new WebGLAttributes(_gl);
            bindingStates = new WebGLBindingStates(_gl, attributes);
            geometries = new WebGLGeometries(_gl, attributes, info, bindingStates);
            objects = new WebGLObjects(_gl, geometries, attributes, info);
            morphtargets = new WebGLMorphtargets(_gl, capabilities, textures);
            clipping = new WebGLClipping(properties);
            programCache = new WebGLPrograms(
                _this,
                cubemaps,
                cubeuvmaps,
                extensions,
                capabilities,
                bindingStates,
                clipping
            );
            materials = new WebGLMaterials(_this, properties);
            renderLists = new WebGLRenderLists();
            renderStates = new WebGLRenderStates(extensions);
            background = new WebGLBackground(_this, cubemaps, cubeuvmaps, state, objects, _alpha, premultipliedAlpha);
            shadowMap = new WebGLShadowMap(_this, objects, capabilities);
            uniformsGroups = new WebGLUniformsGroups(_gl, info, capabilities, state);

            bufferRenderer = new WebGLBufferRenderer(_gl, extensions, info);
            indexedBufferRenderer = new WebGLIndexedBufferRenderer(_gl, extensions, info);

            info.programs = programCache.programs;

            _this.capabilities = capabilities;
            _this.extensions = extensions;
            _this.properties = properties;
            _this.renderLists = renderLists;
            _this.shadowMap = shadowMap;
            _this.state = state;
            _this.info = info;
        }

        initGLContext();

        // xr

        const xr = new WebXRManager(_this, _gl);

        this.xr = xr;

        // API

        this.getContext = function () {
            return _gl;
        };

        this.getContextAttributes = function () {
            return _gl.getContextAttributes();
        };

        this.forceContextLoss = function () {
            const extension = extensions.get("WEBGL_lose_context");
            if (extension) extension.loseContext();
        };

        this.forceContextRestore = function () {
            const extension = extensions.get("WEBGL_lose_context");
            if (extension) extension.restoreContext();
        };

        this.getPixelRatio = function () {
            return _pixelRatio;
        };

        this.setPixelRatio = function (value) {
            if (value === undefined) return;

            _pixelRatio = value;

            this.setSize(_width, _height, false);
        };

        this.getSize = function (target) {
            return target.set(_width, _height);
        };

        this.setSize = function (width, height, updateStyle = true) {
            if (xr.isPresenting) {
                console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");
                return;
            }

            _width = width;
            _height = height;

            canvas.width = Math.floor(width * _pixelRatio);
            canvas.height = Math.floor(height * _pixelRatio);

            if (updateStyle === true) {
                canvas.style.width = width + "px";
                canvas.style.height = height + "px";
            }

            this.setViewport(0, 0, width, height);
        };

        this.getDrawingBufferSize = function (target) {
            return target.set(_width * _pixelRatio, _height * _pixelRatio).floor();
        };

        this.setDrawingBufferSize = function (width, height, pixelRatio) {
            _width = width;
            _height = height;

            _pixelRatio = pixelRatio;

            canvas.width = Math.floor(width * pixelRatio);
            canvas.height = Math.floor(height * pixelRatio);

            this.setViewport(0, 0, width, height);
        };

        this.getCurrentViewport = function (target) {
            return target.copy(_currentViewport);
        };

        this.getViewport = function (target) {
            return target.copy(_viewport);
        };

        this.setViewport = function (x, y, width, height) {
            if (x.isVector4) {
                _viewport.set(x.x, x.y, x.z, x.w);
            } else {
                _viewport.set(x, y, width, height);
            }

            state.viewport(_currentViewport.copy(_viewport).multiplyScalar(_pixelRatio).round());
        };

        this.getScissor = function (target) {
            return target.copy(_scissor);
        };

        this.setScissor = function (x, y, width, height) {
            if (x.isVector4) {
                _scissor.set(x.x, x.y, x.z, x.w);
            } else {
                _scissor.set(x, y, width, height);
            }

            state.scissor(_currentScissor.copy(_scissor).multiplyScalar(_pixelRatio).round());
        };

        this.getScissorTest = function () {
            return _scissorTest;
        };

        this.setScissorTest = function (boolean) {
            state.setScissorTest((_scissorTest = boolean));
        };

        this.setOpaqueSort = function (method) {
            _opaqueSort = method;
        };

        this.setTransparentSort = function (method) {
            _transparentSort = method;
        };

        // Clearing

        this.getClearColor = function (target) {
            return target.copy(background.getClearColor());
        };

        this.setClearColor = function () {
            background.setClearColor.apply(background, arguments);
        };

        this.getClearAlpha = function () {
            return background.getClearAlpha();
        };

        this.setClearAlpha = function () {
            background.setClearAlpha.apply(background, arguments);
        };

        this.clear = function (color = true, depth = true, stencil = true) {
            let bits = 0;

            if (color) {
                // check if we're trying to clear an integer target
                let isIntegerFormat = false;
                if (_currentRenderTarget !== null) {
                    const targetFormat = _currentRenderTarget.texture.format;
                    isIntegerFormat =
                        targetFormat === RGBAIntegerFormat ||
                        targetFormat === RGIntegerFormat ||
                        targetFormat === RedIntegerFormat;
                }

                // use the appropriate clear functions to clear the target if it's a signed
                // or unsigned integer target
                if (isIntegerFormat) {
                    const targetType = _currentRenderTarget.texture.type;
                    const isUnsignedType =
                        targetType === UnsignedByteType ||
                        targetType === UnsignedIntType ||
                        targetType === UnsignedShortType ||
                        targetType === UnsignedInt248Type ||
                        targetType === UnsignedShort4444Type ||
                        targetType === UnsignedShort5551Type;

                    const clearColor = background.getClearColor();
                    const a = background.getClearAlpha();
                    const r = clearColor.r;
                    const g = clearColor.g;
                    const b = clearColor.b;

                    if (isUnsignedType) {
                        uintClearColor[0] = r;
                        uintClearColor[1] = g;
                        uintClearColor[2] = b;
                        uintClearColor[3] = a;
                        _gl.clearBufferuiv(_gl.COLOR, 0, uintClearColor);
                    } else {
                        intClearColor[0] = r;
                        intClearColor[1] = g;
                        intClearColor[2] = b;
                        intClearColor[3] = a;
                        _gl.clearBufferiv(_gl.COLOR, 0, intClearColor);
                    }
                } else {
                    bits |= _gl.COLOR_BUFFER_BIT;
                }
            }

            if (depth) bits |= _gl.DEPTH_BUFFER_BIT;
            if (stencil) {
                bits |= _gl.STENCIL_BUFFER_BIT;
                this.state.buffers.stencil.setMask(0xffffffff);
            }

            _gl.clear(bits);
        };

        this.clearColor = function () {
            this.clear(true, false, false);
        };

        this.clearDepth = function () {
            this.clear(false, true, false);
        };

        this.clearStencil = function () {
            this.clear(false, false, true);
        };

        //

        this.dispose = function () {
            canvas.removeEventListener("webglcontextlost", onContextLost, false);
            canvas.removeEventListener("webglcontextrestored", onContextRestore, false);
            canvas.removeEventListener("webglcontextcreationerror", onContextCreationError, false);

            renderLists.dispose();
            renderStates.dispose();
            properties.dispose();
            cubemaps.dispose();
            cubeuvmaps.dispose();
            objects.dispose();
            bindingStates.dispose();
            uniformsGroups.dispose();
            programCache.dispose();

            xr.dispose();

            xr.removeEventListener("sessionstart", onXRSessionStart);
            xr.removeEventListener("sessionend", onXRSessionEnd);

            animation.stop();
        };

        // Events

        function onContextLost(event) {
            event.preventDefault();

            console.log("THREE.WebGLRenderer: Context Lost.");

            _isContextLost = true;
        }

        function onContextRestore(/* event */) {
            console.log("THREE.WebGLRenderer: Context Restored.");

            _isContextLost = false;

            const infoAutoReset = info.autoReset;
            const shadowMapEnabled = shadowMap.enabled;
            const shadowMapAutoUpdate = shadowMap.autoUpdate;
            const shadowMapNeedsUpdate = shadowMap.needsUpdate;
            const shadowMapType = shadowMap.type;

            initGLContext();

            info.autoReset = infoAutoReset;
            shadowMap.enabled = shadowMapEnabled;
            shadowMap.autoUpdate = shadowMapAutoUpdate;
            shadowMap.needsUpdate = shadowMapNeedsUpdate;
            shadowMap.type = shadowMapType;
        }

        function onContextCreationError(event) {
            console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ", event.statusMessage);
        }

        function onMaterialDispose(event) {
            const material = event.target;

            material.removeEventListener("dispose", onMaterialDispose);

            deallocateMaterial(material);
        }

        // Buffer deallocation

        function deallocateMaterial(material) {
            releaseMaterialProgramReferences(material);

            properties.remove(material);
        }

        function releaseMaterialProgramReferences(material) {
            const programs = properties.get(material).programs;

            if (programs !== undefined) {
                programs.forEach(function (program) {
                    programCache.releaseProgram(program);
                });

                if (material.isShaderMaterial) {
                    programCache.releaseShaderCache(material);
                }
            }
        }

        // Buffer rendering

        this.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            if (scene === null) scene = _emptyScene; // renderBufferDirect second parameter used to be fog (could be null)

            const frontFaceCW = object.isMesh && object.matrixWorld.determinant() < 0;

            const program = setProgram(camera, scene, geometry, material, object);

            state.setMaterial(material, frontFaceCW);

            //

            let index = geometry.index;
            let rangeFactor = 1;

            if (material.wireframe === true) {
                index = geometries.getWireframeAttribute(geometry);

                if (index === undefined) return;

                rangeFactor = 2;
            }

            //

            const drawRange = geometry.drawRange;
            const position = geometry.attributes.position;

            let drawStart = drawRange.start * rangeFactor;
            let drawEnd = (drawRange.start + drawRange.count) * rangeFactor;

            if (group !== null) {
                drawStart = Math.max(drawStart, group.start * rangeFactor);
                drawEnd = Math.min(drawEnd, (group.start + group.count) * rangeFactor);
            }

            if (index !== null) {
                drawStart = Math.max(drawStart, 0);
                drawEnd = Math.min(drawEnd, index.count);
            } else if (position !== undefined && position !== null) {
                drawStart = Math.max(drawStart, 0);
                drawEnd = Math.min(drawEnd, position.count);
            }

            const drawCount = drawEnd - drawStart;

            if (drawCount < 0 || drawCount === Infinity) return;

            //

            bindingStates.setup(object, material, program, geometry, index);

            let attribute;
            let renderer = bufferRenderer;

            if (index !== null) {
                attribute = attributes.get(index);

                renderer = indexedBufferRenderer;
                renderer.setIndex(attribute);
            }

            //

            if (object.isMesh) {
                if (material.wireframe === true) {
                    state.setLineWidth(material.wireframeLinewidth * getTargetPixelRatio());
                    renderer.setMode(_gl.LINES);
                } else {
                    renderer.setMode(_gl.TRIANGLES);
                }
            } else if (object.isLine) {
                let lineWidth = material.linewidth;

                if (lineWidth === undefined) lineWidth = 1; // Not using Line*Material

                state.setLineWidth(lineWidth * getTargetPixelRatio());

                if (object.isLineSegments) {
                    renderer.setMode(_gl.LINES);
                } else if (object.isLineLoop) {
                    renderer.setMode(_gl.LINE_LOOP);
                } else {
                    renderer.setMode(_gl.LINE_STRIP);
                }
            } else if (object.isPoints) {
                renderer.setMode(_gl.POINTS);
            } else if (object.isSprite) {
                renderer.setMode(_gl.TRIANGLES);
            }

            if (object.isBatchedMesh) {
                if (object._multiDrawInstances !== null) {
                    renderer.renderMultiDrawInstances(
                        object._multiDrawStarts,
                        object._multiDrawCounts,
                        object._multiDrawCount,
                        object._multiDrawInstances
                    );
                } else {
                    if (!extensions.get("WEBGL_multi_draw")) {
                        const starts = object._multiDrawStarts;
                        const counts = object._multiDrawCounts;
                        const drawCount = object._multiDrawCount;
                        const bytesPerElement = index ? attributes.get(index).bytesPerElement : 1;
                        const uniforms = properties.get(material).currentProgram.getUniforms();
                        for (let i = 0; i < drawCount; i++) {
                            uniforms.setValue(_gl, "_gl_DrawID", i);
                            renderer.render(starts[i] / bytesPerElement, counts[i]);
                        }
                    } else {
                        renderer.renderMultiDraw(
                            object._multiDrawStarts,
                            object._multiDrawCounts,
                            object._multiDrawCount
                        );
                    }
                }
            } else if (object.isInstancedMesh) {
                renderer.renderInstances(drawStart, drawCount, object.count);
            } else if (geometry.isInstancedBufferGeometry) {
                const maxInstanceCount =
                    geometry._maxInstanceCount !== undefined ? geometry._maxInstanceCount : Infinity;
                const instanceCount = Math.min(geometry.instanceCount, maxInstanceCount);

                renderer.renderInstances(drawStart, drawCount, instanceCount);
            } else {
                renderer.render(drawStart, drawCount);
            }
        };

        // Compile

        function prepareMaterial(material, scene, object) {
            if (material.transparent === true && material.side === DoubleSide && material.forceSinglePass === false) {
                material.side = BackSide;
                material.needsUpdate = true;
                getProgram(material, scene, object);

                material.side = FrontSide;
                material.needsUpdate = true;
                getProgram(material, scene, object);

                material.side = DoubleSide;
            } else {
                getProgram(material, scene, object);
            }
        }

        this.compile = function (scene, camera, targetScene = null) {
            if (targetScene === null) targetScene = scene;

            currentRenderState = renderStates.get(targetScene);
            currentRenderState.init(camera);

            renderStateStack.push(currentRenderState);

            // gather lights from both the target scene and the new object that will be added to the scene.

            targetScene.traverseVisible(function (object) {
                if (object.isLight && object.layers.test(camera.layers)) {
                    currentRenderState.pushLight(object);

                    if (object.castShadow) {
                        currentRenderState.pushShadow(object);
                    }
                }
            });

            if (scene !== targetScene) {
                scene.traverseVisible(function (object) {
                    if (object.isLight && object.layers.test(camera.layers)) {
                        currentRenderState.pushLight(object);

                        if (object.castShadow) {
                            currentRenderState.pushShadow(object);
                        }
                    }
                });
            }

            currentRenderState.setupLights();

            // Only initialize materials in the new scene, not the targetScene.

            const materials = new Set();

            scene.traverse(function (object) {
                const material = object.material;

                if (material) {
                    if (Array.isArray(material)) {
                        for (let i = 0; i < material.length; i++) {
                            const material2 = material[i];

                            prepareMaterial(material2, targetScene, object);
                            materials.add(material2);
                        }
                    } else {
                        prepareMaterial(material, targetScene, object);
                        materials.add(material);
                    }
                }
            });

            renderStateStack.pop();
            currentRenderState = null;

            return materials;
        };

        // compileAsync

        this.compileAsync = function (scene, camera, targetScene = null) {
            const materials = this.compile(scene, camera, targetScene);

            // Wait for all the materials in the new object to indicate that they're
            // ready to be used before resolving the promise.

            return new Promise((resolve) => {
                function checkMaterialsReady() {
                    materials.forEach(function (material) {
                        const materialProperties = properties.get(material);
                        const program = materialProperties.currentProgram;

                        if (program.isReady()) {
                            // remove any programs that report they're ready to use from the list
                            materials.delete(material);
                        }
                    });

                    // once the list of compiling materials is empty, call the callback

                    if (materials.size === 0) {
                        resolve(scene);
                        return;
                    }

                    // if some materials are still not ready, wait a bit and check again

                    setTimeout(checkMaterialsReady, 10);
                }

                if (extensions.get("KHR_parallel_shader_compile") !== null) {
                    // If we can check the compilation status of the materials without
                    // blocking then do so right away.

                    checkMaterialsReady();
                } else {
                    // Otherwise start by waiting a bit to give the materials we just
                    // initialized a chance to finish.

                    setTimeout(checkMaterialsReady, 10);
                }
            });
        };

        // Animation Loop

        let onAnimationFrameCallback = null;

        function onAnimationFrame(time) {
            if (onAnimationFrameCallback) onAnimationFrameCallback(time);
        }

        function onXRSessionStart() {
            animation.stop();
        }

        function onXRSessionEnd() {
            animation.start();
        }

        const animation = new WebGLAnimation();
        animation.setAnimationLoop(onAnimationFrame);

        if (typeof self !== "undefined") animation.setContext(self);

        this.setAnimationLoop = function (callback) {
            onAnimationFrameCallback = callback;
            xr.setAnimationLoop(callback);

            callback === null ? animation.stop() : animation.start();
        };

        xr.addEventListener("sessionstart", onXRSessionStart);
        xr.addEventListener("sessionend", onXRSessionEnd);

        // Rendering

        this.render = function (scene, camera) {
            if (camera !== undefined && camera.isCamera !== true) {
                console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");
                return;
            }

            if (_isContextLost === true) return;

            // update scene graph

            if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();

            // update camera matrices and frustum

            if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();

            if (xr.enabled === true && xr.isPresenting === true) {
                if (xr.cameraAutoUpdate === true) xr.updateCamera(camera);

                camera = xr.getCamera(); // use XR camera for rendering
            }

            //
            if (scene.isScene === true) scene.onBeforeRender(_this, scene, camera, _currentRenderTarget);

            currentRenderState = renderStates.get(scene, renderStateStack.length);
            currentRenderState.init(camera);

            renderStateStack.push(currentRenderState);

            _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            _frustum.setFromProjectionMatrix(_projScreenMatrix);

            _localClippingEnabled = this.localClippingEnabled;
            _clippingEnabled = clipping.init(this.clippingPlanes, _localClippingEnabled);

            currentRenderList = renderLists.get(scene, renderListStack.length);
            currentRenderList.init();

            renderListStack.push(currentRenderList);

            if (xr.enabled === true && xr.isPresenting === true) {
                const depthSensingMesh = _this.xr.getDepthSensingMesh();

                if (depthSensingMesh !== null) {
                    projectObject(depthSensingMesh, camera, -Infinity, _this.sortObjects);
                }
            }

            projectObject(scene, camera, 0, _this.sortObjects);

            currentRenderList.finish();

            if (_this.sortObjects === true) {
                currentRenderList.sort(_opaqueSort, _transparentSort);
            }

            _renderBackground = xr.enabled === false || xr.isPresenting === false || xr.hasDepthSensing() === false;
            if (_renderBackground) {
                background.addToRenderList(currentRenderList, scene);
            }

            //

            this.info.render.frame++;

            if (_clippingEnabled === true) clipping.beginShadows();

            const shadowsArray = currentRenderState.state.shadowsArray;

            shadowMap.render(shadowsArray, scene, camera);

            if (_clippingEnabled === true) clipping.endShadows();

            //

            if (this.info.autoReset === true) this.info.reset();

            // render scene

            const opaqueObjects = currentRenderList.opaque;
            const transmissiveObjects = currentRenderList.transmissive;

            currentRenderState.setupLights();

            if (camera.isArrayCamera) {
                const cameras = camera.cameras;

                if (transmissiveObjects.length > 0) {
                    for (let i = 0, l = cameras.length; i < l; i++) {
                        const camera2 = cameras[i];

                        renderTransmissionPass(opaqueObjects, transmissiveObjects, scene, camera2);
                    }
                }

                if (_renderBackground) background.render(scene);

                for (let i = 0, l = cameras.length; i < l; i++) {
                    const camera2 = cameras[i];

                    renderScene(currentRenderList, scene, camera2, camera2.viewport);
                }
            } else {
                if (transmissiveObjects.length > 0)
                    renderTransmissionPass(opaqueObjects, transmissiveObjects, scene, camera);

                if (_renderBackground) background.render(scene);

                renderScene(currentRenderList, scene, camera);
            }

            //

            if (_currentRenderTarget !== null) {
                // resolve multisample renderbuffers to a single-sample texture if necessary

                textures.updateMultisampleRenderTarget(_currentRenderTarget);

                // Generate mipmap if we're using any kind of mipmap filtering

                textures.updateRenderTargetMipmap(_currentRenderTarget);
            }

            //

            if (scene.isScene === true) scene.onAfterRender(_this, scene, camera);

            // _gl.finish();

            bindingStates.resetDefaultState();
            _currentMaterialId = -1;
            _currentCamera = null;

            renderStateStack.pop();

            if (renderStateStack.length > 0) {
                currentRenderState = renderStateStack[renderStateStack.length - 1];

                if (_clippingEnabled === true)
                    clipping.setGlobalState(_this.clippingPlanes, currentRenderState.state.camera);
            } else {
                currentRenderState = null;
            }

            renderListStack.pop();

            if (renderListStack.length > 0) {
                currentRenderList = renderListStack[renderListStack.length - 1];
            } else {
                currentRenderList = null;
            }
        };

        function projectObject(object, camera, groupOrder, sortObjects) {
            if (object.visible === false) return;

            const visible = object.layers.test(camera.layers);

            if (visible) {
                if (object.isGroup) {
                    groupOrder = object.renderOrder;
                } else if (object.isLOD) {
                    if (object.autoUpdate === true) object.update(camera);
                } else if (object.isLight) {
                    currentRenderState.pushLight(object);

                    if (object.castShadow) {
                        currentRenderState.pushShadow(object);
                    }
                } else if (object.isSprite) {
                    if (!object.frustumCulled || _frustum.intersectsSprite(object)) {
                        if (sortObjects) {
                            _vector4.setFromMatrixPosition(object.matrixWorld).applyMatrix4(_projScreenMatrix);
                        }

                        const geometry = objects.update(object);
                        const material = object.material;

                        if (material.visible) {
                            currentRenderList.push(object, geometry, material, groupOrder, _vector4.z, null);
                        }
                    }
                } else if (object.isMesh || object.isLine || object.isPoints) {
                    if (!object.frustumCulled || _frustum.intersectsObject(object)) {
                        const geometry = objects.update(object);
                        const material = object.material;

                        if (sortObjects) {
                            if (object.boundingSphere !== undefined) {
                                if (object.boundingSphere === null) object.computeBoundingSphere();
                                _vector4.copy(object.boundingSphere.center);
                            } else {
                                if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
                                _vector4.copy(geometry.boundingSphere.center);
                            }

                            _vector4.applyMatrix4(object.matrixWorld).applyMatrix4(_projScreenMatrix);
                        }

                        if (Array.isArray(material)) {
                            const groups = geometry.groups;

                            for (let i = 0, l = groups.length; i < l; i++) {
                                const group = groups[i];
                                const groupMaterial = material[group.materialIndex];

                                if (groupMaterial && groupMaterial.visible) {
                                    currentRenderList.push(
                                        object,
                                        geometry,
                                        groupMaterial,
                                        groupOrder,
                                        _vector4.z,
                                        group
                                    );
                                }
                            }
                        } else if (material.visible) {
                            currentRenderList.push(object, geometry, material, groupOrder, _vector4.z, null);
                        }
                    }
                }
            }

            const children = object.children;

            for (let i = 0, l = children.length; i < l; i++) {
                projectObject(children[i], camera, groupOrder, sortObjects);
            }
        }

        function renderScene(currentRenderList, scene, camera, viewport) {
            const opaqueObjects = currentRenderList.opaque;
            const transmissiveObjects = currentRenderList.transmissive;
            const transparentObjects = currentRenderList.transparent;

            currentRenderState.setupLightsView(camera);

            if (_clippingEnabled === true) clipping.setGlobalState(_this.clippingPlanes, camera);

            if (viewport) state.viewport(_currentViewport.copy(viewport));

            if (opaqueObjects.length > 0) renderObjects(opaqueObjects, scene, camera);
            if (transmissiveObjects.length > 0) renderObjects(transmissiveObjects, scene, camera);
            if (transparentObjects.length > 0) renderObjects(transparentObjects, scene, camera);

            // Ensure depth buffer writing is enabled so it can be cleared on next render

            state.buffers.depth.setTest(true);
            state.buffers.depth.setMask(true);
            state.buffers.color.setMask(true);

            state.setPolygonOffset(false);
        }

        function renderTransmissionPass(opaqueObjects, transmissiveObjects, scene, camera) {
            const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;

            if (overrideMaterial !== null) {
                return;
            }

            if (currentRenderState.state.transmissionRenderTarget[camera.id] === undefined) {
                currentRenderState.state.transmissionRenderTarget[camera.id] = new WebGLRenderTarget(1, 1, {
                    generateMipmaps: true,
                    type:
                        extensions.has("EXT_color_buffer_half_float") || extensions.has("EXT_color_buffer_float")
                            ? HalfFloatType
                            : UnsignedByteType,
                    minFilter: LinearMipmapLinearFilter,
                    samples: 4,
                    stencilBuffer: stencil,
                    resolveDepthBuffer: false,
                    resolveStencilBuffer: false,
                    colorSpace: ColorManagement.workingColorSpace,
                });

                // debug

                /*
				const geometry = new PlaneGeometry();
				const material = new MeshBasicMaterial( { map: _transmissionRenderTarget.texture } );

				const mesh = new Mesh( geometry, material );
				scene.add( mesh );
				*/
            }

            const transmissionRenderTarget = currentRenderState.state.transmissionRenderTarget[camera.id];

            const activeViewport = camera.viewport || _currentViewport;
            transmissionRenderTarget.setSize(activeViewport.z, activeViewport.w);

            //

            const currentRenderTarget = _this.getRenderTarget();
            _this.setRenderTarget(transmissionRenderTarget);

            _this.getClearColor(_currentClearColor);
            _currentClearAlpha = _this.getClearAlpha();
            if (_currentClearAlpha < 1) _this.setClearColor(0xffffff, 0.5);

            if (_renderBackground) {
                background.render(scene);
            } else {
                _this.clear();
            }

            // Turn off the features which can affect the frag color for opaque objects pass.
            // Otherwise they are applied twice in opaque objects pass and transmission objects pass.
            const currentToneMapping = _this.toneMapping;
            _this.toneMapping = NoToneMapping;

            // Remove viewport from camera to avoid nested render calls resetting viewport to it (e.g Reflector).
            // Transmission render pass requires viewport to match the transmissionRenderTarget.
            const currentCameraViewport = camera.viewport;
            if (camera.viewport !== undefined) camera.viewport = undefined;

            currentRenderState.setupLightsView(camera);

            if (_clippingEnabled === true) clipping.setGlobalState(_this.clippingPlanes, camera);

            renderObjects(opaqueObjects, scene, camera);

            textures.updateMultisampleRenderTarget(transmissionRenderTarget);
            textures.updateRenderTargetMipmap(transmissionRenderTarget);

            if (extensions.has("WEBGL_multisampled_render_to_texture") === false) {
                // see #28131

                let renderTargetNeedsUpdate = false;

                for (let i = 0, l = transmissiveObjects.length; i < l; i++) {
                    const renderItem = transmissiveObjects[i];

                    const object = renderItem.object;
                    const geometry = renderItem.geometry;
                    const material = renderItem.material;
                    const group = renderItem.group;

                    if (material.side === DoubleSide && object.layers.test(camera.layers)) {
                        const currentSide = material.side;

                        material.side = BackSide;
                        material.needsUpdate = true;

                        renderObject(object, scene, camera, geometry, material, group);

                        material.side = currentSide;
                        material.needsUpdate = true;

                        renderTargetNeedsUpdate = true;
                    }
                }

                if (renderTargetNeedsUpdate === true) {
                    textures.updateMultisampleRenderTarget(transmissionRenderTarget);
                    textures.updateRenderTargetMipmap(transmissionRenderTarget);
                }
            }

            _this.setRenderTarget(currentRenderTarget);

            _this.setClearColor(_currentClearColor, _currentClearAlpha);

            if (currentCameraViewport !== undefined) camera.viewport = currentCameraViewport;

            _this.toneMapping = currentToneMapping;
        }

        function renderObjects(renderList, scene, camera) {
            const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;

            for (let i = 0, l = renderList.length; i < l; i++) {
                const renderItem = renderList[i];

                const object = renderItem.object;
                const geometry = renderItem.geometry;
                const material = overrideMaterial === null ? renderItem.material : overrideMaterial;
                const group = renderItem.group;

                if (object.layers.test(camera.layers)) {
                    renderObject(object, scene, camera, geometry, material, group);
                }
            }
        }

        function renderObject(object, scene, camera, geometry, material, group) {
            object.onBeforeRender(_this, scene, camera, geometry, material, group);

            object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
            object.normalMatrix.getNormalMatrix(object.modelViewMatrix);

            if (material.transparent === true && material.side === DoubleSide && material.forceSinglePass === false) {
                material.side = BackSide;
                material.needsUpdate = true;
                _this.renderBufferDirect(camera, scene, geometry, material, object, group);

                material.side = FrontSide;
                material.needsUpdate = true;
                _this.renderBufferDirect(camera, scene, geometry, material, object, group);

                material.side = DoubleSide;
            } else {
                _this.renderBufferDirect(camera, scene, geometry, material, object, group);
            }

            object.onAfterRender(_this, scene, camera, geometry, material, group);
        }

        function getProgram(material, scene, object) {
            if (scene.isScene !== true) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...

            const materialProperties = properties.get(material);

            const lights = currentRenderState.state.lights;
            const shadowsArray = currentRenderState.state.shadowsArray;

            const lightsStateVersion = lights.state.version;

            const parameters = programCache.getParameters(material, lights.state, shadowsArray, scene, object);
            const programCacheKey = programCache.getProgramCacheKey(parameters);

            let programs = materialProperties.programs;

            // always update environment and fog - changing these trigger an getProgram call, but it's possible that the program doesn't change

            materialProperties.environment = material.isMeshStandardMaterial ? scene.environment : null;
            materialProperties.fog = scene.fog;
            materialProperties.envMap = (material.isMeshStandardMaterial ? cubeuvmaps : cubemaps).get(
                material.envMap || materialProperties.environment
            );
            materialProperties.envMapRotation =
                materialProperties.environment !== null && material.envMap === null
                    ? scene.environmentRotation
                    : material.envMapRotation;

            if (programs === undefined) {
                // new material

                material.addEventListener("dispose", onMaterialDispose);

                programs = new Map();
                materialProperties.programs = programs;
            }

            let program = programs.get(programCacheKey);

            if (program !== undefined) {
                // early out if program and light state is identical

                if (
                    materialProperties.currentProgram === program &&
                    materialProperties.lightsStateVersion === lightsStateVersion
                ) {
                    updateCommonMaterialProperties(material, parameters);

                    return program;
                }
            } else {
                parameters.uniforms = programCache.getUniforms(material);

                material.onBeforeCompile(parameters, _this);

                program = programCache.acquireProgram(parameters, programCacheKey);
                programs.set(programCacheKey, program);

                materialProperties.uniforms = parameters.uniforms;
            }

            const uniforms = materialProperties.uniforms;

            if ((!material.isShaderMaterial && !material.isRawShaderMaterial) || material.clipping === true) {
                uniforms.clippingPlanes = clipping.uniform;
            }

            updateCommonMaterialProperties(material, parameters);

            // store the light setup it was created for

            materialProperties.needsLights = materialNeedsLights(material);
            materialProperties.lightsStateVersion = lightsStateVersion;

            if (materialProperties.needsLights) {
                // wire up the material to this renderer's lighting state

                uniforms.ambientLightColor.value = lights.state.ambient;
                uniforms.lightProbe.value = lights.state.probe;
                uniforms.directionalLights.value = lights.state.directional;
                uniforms.directionalLightShadows.value = lights.state.directionalShadow;
                uniforms.spotLights.value = lights.state.spot;
                uniforms.spotLightShadows.value = lights.state.spotShadow;
                uniforms.rectAreaLights.value = lights.state.rectArea;
                uniforms.ltc_1.value = lights.state.rectAreaLTC1;
                uniforms.ltc_2.value = lights.state.rectAreaLTC2;
                uniforms.pointLights.value = lights.state.point;
                uniforms.pointLightShadows.value = lights.state.pointShadow;
                uniforms.hemisphereLights.value = lights.state.hemi;

                uniforms.directionalShadowMap.value = lights.state.directionalShadowMap;
                uniforms.directionalShadowMatrix.value = lights.state.directionalShadowMatrix;
                uniforms.spotShadowMap.value = lights.state.spotShadowMap;
                uniforms.spotLightMatrix.value = lights.state.spotLightMatrix;
                uniforms.spotLightMap.value = lights.state.spotLightMap;
                uniforms.pointShadowMap.value = lights.state.pointShadowMap;
                uniforms.pointShadowMatrix.value = lights.state.pointShadowMatrix;
                // TODO (abelnation): add area lights shadow info to uniforms
            }

            materialProperties.currentProgram = program;
            materialProperties.uniformsList = null;

            return program;
        }

        function getUniformList(materialProperties) {
            if (materialProperties.uniformsList === null) {
                const progUniforms = materialProperties.currentProgram.getUniforms();
                materialProperties.uniformsList = WebGLUniforms.seqWithValue(
                    progUniforms.seq,
                    materialProperties.uniforms
                );
            }

            return materialProperties.uniformsList;
        }

        function updateCommonMaterialProperties(material, parameters) {
            const materialProperties = properties.get(material);

            materialProperties.outputColorSpace = parameters.outputColorSpace;
            materialProperties.batching = parameters.batching;
            materialProperties.batchingColor = parameters.batchingColor;
            materialProperties.instancing = parameters.instancing;
            materialProperties.instancingColor = parameters.instancingColor;
            materialProperties.instancingMorph = parameters.instancingMorph;
            materialProperties.skinning = parameters.skinning;
            materialProperties.morphTargets = parameters.morphTargets;
            materialProperties.morphNormals = parameters.morphNormals;
            materialProperties.morphColors = parameters.morphColors;
            materialProperties.morphTargetsCount = parameters.morphTargetsCount;
            materialProperties.numClippingPlanes = parameters.numClippingPlanes;
            materialProperties.numIntersection = parameters.numClipIntersection;
            materialProperties.vertexAlphas = parameters.vertexAlphas;
            materialProperties.vertexTangents = parameters.vertexTangents;
            materialProperties.toneMapping = parameters.toneMapping;
        }

        function setProgram(camera, scene, geometry, material, object) {
            if (scene.isScene !== true) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...

            textures.resetTextureUnits();

            const fog = scene.fog;
            const environment = material.isMeshStandardMaterial ? scene.environment : null;
            const colorSpace =
                _currentRenderTarget === null
                    ? _this.outputColorSpace
                    : _currentRenderTarget.isXRRenderTarget === true
                    ? _currentRenderTarget.texture.colorSpace
                    : LinearSRGBColorSpace;
            const envMap = (material.isMeshStandardMaterial ? cubeuvmaps : cubemaps).get(
                material.envMap || environment
            );
            const vertexAlphas =
                material.vertexColors === true &&
                !!geometry.attributes.color &&
                geometry.attributes.color.itemSize === 4;
            const vertexTangents = !!geometry.attributes.tangent && (!!material.normalMap || material.anisotropy > 0);
            const morphTargets = !!geometry.morphAttributes.position;
            const morphNormals = !!geometry.morphAttributes.normal;
            const morphColors = !!geometry.morphAttributes.color;

            let toneMapping = NoToneMapping;

            if (material.toneMapped) {
                if (_currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true) {
                    toneMapping = _this.toneMapping;
                }
            }

            const morphAttribute =
                geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color;
            const morphTargetsCount = morphAttribute !== undefined ? morphAttribute.length : 0;

            const materialProperties = properties.get(material);
            const lights = currentRenderState.state.lights;

            if (_clippingEnabled === true) {
                if (_localClippingEnabled === true || camera !== _currentCamera) {
                    const useCache = camera === _currentCamera && material.id === _currentMaterialId;

                    // we might want to call this function with some ClippingGroup
                    // object instead of the material, once it becomes feasible
                    // (#8465, #8379)
                    clipping.setState(material, camera, useCache);
                }
            }

            //

            let needsProgramChange = false;

            if (material.version === materialProperties.__version) {
                if (materialProperties.needsLights && materialProperties.lightsStateVersion !== lights.state.version) {
                    needsProgramChange = true;
                } else if (materialProperties.outputColorSpace !== colorSpace) {
                    needsProgramChange = true;
                } else if (object.isBatchedMesh && materialProperties.batching === false) {
                    needsProgramChange = true;
                } else if (!object.isBatchedMesh && materialProperties.batching === true) {
                    needsProgramChange = true;
                } else if (
                    object.isBatchedMesh &&
                    materialProperties.batchingColor === true &&
                    object.colorTexture === null
                ) {
                    needsProgramChange = true;
                } else if (
                    object.isBatchedMesh &&
                    materialProperties.batchingColor === false &&
                    object.colorTexture !== null
                ) {
                    needsProgramChange = true;
                } else if (object.isInstancedMesh && materialProperties.instancing === false) {
                    needsProgramChange = true;
                } else if (!object.isInstancedMesh && materialProperties.instancing === true) {
                    needsProgramChange = true;
                } else if (object.isSkinnedMesh && materialProperties.skinning === false) {
                    needsProgramChange = true;
                } else if (!object.isSkinnedMesh && materialProperties.skinning === true) {
                    needsProgramChange = true;
                } else if (
                    object.isInstancedMesh &&
                    materialProperties.instancingColor === true &&
                    object.instanceColor === null
                ) {
                    needsProgramChange = true;
                } else if (
                    object.isInstancedMesh &&
                    materialProperties.instancingColor === false &&
                    object.instanceColor !== null
                ) {
                    needsProgramChange = true;
                } else if (
                    object.isInstancedMesh &&
                    materialProperties.instancingMorph === true &&
                    object.morphTexture === null
                ) {
                    needsProgramChange = true;
                } else if (
                    object.isInstancedMesh &&
                    materialProperties.instancingMorph === false &&
                    object.morphTexture !== null
                ) {
                    needsProgramChange = true;
                } else if (materialProperties.envMap !== envMap) {
                    needsProgramChange = true;
                } else if (material.fog === true && materialProperties.fog !== fog) {
                    needsProgramChange = true;
                } else if (
                    materialProperties.numClippingPlanes !== undefined &&
                    (materialProperties.numClippingPlanes !== clipping.numPlanes ||
                        materialProperties.numIntersection !== clipping.numIntersection)
                ) {
                    needsProgramChange = true;
                } else if (materialProperties.vertexAlphas !== vertexAlphas) {
                    needsProgramChange = true;
                } else if (materialProperties.vertexTangents !== vertexTangents) {
                    needsProgramChange = true;
                } else if (materialProperties.morphTargets !== morphTargets) {
                    needsProgramChange = true;
                } else if (materialProperties.morphNormals !== morphNormals) {
                    needsProgramChange = true;
                } else if (materialProperties.morphColors !== morphColors) {
                    needsProgramChange = true;
                } else if (materialProperties.toneMapping !== toneMapping) {
                    needsProgramChange = true;
                } else if (materialProperties.morphTargetsCount !== morphTargetsCount) {
                    needsProgramChange = true;
                }
            } else {
                needsProgramChange = true;
                materialProperties.__version = material.version;
            }

            //

            let program = materialProperties.currentProgram;

            if (needsProgramChange === true) {
                program = getProgram(material, scene, object);
            }

            let refreshProgram = false;
            let refreshMaterial = false;
            let refreshLights = false;

            const p_uniforms = program.getUniforms(),
                m_uniforms = materialProperties.uniforms;

            if (state.useProgram(program.program)) {
                refreshProgram = true;
                refreshMaterial = true;
                refreshLights = true;
            }

            if (material.id !== _currentMaterialId) {
                _currentMaterialId = material.id;

                refreshMaterial = true;
            }

            if (refreshProgram || _currentCamera !== camera) {
                // common camera uniforms

                p_uniforms.setValue(_gl, "projectionMatrix", camera.projectionMatrix);
                p_uniforms.setValue(_gl, "viewMatrix", camera.matrixWorldInverse);

                const uCamPos = p_uniforms.map.cameraPosition;

                if (uCamPos !== undefined) {
                    uCamPos.setValue(_gl, _vector3.setFromMatrixPosition(camera.matrixWorld));
                }

                if (capabilities.logarithmicDepthBuffer) {
                    p_uniforms.setValue(_gl, "logDepthBufFC", 2.0 / (Math.log(camera.far + 1.0) / Math.LN2));
                }

                // consider moving isOrthographic to UniformLib and WebGLMaterials, see https://github.com/mrdoob/three.js/pull/26467#issuecomment-1645185067

                if (
                    material.isMeshPhongMaterial ||
                    material.isMeshToonMaterial ||
                    material.isMeshLambertMaterial ||
                    material.isMeshBasicMaterial ||
                    material.isMeshStandardMaterial ||
                    material.isShaderMaterial
                ) {
                    p_uniforms.setValue(_gl, "isOrthographic", camera.isOrthographicCamera === true);
                }

                if (_currentCamera !== camera) {
                    _currentCamera = camera;

                    // lighting uniforms depend on the camera so enforce an update
                    // now, in case this material supports lights - or later, when
                    // the next material that does gets activated:

                    refreshMaterial = true; // set to true on material change
                    refreshLights = true; // remains set until update done
                }
            }

            // skinning and morph target uniforms must be set even if material didn't change
            // auto-setting of texture unit for bone and morph texture must go before other textures
            // otherwise textures used for skinning and morphing can take over texture units reserved for other material textures

            if (object.isSkinnedMesh) {
                p_uniforms.setOptional(_gl, object, "bindMatrix");
                p_uniforms.setOptional(_gl, object, "bindMatrixInverse");

                const skeleton = object.skeleton;

                if (skeleton) {
                    if (skeleton.boneTexture === null) skeleton.computeBoneTexture();

                    p_uniforms.setValue(_gl, "boneTexture", skeleton.boneTexture, textures);
                }
            }

            if (object.isBatchedMesh) {
                p_uniforms.setOptional(_gl, object, "batchingTexture");
                p_uniforms.setValue(_gl, "batchingTexture", object._matricesTexture, textures);

                p_uniforms.setOptional(_gl, object, "batchingIdTexture");
                p_uniforms.setValue(_gl, "batchingIdTexture", object._indirectTexture, textures);

                p_uniforms.setOptional(_gl, object, "batchingColorTexture");
                if (object._colorsTexture !== null) {
                    p_uniforms.setValue(_gl, "batchingColorTexture", object._colorsTexture, textures);
                }
            }

            const morphAttributes = geometry.morphAttributes;

            if (
                morphAttributes.position !== undefined ||
                morphAttributes.normal !== undefined ||
                morphAttributes.color !== undefined
            ) {
                morphtargets.update(object, geometry, program);
            }

            if (refreshMaterial || materialProperties.receiveShadow !== object.receiveShadow) {
                materialProperties.receiveShadow = object.receiveShadow;
                p_uniforms.setValue(_gl, "receiveShadow", object.receiveShadow);
            }

            // https://github.com/mrdoob/three.js/pull/24467#issuecomment-1209031512

            if (material.isMeshGouraudMaterial && material.envMap !== null) {
                m_uniforms.envMap.value = envMap;

                m_uniforms.flipEnvMap.value = envMap.isCubeTexture && envMap.isRenderTargetTexture === false ? -1 : 1;
            }

            if (material.isMeshStandardMaterial && material.envMap === null && scene.environment !== null) {
                m_uniforms.envMapIntensity.value = scene.environmentIntensity;
            }

            if (refreshMaterial) {
                p_uniforms.setValue(_gl, "toneMappingExposure", _this.toneMappingExposure);

                if (materialProperties.needsLights) {
                    // the current material requires lighting info

                    // note: all lighting uniforms are always set correctly
                    // they simply reference the renderer's state for their
                    // values
                    //
                    // use the current material's .needsUpdate flags to set
                    // the GL state when required

                    markUniformsLightsNeedsUpdate(m_uniforms, refreshLights);
                }

                // refresh uniforms common to several materials

                if (fog && material.fog === true) {
                    materials.refreshFogUniforms(m_uniforms, fog);
                }

                materials.refreshMaterialUniforms(
                    m_uniforms,
                    material,
                    _pixelRatio,
                    _height,
                    currentRenderState.state.transmissionRenderTarget[camera.id]
                );

                WebGLUniforms.upload(_gl, getUniformList(materialProperties), m_uniforms, textures);
            }

            if (material.isShaderMaterial && material.uniformsNeedUpdate === true) {
                WebGLUniforms.upload(_gl, getUniformList(materialProperties), m_uniforms, textures);
                material.uniformsNeedUpdate = false;
            }

            if (material.isSpriteMaterial) {
                p_uniforms.setValue(_gl, "center", object.center);
            }

            // common matrices

            p_uniforms.setValue(_gl, "modelViewMatrix", object.modelViewMatrix);
            p_uniforms.setValue(_gl, "normalMatrix", object.normalMatrix);
            p_uniforms.setValue(_gl, "modelMatrix", object.matrixWorld);

            // UBOs

            if (material.isShaderMaterial || material.isRawShaderMaterial) {
                const groups = material.uniformsGroups;

                for (let i = 0, l = groups.length; i < l; i++) {
                    const group = groups[i];

                    uniformsGroups.update(group, program);
                    uniformsGroups.bind(group, program);
                }
            }

            return program;
        }

        // If uniforms are marked as clean, they don't need to be loaded to the GPU.

        function markUniformsLightsNeedsUpdate(uniforms, value) {
            uniforms.ambientLightColor.needsUpdate = value;
            uniforms.lightProbe.needsUpdate = value;

            uniforms.directionalLights.needsUpdate = value;
            uniforms.directionalLightShadows.needsUpdate = value;
            uniforms.pointLights.needsUpdate = value;
            uniforms.pointLightShadows.needsUpdate = value;
            uniforms.spotLights.needsUpdate = value;
            uniforms.spotLightShadows.needsUpdate = value;
            uniforms.rectAreaLights.needsUpdate = value;
            uniforms.hemisphereLights.needsUpdate = value;
        }

        function materialNeedsLights(material) {
            return (
                material.isMeshLambertMaterial ||
                material.isMeshToonMaterial ||
                material.isMeshPhongMaterial ||
                material.isMeshStandardMaterial ||
                material.isShadowMaterial ||
                (material.isShaderMaterial && material.lights === true)
            );
        }

        this.getActiveCubeFace = function () {
            return _currentActiveCubeFace;
        };

        this.getActiveMipmapLevel = function () {
            return _currentActiveMipmapLevel;
        };

        this.getRenderTarget = function () {
            return _currentRenderTarget;
        };

        this.setRenderTargetTextures = function (renderTarget, colorTexture, depthTexture) {
            properties.get(renderTarget.texture).__webglTexture = colorTexture;
            properties.get(renderTarget.depthTexture).__webglTexture = depthTexture;

            const renderTargetProperties = properties.get(renderTarget);
            renderTargetProperties.__hasExternalTextures = true;

            renderTargetProperties.__autoAllocateDepthBuffer = depthTexture === undefined;

            if (!renderTargetProperties.__autoAllocateDepthBuffer) {
                // The multisample_render_to_texture extension doesn't work properly if there
                // are midframe flushes and an external depth buffer. Disable use of the extension.
                if (extensions.has("WEBGL_multisampled_render_to_texture") === true) {
                    console.warn(
                        "THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"
                    );
                    renderTargetProperties.__useRenderToTexture = false;
                }
            }
        };

        this.setRenderTargetFramebuffer = function (renderTarget, defaultFramebuffer) {
            const renderTargetProperties = properties.get(renderTarget);
            renderTargetProperties.__webglFramebuffer = defaultFramebuffer;
            renderTargetProperties.__useDefaultFramebuffer = defaultFramebuffer === undefined;
        };

        this.setRenderTarget = function (renderTarget, activeCubeFace = 0, activeMipmapLevel = 0) {
            _currentRenderTarget = renderTarget;
            _currentActiveCubeFace = activeCubeFace;
            _currentActiveMipmapLevel = activeMipmapLevel;

            let useDefaultFramebuffer = true;
            let framebuffer = null;
            let isCube = false;
            let isRenderTarget3D = false;

            if (renderTarget) {
                const renderTargetProperties = properties.get(renderTarget);

                if (renderTargetProperties.__useDefaultFramebuffer !== undefined) {
                    // We need to make sure to rebind the framebuffer.
                    state.bindFramebuffer(_gl.FRAMEBUFFER, null);
                    useDefaultFramebuffer = false;
                } else if (renderTargetProperties.__webglFramebuffer === undefined) {
                    textures.setupRenderTarget(renderTarget);
                } else if (renderTargetProperties.__hasExternalTextures) {
                    // Color and depth texture must be rebound in order for the swapchain to update.
                    textures.rebindTextures(
                        renderTarget,
                        properties.get(renderTarget.texture).__webglTexture,
                        properties.get(renderTarget.depthTexture).__webglTexture
                    );
                }

                const texture = renderTarget.texture;

                if (texture.isData3DTexture || texture.isDataArrayTexture || texture.isCompressedArrayTexture) {
                    isRenderTarget3D = true;
                }

                const __webglFramebuffer = properties.get(renderTarget).__webglFramebuffer;

                if (renderTarget.isWebGLCubeRenderTarget) {
                    if (Array.isArray(__webglFramebuffer[activeCubeFace])) {
                        framebuffer = __webglFramebuffer[activeCubeFace][activeMipmapLevel];
                    } else {
                        framebuffer = __webglFramebuffer[activeCubeFace];
                    }

                    isCube = true;
                } else if (renderTarget.samples > 0 && textures.useMultisampledRTT(renderTarget) === false) {
                    framebuffer = properties.get(renderTarget).__webglMultisampledFramebuffer;
                } else {
                    if (Array.isArray(__webglFramebuffer)) {
                        framebuffer = __webglFramebuffer[activeMipmapLevel];
                    } else {
                        framebuffer = __webglFramebuffer;
                    }
                }

                _currentViewport.copy(renderTarget.viewport);
                _currentScissor.copy(renderTarget.scissor);
                _currentScissorTest = renderTarget.scissorTest;
            } else {
                _currentViewport.copy(_viewport).multiplyScalar(_pixelRatio).floor();
                _currentScissor.copy(_scissor).multiplyScalar(_pixelRatio).floor();
                _currentScissorTest = _scissorTest;
            }

            const framebufferBound = state.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);

            if (framebufferBound && useDefaultFramebuffer) {
                state.drawBuffers(renderTarget, framebuffer);
            }

            state.viewport(_currentViewport);
            state.scissor(_currentScissor);
            state.setScissorTest(_currentScissorTest);

            if (isCube) {
                const textureProperties = properties.get(renderTarget.texture);
                _gl.framebufferTexture2D(
                    _gl.FRAMEBUFFER,
                    _gl.COLOR_ATTACHMENT0,
                    _gl.TEXTURE_CUBE_MAP_POSITIVE_X + activeCubeFace,
                    textureProperties.__webglTexture,
                    activeMipmapLevel
                );
            } else if (isRenderTarget3D) {
                const textureProperties = properties.get(renderTarget.texture);
                const layer = activeCubeFace || 0;
                _gl.framebufferTextureLayer(
                    _gl.FRAMEBUFFER,
                    _gl.COLOR_ATTACHMENT0,
                    textureProperties.__webglTexture,
                    activeMipmapLevel || 0,
                    layer
                );
            }

            _currentMaterialId = -1; // reset current material to ensure correct uniform bindings
        };

        this.readRenderTargetPixels = function (renderTarget, x, y, width, height, buffer, activeCubeFaceIndex) {
            if (!(renderTarget && renderTarget.isWebGLRenderTarget)) {
                console.error(
                    "THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget."
                );
                return;
            }

            let framebuffer = properties.get(renderTarget).__webglFramebuffer;

            if (renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined) {
                framebuffer = framebuffer[activeCubeFaceIndex];
            }

            if (framebuffer) {
                state.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);

                try {
                    const texture = renderTarget.texture;
                    const textureFormat = texture.format;
                    const textureType = texture.type;

                    if (!capabilities.textureFormatReadable(textureFormat)) {
                        console.error(
                            "THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format."
                        );
                        return;
                    }

                    if (!capabilities.textureTypeReadable(textureType)) {
                        console.error(
                            "THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type."
                        );
                        return;
                    }

                    // the following if statement ensures valid read requests (no out-of-bounds pixels, see #8604)

                    if (x >= 0 && x <= renderTarget.width - width && y >= 0 && y <= renderTarget.height - height) {
                        _gl.readPixels(
                            x,
                            y,
                            width,
                            height,
                            utils.convert(textureFormat),
                            utils.convert(textureType),
                            buffer
                        );
                    }
                } finally {
                    // restore framebuffer of current render target if necessary

                    const framebuffer =
                        _currentRenderTarget !== null ? properties.get(_currentRenderTarget).__webglFramebuffer : null;
                    state.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);
                }
            }
        };

        this.readRenderTargetPixelsAsync = async function (
            renderTarget,
            x,
            y,
            width,
            height,
            buffer,
            activeCubeFaceIndex
        ) {
            if (!(renderTarget && renderTarget.isWebGLRenderTarget)) {
                throw new Error(
                    "THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget."
                );
            }

            let framebuffer = properties.get(renderTarget).__webglFramebuffer;
            if (renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined) {
                framebuffer = framebuffer[activeCubeFaceIndex];
            }

            if (framebuffer) {
                state.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);

                try {
                    const texture = renderTarget.texture;
                    const textureFormat = texture.format;
                    const textureType = texture.type;

                    if (!capabilities.textureFormatReadable(textureFormat)) {
                        throw new Error(
                            "THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format."
                        );
                    }

                    if (!capabilities.textureTypeReadable(textureType)) {
                        throw new Error(
                            "THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type."
                        );
                    }

                    // the following if statement ensures valid read requests (no out-of-bounds pixels, see #8604)
                    if (x >= 0 && x <= renderTarget.width - width && y >= 0 && y <= renderTarget.height - height) {
                        const glBuffer = _gl.createBuffer();
                        _gl.bindBuffer(_gl.PIXEL_PACK_BUFFER, glBuffer);
                        _gl.bufferData(_gl.PIXEL_PACK_BUFFER, buffer.byteLength, _gl.STREAM_READ);
                        _gl.readPixels(
                            x,
                            y,
                            width,
                            height,
                            utils.convert(textureFormat),
                            utils.convert(textureType),
                            0
                        );
                        _gl.flush();

                        // check if the commands have finished every 8 ms
                        const sync = _gl.fenceSync(_gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                        await probeAsync(_gl, sync, 4);

                        try {
                            _gl.bindBuffer(_gl.PIXEL_PACK_BUFFER, glBuffer);
                            _gl.getBufferSubData(_gl.PIXEL_PACK_BUFFER, 0, buffer);
                        } finally {
                            _gl.deleteBuffer(glBuffer);
                            _gl.deleteSync(sync);
                        }

                        return buffer;
                    }
                } finally {
                    // restore framebuffer of current render target if necessary

                    const framebuffer =
                        _currentRenderTarget !== null ? properties.get(_currentRenderTarget).__webglFramebuffer : null;
                    state.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);
                }
            }
        };

        this.copyFramebufferToTexture = function (texture, position = null, level = 0) {
            // support previous signature with position first
            if (texture.isTexture !== true) {
                // @deprecated, r165
                console.warn("WebGLRenderer: copyFramebufferToTexture function signature has changed.");

                position = arguments[0] || null;
                texture = arguments[1];
            }

            const levelScale = Math.pow(2, -level);
            const width = Math.floor(texture.image.width * levelScale);
            const height = Math.floor(texture.image.height * levelScale);

            const x = position !== null ? position.x : 0;
            const y = position !== null ? position.y : 0;

            textures.setTexture2D(texture, 0);

            _gl.copyTexSubImage2D(_gl.TEXTURE_2D, level, 0, 0, x, y, width, height);

            state.unbindTexture();
        };

        this.copyTextureToTexture = function (srcTexture, dstTexture, srcRegion = null, dstPosition = null, level = 0) {
            // support previous signature with dstPosition first
            if (srcTexture.isTexture !== true) {
                // @deprecated, r165
                console.warn("WebGLRenderer: copyTextureToTexture function signature has changed.");

                dstPosition = arguments[0] || null;
                srcTexture = arguments[1];
                dstTexture = arguments[2];
                level = arguments[3] || 0;
                srcRegion = null;
            }

            let width, height, minX, minY;
            let dstX, dstY;
            if (srcRegion !== null) {
                width = srcRegion.max.x - srcRegion.min.x;
                height = srcRegion.max.y - srcRegion.min.y;
                minX = srcRegion.min.x;
                minY = srcRegion.min.y;
            } else {
                width = srcTexture.image.width;
                height = srcTexture.image.height;
                minX = 0;
                minY = 0;
            }

            if (dstPosition !== null) {
                dstX = dstPosition.x;
                dstY = dstPosition.y;
            } else {
                dstX = 0;
                dstY = 0;
            }

            const glFormat = utils.convert(dstTexture.format);
            const glType = utils.convert(dstTexture.type);

            textures.setTexture2D(dstTexture, 0);

            // As another texture upload may have changed pixelStorei
            // parameters, make sure they are correct for the dstTexture
            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, dstTexture.flipY);
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, dstTexture.premultiplyAlpha);
            _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, dstTexture.unpackAlignment);

            const currentUnpackRowLen = _gl.getParameter(_gl.UNPACK_ROW_LENGTH);
            const currentUnpackImageHeight = _gl.getParameter(_gl.UNPACK_IMAGE_HEIGHT);
            const currentUnpackSkipPixels = _gl.getParameter(_gl.UNPACK_SKIP_PIXELS);
            const currentUnpackSkipRows = _gl.getParameter(_gl.UNPACK_SKIP_ROWS);
            const currentUnpackSkipImages = _gl.getParameter(_gl.UNPACK_SKIP_IMAGES);

            const image = srcTexture.isCompressedTexture ? srcTexture.mipmaps[level] : srcTexture.image;

            _gl.pixelStorei(_gl.UNPACK_ROW_LENGTH, image.width);
            _gl.pixelStorei(_gl.UNPACK_IMAGE_HEIGHT, image.height);
            _gl.pixelStorei(_gl.UNPACK_SKIP_PIXELS, minX);
            _gl.pixelStorei(_gl.UNPACK_SKIP_ROWS, minY);

            if (srcTexture.isDataTexture) {
                _gl.texSubImage2D(_gl.TEXTURE_2D, level, dstX, dstY, width, height, glFormat, glType, image.data);
            } else {
                if (srcTexture.isCompressedTexture) {
                    _gl.compressedTexSubImage2D(
                        _gl.TEXTURE_2D,
                        level,
                        dstX,
                        dstY,
                        image.width,
                        image.height,
                        glFormat,
                        image.data
                    );
                } else {
                    _gl.texSubImage2D(_gl.TEXTURE_2D, level, dstX, dstY, width, height, glFormat, glType, image);
                }
            }

            _gl.pixelStorei(_gl.UNPACK_ROW_LENGTH, currentUnpackRowLen);
            _gl.pixelStorei(_gl.UNPACK_IMAGE_HEIGHT, currentUnpackImageHeight);
            _gl.pixelStorei(_gl.UNPACK_SKIP_PIXELS, currentUnpackSkipPixels);
            _gl.pixelStorei(_gl.UNPACK_SKIP_ROWS, currentUnpackSkipRows);
            _gl.pixelStorei(_gl.UNPACK_SKIP_IMAGES, currentUnpackSkipImages);

            // Generate mipmaps only when copying level 0
            if (level === 0 && dstTexture.generateMipmaps) _gl.generateMipmap(_gl.TEXTURE_2D);

            state.unbindTexture();
        };

        this.copyTextureToTexture3D = function (
            srcTexture,
            dstTexture,
            srcRegion = null,
            dstPosition = null,
            level = 0
        ) {
            // support previous signature with source box first
            if (srcTexture.isTexture !== true) {
                // @deprecated, r165
                console.warn("WebGLRenderer: copyTextureToTexture3D function signature has changed.");

                srcRegion = arguments[0] || null;
                dstPosition = arguments[1] || null;
                srcTexture = arguments[2];
                dstTexture = arguments[3];
                level = arguments[4] || 0;
            }

            let width, height, depth, minX, minY, minZ;
            let dstX, dstY, dstZ;
            const image = srcTexture.isCompressedTexture ? srcTexture.mipmaps[level] : srcTexture.image;
            if (srcRegion !== null) {
                width = srcRegion.max.x - srcRegion.min.x;
                height = srcRegion.max.y - srcRegion.min.y;
                depth = srcRegion.max.z - srcRegion.min.z;
                minX = srcRegion.min.x;
                minY = srcRegion.min.y;
                minZ = srcRegion.min.z;
            } else {
                width = image.width;
                height = image.height;
                depth = image.depth;
                minX = 0;
                minY = 0;
                minZ = 0;
            }

            if (dstPosition !== null) {
                dstX = dstPosition.x;
                dstY = dstPosition.y;
                dstZ = dstPosition.z;
            } else {
                dstX = 0;
                dstY = 0;
                dstZ = 0;
            }

            const glFormat = utils.convert(dstTexture.format);
            const glType = utils.convert(dstTexture.type);
            let glTarget;

            if (dstTexture.isData3DTexture) {
                textures.setTexture3D(dstTexture, 0);
                glTarget = _gl.TEXTURE_3D;
            } else if (dstTexture.isDataArrayTexture || dstTexture.isCompressedArrayTexture) {
                textures.setTexture2DArray(dstTexture, 0);
                glTarget = _gl.TEXTURE_2D_ARRAY;
            } else {
                console.warn(
                    "THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray."
                );
                return;
            }

            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, dstTexture.flipY);
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, dstTexture.premultiplyAlpha);
            _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, dstTexture.unpackAlignment);

            const currentUnpackRowLen = _gl.getParameter(_gl.UNPACK_ROW_LENGTH);
            const currentUnpackImageHeight = _gl.getParameter(_gl.UNPACK_IMAGE_HEIGHT);
            const currentUnpackSkipPixels = _gl.getParameter(_gl.UNPACK_SKIP_PIXELS);
            const currentUnpackSkipRows = _gl.getParameter(_gl.UNPACK_SKIP_ROWS);
            const currentUnpackSkipImages = _gl.getParameter(_gl.UNPACK_SKIP_IMAGES);

            _gl.pixelStorei(_gl.UNPACK_ROW_LENGTH, image.width);
            _gl.pixelStorei(_gl.UNPACK_IMAGE_HEIGHT, image.height);
            _gl.pixelStorei(_gl.UNPACK_SKIP_PIXELS, minX);
            _gl.pixelStorei(_gl.UNPACK_SKIP_ROWS, minY);
            _gl.pixelStorei(_gl.UNPACK_SKIP_IMAGES, minZ);

            if (srcTexture.isDataTexture || srcTexture.isData3DTexture) {
                _gl.texSubImage3D(
                    glTarget,
                    level,
                    dstX,
                    dstY,
                    dstZ,
                    width,
                    height,
                    depth,
                    glFormat,
                    glType,
                    image.data
                );
            } else {
                if (dstTexture.isCompressedArrayTexture) {
                    _gl.compressedTexSubImage3D(
                        glTarget,
                        level,
                        dstX,
                        dstY,
                        dstZ,
                        width,
                        height,
                        depth,
                        glFormat,
                        image.data
                    );
                } else {
                    _gl.texSubImage3D(glTarget, level, dstX, dstY, dstZ, width, height, depth, glFormat, glType, image);
                }
            }

            _gl.pixelStorei(_gl.UNPACK_ROW_LENGTH, currentUnpackRowLen);
            _gl.pixelStorei(_gl.UNPACK_IMAGE_HEIGHT, currentUnpackImageHeight);
            _gl.pixelStorei(_gl.UNPACK_SKIP_PIXELS, currentUnpackSkipPixels);
            _gl.pixelStorei(_gl.UNPACK_SKIP_ROWS, currentUnpackSkipRows);
            _gl.pixelStorei(_gl.UNPACK_SKIP_IMAGES, currentUnpackSkipImages);

            // Generate mipmaps only when copying level 0
            if (level === 0 && dstTexture.generateMipmaps) _gl.generateMipmap(glTarget);

            state.unbindTexture();
        };

        this.initRenderTarget = function (target) {
            if (properties.get(target).__webglFramebuffer === undefined) {
                textures.setupRenderTarget(target);
            }
        };

        this.initTexture = function (texture) {
            if (texture.isCubeTexture) {
                textures.setTextureCube(texture, 0);
            } else if (texture.isData3DTexture) {
                textures.setTexture3D(texture, 0);
            } else if (texture.isDataArrayTexture || texture.isCompressedArrayTexture) {
                textures.setTexture2DArray(texture, 0);
            } else {
                textures.setTexture2D(texture, 0);
            }

            state.unbindTexture();
        };

        this.resetState = function () {
            _currentActiveCubeFace = 0;
            _currentActiveMipmapLevel = 0;
            _currentRenderTarget = null;

            state.reset();
            bindingStates.reset();
        };

        if (typeof __THREE_DEVTOOLS__ !== "undefined") {
            __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe", { detail: this }));
        }
    }

    get coordinateSystem() {
        return WebGLCoordinateSystem;
    }

    get outputColorSpace() {
        return this._outputColorSpace;
    }

    set outputColorSpace(colorSpace) {
        this._outputColorSpace = colorSpace;

        const gl = this.getContext();
        gl.drawingBufferColorSpace = colorSpace === DisplayP3ColorSpace ? "display-p3" : "srgb";
        gl.unpackColorSpace = ColorManagement.workingColorSpace === LinearDisplayP3ColorSpace ? "display-p3" : "srgb";
    }
}
