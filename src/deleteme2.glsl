* VERTEX * 
#version 300 es

#define attribute in
#define varying out
#define texture2D texture
    precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;

#define HIGH_PRECISION
#define SHADER_TYPE MeshPhongMaterial
#define SHADER_NAME 
#define USE_MAP
#define MAP_UV uv
#define USE_SHADOWMAP
#define SHADOWMAP_TYPE_PCF_SOFT
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
#ifdef USE_INSTANCING
attribute mat4 instanceMatrix;
#endif
#ifdef USE_INSTANCING_COLOR
attribute vec3 instanceColor;
#endif
#ifdef USE_INSTANCING_MORPH
uniform sampler2D morphTexture;
#endif
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
#ifdef USE_UV1
attribute vec2 uv1;
#endif
#ifdef USE_UV2
attribute vec2 uv2;
#endif
#ifdef USE_UV3
attribute vec2 uv3;
#endif
#ifdef USE_TANGENT
attribute vec4 tangent;
#endif
#if defined( USE_COLOR_ALPHA )
attribute vec4 color;
#elif defined( USE_COLOR )
attribute vec3 color;
#endif
#ifdef USE_SKINNING
attribute vec4 skinIndex;
attribute vec4 skinWeight;
#endif

#define PHONG
varying vec3 vViewPosition;
#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2(const in float x) {
return x * x;
}
vec3 pow2(const in vec3 x) {
return x * x;
}
float pow3(const in float x) {
return x * x * x;
}
float pow4(const in float x) {
float x2 = x * x;
return x2 * x2;
}
float max3(const in vec3 v) {
return max(max(v.x, v.y), v.z);
}
float average(const in vec3 v) {
return dot(v, vec3(0.3333333));
}
highp float rand(const in vec2 uv) {
const highp float a = 12.9898, b = 78.233, c = 43758.5453;
highp float dt = dot(uv.xy, vec2(a, b)), sn = mod(dt, PI);
return fract(sin(sn) * c);
}
#ifdef HIGH_PRECISION
float precisionSafeLength(vec3 v) {
return length(v);
}
#else
float precisionSafeLength(vec3 v) {
float maxComponent = max3(abs(v));
return length(v / maxComponent) * maxComponent;
}
#endif
struct IncidentLight {
vec3 color;
vec3 direction;
bool visible;
};
struct ReflectedLight {
vec3 directDiffuse;
vec3 directSpecular;
vec3 indirectDiffuse;
vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
varying vec3 vPosition;
#endif
vec3 transformDirection(in vec3 dir, in mat4 matrix) {
return normalize((matrix * vec4(dir, 0.0)).xyz);
}
vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {
return normalize((vec4(dir, 0.0) * matrix).xyz);
}
mat3 transposeMat3(const in mat3 m) {
mat3 tmp;
tmp[0] = vec3(m[0].x, m[1].x, m[2].x);
tmp[1] = vec3(m[0].y, m[1].y, m[2].y);
tmp[2] = vec3(m[0].z, m[1].z, m[2].z);
return tmp;
}
float luminance(const in vec3 rgb) {
const vec3 weights = vec3(0.2126729, 0.7151522, 0.0721750);
return dot(weights, rgb);
}
bool isPerspectiveMatrix(mat4 m) {
return m[2][3] == - 1.0;
}
vec2 equirectUv(in vec3 dir) {
float u = atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5;
float v = asin(clamp(dir.y, - 1.0, 1.0)) * RECIPROCAL_PI + 0.5;
return vec2(u, v);
}
vec3 BRDF_Lambert(const in vec3 diffuseColor) {
return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {
float fresnel = exp2((- 5.55473 * dotVH - 6.98316) * dotVH);
return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
float F_Schlick(const in float f0, const in float f90, const in float dotVH) {
float fresnel = exp2((- 5.55473 * dotVH - 6.98316) * dotVH);
return f0 * (1.0 - fresnel) + (f90 * fresnel);
} // validated
varying float zDepthScene;

#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
uniform int _gl_DrawID;
	#endif
uniform highp sampler2D batchingTexture;
uniform highp usampler2D batchingIdTexture;
mat4 getBatchingMatrix(const in float i) {
int size = textureSize(batchingTexture, 0).x;
int j = int(i) * 4;
int x = j % size;
int y = j / size;
vec4 v1 = texelFetch(batchingTexture, ivec2(x, y), 0);
vec4 v2 = texelFetch(batchingTexture, ivec2(x + 1, y), 0);
vec4 v3 = texelFetch(batchingTexture, ivec2(x + 2, y), 0);
vec4 v4 = texelFetch(batchingTexture, ivec2(x + 3, y), 0);
return mat4(v1, v2, v3, v4);
}
float getIndirectIndex(const in int i) {
int size = textureSize(batchingIdTexture, 0).x;
int x = i % size;
int y = i / size;
return float(texelFetch(batchingIdTexture, ivec2(x, y), 0).r);
}
#endif
#ifdef USE_BATCHING_COLOR
uniform sampler2D batchingColorTexture;
vec3 getBatchingColor(const in float i) {
int size = textureSize(batchingColorTexture, 0).x;
int j = int(i);
int x = j % size;
int y = j / size;
return texelFetch(batchingColorTexture, ivec2(x, y), 0).rgb;
}
#endif
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
varying vec2 vUv;
#endif
#ifdef USE_MAP
uniform mat3 mapTransform;
varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
uniform mat3 alphaMapTransform;
varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
uniform mat3 lightMapTransform;
varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
uniform mat3 aoMapTransform;
varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
uniform mat3 bumpMapTransform;
varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
uniform mat3 normalMapTransform;
varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
uniform mat3 displacementMapTransform;
varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
uniform mat3 emissiveMapTransform;
varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
uniform mat3 metalnessMapTransform;
varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
uniform mat3 roughnessMapTransform;
varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
uniform mat3 anisotropyMapTransform;
varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
uniform mat3 clearcoatMapTransform;
varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
uniform mat3 clearcoatNormalMapTransform;
varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
uniform mat3 clearcoatRoughnessMapTransform;
varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
uniform mat3 sheenColorMapTransform;
varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
uniform mat3 sheenRoughnessMapTransform;
varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
uniform mat3 iridescenceMapTransform;
varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
uniform mat3 iridescenceThicknessMapTransform;
varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
uniform mat3 specularMapTransform;
varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
uniform mat3 specularColorMapTransform;
varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
uniform mat3 specularIntensityMapTransform;
varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
uniform mat3 transmissionMapTransform;
varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
uniform mat3 thicknessMapTransform;
varying vec2 vThicknessMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float displacementBias;
#endif
#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS

varying vec3 vWorldPosition;
	#else
varying vec3 vReflect;
uniform float refractionRatio;
	#endif
#endif
#if defined( USE_COLOR_ALPHA )
varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
varying vec3 vColor;
#endif
#ifdef USE_FOG
varying float vFogDepth;
#endif
#ifndef FLAT_SHADED
varying vec3 vNormal;
	#ifdef USE_TANGENT
varying vec3 vTangent;
varying vec3 vBitangent;
	#endif
#endif
#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
uniform float morphTargetBaseInfluence;
uniform float morphTargetInfluences[MORPHTARGETS_COUNT];
	#endif
uniform sampler2DArray morphTargetsTexture;
uniform ivec2 morphTargetsTextureSize;
vec4 getMorph(const in int vertexIndex, const in int morphTargetIndex, const in int offset) {
int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
int y = texelIndex / morphTargetsTextureSize.x;
int x = texelIndex - y * morphTargetsTextureSize.x;
ivec3 morphUV = ivec3(x, y, morphTargetIndex);
return texelFetch(morphTargetsTexture, morphUV, 0);
}
#endif
#ifdef USE_SKINNING
uniform mat4 bindMatrix;
uniform mat4 bindMatrixInverse;
uniform highp sampler2D boneTexture;
mat4 getBoneMatrix(const in float i) {
int size = textureSize(boneTexture, 0).x;
int j = int(i) * 4;
int x = j % size;
int y = j / size;
vec4 v1 = texelFetch(boneTexture, ivec2(x, y), 0);
vec4 v2 = texelFetch(boneTexture, ivec2(x + 1, y), 0);
vec4 v3 = texelFetch(boneTexture, ivec2(x + 2, y), 0);
vec4 v4 = texelFetch(boneTexture, ivec2(x + 3, y), 0);
return mat4(v1, v2, v3, v4);
}
#endif
#if 0 > 0
uniform mat4 spotLightMatrix[0];
varying vec4 vSpotLightCoord[0];
#endif
#ifdef USE_SHADOWMAP
	#if 0 > 0
uniform mat4 directionalShadowMatrix[0];
varying vec4 vDirectionalShadowCoord[0];
struct DirectionalLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform DirectionalLightShadow directionalLightShadows[0];
	#endif
	#if 0 > 0
struct SpotLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform SpotLightShadow spotLightShadows[0];
	#endif
	#if 1 > 0
uniform mat4 pointShadowMatrix[1];
varying vec4 vPointShadowCoord[1];
struct PointLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
float shadowCameraNear;
float shadowCameraFar;
};
uniform PointLightShadow pointLightShadows[1];
	#endif
#endif
#ifdef USE_LOGDEPTHBUF
varying float vFragDepth;
varying float vIsPerspective;
#endif
#if 0 > 0
varying vec3 vClipPosition;
#endif
void main() {
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
vUv = vec3(uv, 1).xy;
#endif
#ifdef USE_MAP
vMapUv = (mapTransform * vec3(MAP_UV, 1)).xy;
#endif
#ifdef USE_ALPHAMAP
vAlphaMapUv = (alphaMapTransform * vec3(ALPHAMAP_UV, 1)).xy;
#endif
#ifdef USE_LIGHTMAP
vLightMapUv = (lightMapTransform * vec3(LIGHTMAP_UV, 1)).xy;
#endif
#ifdef USE_AOMAP
vAoMapUv = (aoMapTransform * vec3(AOMAP_UV, 1)).xy;
#endif
#ifdef USE_BUMPMAP
vBumpMapUv = (bumpMapTransform * vec3(BUMPMAP_UV, 1)).xy;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = (normalMapTransform * vec3(NORMALMAP_UV, 1)).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
vDisplacementMapUv = (displacementMapTransform * vec3(DISPLACEMENTMAP_UV, 1)).xy;
#endif
#ifdef USE_EMISSIVEMAP
vEmissiveMapUv = (emissiveMapTransform * vec3(EMISSIVEMAP_UV, 1)).xy;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = (metalnessMapTransform * vec3(METALNESSMAP_UV, 1)).xy;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = (roughnessMapTransform * vec3(ROUGHNESSMAP_UV, 1)).xy;
#endif
#ifdef USE_ANISOTROPYMAP
vAnisotropyMapUv = (anisotropyMapTransform * vec3(ANISOTROPYMAP_UV, 1)).xy;
#endif
#ifdef USE_CLEARCOATMAP
vClearcoatMapUv = (clearcoatMapTransform * vec3(CLEARCOATMAP_UV, 1)).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
vClearcoatNormalMapUv = (clearcoatNormalMapTransform * vec3(CLEARCOAT_NORMALMAP_UV, 1)).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
vClearcoatRoughnessMapUv = (clearcoatRoughnessMapTransform * vec3(CLEARCOAT_ROUGHNESSMAP_UV, 1)).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
vIridescenceMapUv = (iridescenceMapTransform * vec3(IRIDESCENCEMAP_UV, 1)).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
vIridescenceThicknessMapUv = (iridescenceThicknessMapTransform * vec3(IRIDESCENCE_THICKNESSMAP_UV, 1)).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
vSheenColorMapUv = (sheenColorMapTransform * vec3(SHEEN_COLORMAP_UV, 1)).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
vSheenRoughnessMapUv = (sheenRoughnessMapTransform * vec3(SHEEN_ROUGHNESSMAP_UV, 1)).xy;
#endif
#ifdef USE_SPECULARMAP
vSpecularMapUv = (specularMapTransform * vec3(SPECULARMAP_UV, 1)).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
vSpecularColorMapUv = (specularColorMapTransform * vec3(SPECULAR_COLORMAP_UV, 1)).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
vSpecularIntensityMapUv = (specularIntensityMapTransform * vec3(SPECULAR_INTENSITYMAP_UV, 1)).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
vTransmissionMapUv = (transmissionMapTransform * vec3(TRANSMISSIONMAP_UV, 1)).xy;
#endif
#ifdef USE_THICKNESSMAP
vThicknessMapUv = (thicknessMapTransform * vec3(THICKNESSMAP_UV, 1)).xy;
#endif
#if defined( USE_COLOR_ALPHA )
vColor = vec4(1.0);
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
vColor = vec3(1.0);
#endif
#ifdef USE_COLOR
vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
vec3 batchingColor = getBatchingColor(getIndirectIndex(gl_DrawID));
vColor.xyz *= batchingColor.xyz;
#endif
#if defined( USE_MORPHCOLORS )
vColor *= morphTargetBaseInfluence;
for(int i = 0;
i < MORPHTARGETS_COUNT;
i ++) {
		#if defined( USE_COLOR_ALPHA )
if(morphTargetInfluences[i] != 0.0) vColor += getMorph(gl_VertexID, i, 2) * morphTargetInfluences[i];
		#elif defined( USE_COLOR )
if(morphTargetInfluences[i] != 0.0) vColor += getMorph(gl_VertexID, i, 2).rgb * morphTargetInfluences[i];
		#endif
}
#endif
#ifdef USE_BATCHING
mat4 batchingMatrix = getBatchingMatrix(getIndirectIndex(gl_DrawID));
#endif
vec3 objectNormal = vec3(normal);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
#ifdef USE_INSTANCING_MORPH
float morphTargetInfluences[MORPHTARGETS_COUNT];
float morphTargetBaseInfluence = texelFetch(morphTexture, ivec2(0, gl_InstanceID), 0).r;
for(int i = 0;
i < MORPHTARGETS_COUNT;
i ++) {
morphTargetInfluences[i] = texelFetch(morphTexture, ivec2(i + 1, gl_InstanceID), 0).r;
}
#endif
#ifdef USE_MORPHNORMALS
objectNormal *= morphTargetBaseInfluence;
for(int i = 0;
i < MORPHTARGETS_COUNT;
i ++) {
if(morphTargetInfluences[i] != 0.0) objectNormal += getMorph(gl_VertexID, i, 1).xyz * morphTargetInfluences[i];
}
#endif
#ifdef USE_SKINNING
mat4 boneMatX = getBoneMatrix(skinIndex.x);
mat4 boneMatY = getBoneMatrix(skinIndex.y);
mat4 boneMatZ = getBoneMatrix(skinIndex.z);
mat4 boneMatW = getBoneMatrix(skinIndex.w);
#endif
#ifdef USE_SKINNING
mat4 skinMatrix = mat4(0.0);
skinMatrix += skinWeight.x * boneMatX;
skinMatrix += skinWeight.y * boneMatY;
skinMatrix += skinWeight.z * boneMatZ;
skinMatrix += skinWeight.w * boneMatW;
skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
objectNormal = vec4(skinMatrix * vec4(objectNormal, 0.0)).xyz;
	#ifdef USE_TANGENT
objectTangent = vec4(skinMatrix * vec4(objectTangent, 0.0)).xyz;
	#endif
#endif
vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
mat3 bm = mat3(batchingMatrix);
transformedNormal /= vec3(dot(bm[0], bm[0]), dot(bm[1], bm[1]), dot(bm[2], bm[2]));
transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
mat3 im = mat3(instanceMatrix);
transformedNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
transformedTangent = (modelViewMatrix * vec4(transformedTangent, 0.0)).xyz;
	#ifdef FLIP_SIDED
transformedTangent = - transformedTangent;
	#endif
#endif
#ifndef FLAT_SHADED
vNormal = normalize(transformedNormal);
	#ifdef USE_TANGENT
vTangent = normalize(transformedTangent);
vBitangent = normalize(cross(vNormal, vTangent) * tangent.w);
	#endif
#endif
vec3 transformed = vec3(position);
#ifdef USE_ALPHAHASH
vPosition = vec3(position);
#endif
#ifdef USE_MORPHTARGETS
transformed *= morphTargetBaseInfluence;
for(int i = 0;
i < MORPHTARGETS_COUNT;
i ++) {
if(morphTargetInfluences[i] != 0.0) transformed += getMorph(gl_VertexID, i, 0).xyz * morphTargetInfluences[i];
}
#endif
#ifdef USE_SKINNING
vec4 skinVertex = bindMatrix * vec4(transformed, 1.0);
vec4 skinned = vec4(0.0);
skinned += boneMatX * skinVertex * skinWeight.x;
skinned += boneMatY * skinVertex * skinWeight.y;
skinned += boneMatZ * skinVertex * skinWeight.z;
skinned += boneMatW * skinVertex * skinWeight.w;
transformed = (bindMatrixInverse * skinned).xyz;
#endif
#ifdef USE_DISPLACEMENTMAP
transformed += normalize(objectNormal) * (texture2D(displacementMap, vDisplacementMapUv).x * displacementScale + displacementBias);
#endif
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
#ifdef USE_LOGDEPTHBUF
vFragDepth = 1.0 + gl_Position.w;
vIsPerspective = float(isPerspectiveMatrix(projectionMatrix));
#endif
#if 0 > 0
vClipPosition = - mvPosition.xyz;
#endif
vViewPosition = - mvPosition.xyz;
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || 0 > 0
vec4 worldPosition = vec4(transformed, 1.0);
	#ifdef USE_BATCHING
worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
worldPosition = instanceMatrix * worldPosition;
	#endif
worldPosition = modelMatrix * worldPosition;
#endif
#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
vWorldPosition = worldPosition.xyz;
	#else
vec3 cameraToVertex;
if(isOrthographic) {
cameraToVertex = normalize(vec3(- viewMatrix[0][2], - viewMatrix[1][2], - viewMatrix[2][2]));
} else {
cameraToVertex = normalize(worldPosition.xyz - cameraPosition);
}
vec3 worldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
		#ifdef ENVMAP_MODE_REFLECTION
vReflect = reflect(cameraToVertex, worldNormal);
		#else
vReflect = refract(cameraToVertex, worldNormal, refractionRatio);
		#endif
	#endif
#endif
#if ( defined( USE_SHADOWMAP ) && ( 0 > 0 || 1 > 0 ) ) || ( 0 > 0 )
vec3 shadowWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if 0 > 0

	#endif
	#if 1 > 0

shadowWorldPosition = worldPosition + vec4(shadowWorldNormal * pointLightShadows[0].shadowNormalBias, 0);
vPointShadowCoord[0] = pointShadowMatrix[0] * shadowWorldPosition;

	#endif
#endif
#if 0 > 0

#endif
#ifdef USE_FOG
vFogDepth = - mvPosition.z;
#endif
}
three.module.js : 20127 * FRAGMENT * 
#version 300 es
#define varying in
    layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define gl_FragDepthEXT gl_FragDepth
#define texture2D texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLodEXT textureLod
#define texture2DProjLodEXT textureProjLod
#define textureCubeLodEXT textureLod
#define texture2DGradEXT textureGrad
#define texture2DProjGradEXT textureProjGrad
#define textureCubeGradEXT textureGrad
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;

#define HIGH_PRECISION
#define SHADER_TYPE MeshPhongMaterial
#define SHADER_NAME 
#define USE_MAP
#define USE_SHADOWMAP
#define SHADOWMAP_TYPE_PCF_SOFT
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
#define OPAQUE

const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(vec3(0.8224621, 0.177538, 0.0), vec3(0.0331941, 0.9668058, 0.0), vec3(0.0170827, 0.0723974, 0.9105199));
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(vec3(1.2249401, - 0.2249404, 0.0), vec3(- 0.0420569, 1.0420571, 0.0), vec3(- 0.0196376, - 0.0786361, 1.0982735));
vec4 LinearSRGBToLinearDisplayP3(in vec4 value) {
return vec4(value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a);
}
vec4 LinearDisplayP3ToLinearSRGB(in vec4 value) {
return vec4(value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a);
}
vec4 LinearTransferOETF(in vec4 value) {
return value;
}
vec4 sRGBTransferOETF(in vec4 value) {
return vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);
}
vec4 LinearToLinear(in vec4 value) {
return value;
}
vec4 LinearTosRGB(in vec4 value) {
return sRGBTransferOETF(value);
}
vec4 linearToOutputTexel(vec4 value) {
return (sRGBTransferOETF(value));
}

#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2(const in float x) {
return x * x;
}
vec3 pow2(const in vec3 x) {
return x * x;
}
float pow3(const in float x) {
return x * x * x;
}
float pow4(const in float x) {
float x2 = x * x;
return x2 * x2;
}
float max3(const in vec3 v) {
return max(max(v.x, v.y), v.z);
}
float average(const in vec3 v) {
return dot(v, vec3(0.3333333));
}
highp float rand(const in vec2 uv) {
const highp float a = 12.9898, b = 78.233, c = 43758.5453;
highp float dt = dot(uv.xy, vec2(a, b)), sn = mod(dt, PI);
return fract(sin(sn) * c);
}
#ifdef HIGH_PRECISION
float precisionSafeLength(vec3 v) {
return length(v);
}
#else
float precisionSafeLength(vec3 v) {
float maxComponent = max3(abs(v));
return length(v / maxComponent) * maxComponent;
}
#endif
struct IncidentLight {
vec3 color;
vec3 direction;
bool visible;
};
struct ReflectedLight {
vec3 directDiffuse;
vec3 directSpecular;
vec3 indirectDiffuse;
vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
varying vec3 vPosition;
#endif
vec3 transformDirection(in vec3 dir, in mat4 matrix) {
return normalize((matrix * vec4(dir, 0.0)).xyz);
}
vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {
return normalize((vec4(dir, 0.0) * matrix).xyz);
}
mat3 transposeMat3(const in mat3 m) {
mat3 tmp;
tmp[0] = vec3(m[0].x, m[1].x, m[2].x);
tmp[1] = vec3(m[0].y, m[1].y, m[2].y);
tmp[2] = vec3(m[0].z, m[1].z, m[2].z);
return tmp;
}
float luminance(const in vec3 rgb) {
const vec3 weights = vec3(0.2126729, 0.7151522, 0.0721750);
return dot(weights, rgb);
}
bool isPerspectiveMatrix(mat4 m) {
return m[2][3] == - 1.0;
}
vec2 equirectUv(in vec3 dir) {
float u = atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5;
float v = asin(clamp(dir.y, - 1.0, 1.0)) * RECIPROCAL_PI + 0.5;
return vec2(u, v);
}
vec3 BRDF_Lambert(const in vec3 diffuseColor) {
return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {
float fresnel = exp2((- 5.55473 * dotVH - 6.98316) * dotVH);
return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
float F_Schlick(const in float f0, const in float f90, const in float dotVH) {
float fresnel = exp2((- 5.55473 * dotVH - 6.98316) * dotVH);
return f0 * (1.0 - fresnel) + (f90 * fresnel);
} // validated
varying float zDepthScene;
uniform sampler2D realWorldDepth;

vec3 packNormalToRGB(const in vec3 normal) {
return normalize(normal) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal(const in vec3 rgb) {
return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;
const float UnpackDownscale = 255. / 256.;
const vec3 PackFactors = vec3(256. * 256. * 256., 256. * 256., 256.);
const vec4 UnpackFactors = UnpackDownscale / vec4(PackFactors, 1.);
const float ShiftRight8 = 1. / 256.;
vec4 packDepthToRGBA(const in float v) {
vec4 r = vec4(fract(v * PackFactors), v);
r.yzw -= r.xyz * ShiftRight8;
return r * PackUpscale;
}
float unpackRGBAToDepth(const in vec4 v) {
return dot(v, UnpackFactors);
}
vec2 packDepthToRG(in highp float v) {
return packDepthToRGBA(v).yx;
}
float unpackRGToDepth(const in highp vec2 v) {
return unpackRGBAToDepth(vec4(v.xy, 0.0, 0.0));
}
vec4 pack2HalfToRGBA(vec2 v) {
vec4 r = vec4(v.x, fract(v.x * 255.0), v.y, fract(v.y * 255.0));
return vec4(r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w);
}
vec2 unpackRGBATo2Half(vec4 v) {
return vec2(v.x + (v.y / 255.0), v.z + (v.w / 255.0));
}
float viewZToOrthographicDepth(const in float viewZ, const in float near, const in float far) {
return (viewZ + near) / (near - far);
}
float orthographicDepthToViewZ(const in float depth, const in float near, const in float far) {
return depth * (near - far) - near;
}
float viewZToPerspectiveDepth(const in float viewZ, const in float near, const in float far) {
return ((near + viewZ) * far) / ((far - near) * viewZ);
}
float perspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {
return (near * far) / ((far - near) * depth - far);
}
#ifdef DITHERING
vec3 dithering(vec3 color) {
float grid_position = rand(gl_FragCoord.xy);
vec3 dither_shift_RGB = vec3(0.25 / 255.0, - 0.25 / 255.0, 0.25 / 255.0);
dither_shift_RGB = mix(2.0 * dither_shift_RGB, - 2.0 * dither_shift_RGB, grid_position);
return color + dither_shift_RGB;
}
#endif
#if defined( USE_COLOR_ALPHA )
varying vec4 vColor;
#elif defined( USE_COLOR )
varying vec3 vColor;
#endif
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
varying vec2 vUv;
#endif
#ifdef USE_MAP
varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
uniform mat3 transmissionMapTransform;
varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
uniform mat3 thicknessMapTransform;
varying vec2 vThicknessMapUv;
#endif
#ifdef USE_MAP
uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
uniform sampler2D alphaMap;
#endif
#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif
#ifdef USE_ALPHAHASH
const float ALPHA_HASH_SCALE = 0.05;
float hash2D(vec2 value) {
return fract(1.0e4 * sin(17.0 * value.x + 0.1 * value.y) * (0.1 + abs(sin(13.0 * value.y + value.x))));
}
float hash3D(vec3 value) {
return hash2D(vec2(hash2D(value.xy), value.z));
}
float getAlphaHashThreshold(vec3 position) {
float maxDeriv = max(length(dFdx(position.xyz)), length(dFdy(position.xyz)));
float pixScale = 1.0 / (ALPHA_HASH_SCALE * maxDeriv);
vec2 pixScales = vec2(exp2(floor(log2(pixScale))), exp2(ceil(log2(pixScale))));
vec2 alpha = vec2(hash3D(floor(pixScales.x * position.xyz)), hash3D(floor(pixScales.y * position.xyz)));
float lerpFactor = fract(log2(pixScale));
float x = (1.0 - lerpFactor) * alpha.x + lerpFactor * alpha.y;
float a = min(lerpFactor, 1.0 - lerpFactor);
vec3 cases = vec3(x * x / (2.0 * a * (1.0 - a)), (x - 0.5 * a) / (1.0 - a), 1.0 - ((1.0 - x) * (1.0 - x) / (2.0 * a * (1.0 - a))));
float threshold = (x < (1.0 - a)) ? ((x < a) ? cases.x : cases.y) : cases.z;
return clamp(threshold, 1.0e-6, 1.0);
}
#endif
#ifdef USE_AOMAP
uniform sampler2D aoMap;
uniform float aoMapIntensity;
#endif
#ifdef USE_LIGHTMAP
uniform sampler2D lightMap;
uniform float lightMapIntensity;
#endif
#ifdef USE_EMISSIVEMAP
uniform sampler2D emissiveMap;
#endif
#ifdef USE_ENVMAP
uniform float envMapIntensity;
uniform float flipEnvMap;
uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
uniform samplerCube envMap;
	#else
uniform sampler2D envMap;
	#endif

#endif
#ifdef USE_ENVMAP
uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
varying vec3 vWorldPosition;
uniform float refractionRatio;
	#else
varying vec3 vReflect;
	#endif
#endif
#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
	#ifdef FOG_EXP2
uniform float fogDensity;
	#else
uniform float fogNear;
uniform float fogFar;
	#endif
#endif
float G_BlinnPhong_Implicit() {
return 0.25;
}
float D_BlinnPhong(const in float shininess, const in float dotNH) {
return RECIPROCAL_PI * (shininess * 0.5 + 1.0) * pow(dotNH, shininess);
}
vec3 BRDF_BlinnPhong(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess) {
vec3 halfDir = normalize(lightDir + viewDir);
float dotNH = saturate(dot(normal, halfDir));
float dotVH = saturate(dot(viewDir, halfDir));
vec3 F = F_Schlick(specularColor, 1.0, dotVH);
float G = G_BlinnPhong_Implicit();
float D = D_BlinnPhong(shininess, dotNH);
return F * (G * D);
} // validated
uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
uniform vec3 lightProbe[9];
#endif
vec3 shGetIrradianceAt(in vec3 normal, in vec3 shCoefficients[9]) {
float x = normal.x, y = normal.y, z = normal.z;
vec3 result = shCoefficients[0] * 0.886227;
result += shCoefficients[1] * 2.0 * 0.511664 * y;
result += shCoefficients[2] * 2.0 * 0.511664 * z;
result += shCoefficients[3] * 2.0 * 0.511664 * x;
result += shCoefficients[4] * 2.0 * 0.429043 * x * y;
result += shCoefficients[5] * 2.0 * 0.429043 * y * z;
result += shCoefficients[6] * (0.743125 * z * z - 0.247708);
result += shCoefficients[7] * 2.0 * 0.429043 * x * z;
result += shCoefficients[8] * 0.429043 * (x * x - y * y);
return result;
}
vec3 getLightProbeIrradiance(const in vec3 lightProbe[9], const in vec3 normal) {
vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
vec3 irradiance = shGetIrradianceAt(worldNormal, lightProbe);
return irradiance;
}
vec3 getAmbientLightIrradiance(const in vec3 ambientLightColor) {
vec3 irradiance = ambientLightColor;
return irradiance;
}
float getDistanceAttenuation(const in float lightDistance, const in float cutoffDistance, const in float decayExponent) {
float distanceFalloff = 1.0 / max(pow(lightDistance, decayExponent), 0.01);
if(cutoffDistance > 0.0) {
distanceFalloff *= pow2(saturate(1.0 - pow4(lightDistance / cutoffDistance)));
}
return distanceFalloff;
}
float getSpotAttenuation(const in float coneCosine, const in float penumbraCosine, const in float angleCosine) {
return smoothstep(coneCosine, penumbraCosine, angleCosine);
}
#if 0 > 0
struct DirectionalLight {
vec3 direction;
vec3 color;
};
uniform DirectionalLight directionalLights[0];
void getDirectionalLightInfo(const in DirectionalLight directionalLight, out IncidentLight light) {
light.color = directionalLight.color;
light.direction = directionalLight.direction;
light.visible = true;
}
#endif
#if 1 > 0
struct PointLight {
vec3 position;
vec3 color;
float distance;
float decay;
};
uniform PointLight pointLights[1];
void getPointLightInfo(const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light) {
vec3 lVector = pointLight.position - geometryPosition;
light.direction = normalize(lVector);
float lightDistance = length(lVector);
light.color = pointLight.color;
light.color *= getDistanceAttenuation(lightDistance, pointLight.distance, pointLight.decay);
light.visible = (light.color != vec3(0.0));
}
#endif
#if 0 > 0
struct SpotLight {
vec3 position;
vec3 direction;
vec3 color;
float distance;
float decay;
float coneCos;
float penumbraCos;
};
uniform SpotLight spotLights[0];
void getSpotLightInfo(const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light) {
vec3 lVector = spotLight.position - geometryPosition;
light.direction = normalize(lVector);
float angleCos = dot(light.direction, spotLight.direction);
float spotAttenuation = getSpotAttenuation(spotLight.coneCos, spotLight.penumbraCos, angleCos);
if(spotAttenuation > 0.0) {
float lightDistance = length(lVector);
light.color = spotLight.color * spotAttenuation;
light.color *= getDistanceAttenuation(lightDistance, spotLight.distance, spotLight.decay);
light.visible = (light.color != vec3(0.0));
} else {
light.color = vec3(0.0);
light.visible = false;
}
}
#endif
#if 0 > 0
struct RectAreaLight {
vec3 color;
vec3 position;
vec3 halfWidth;
vec3 halfHeight;
};
uniform sampler2D ltc_1;
uniform sampler2D ltc_2;
uniform RectAreaLight rectAreaLights[0];
#endif
#if 0 > 0
struct HemisphereLight {
vec3 direction;
vec3 skyColor;
vec3 groundColor;
};
uniform HemisphereLight hemisphereLights[0];
vec3 getHemisphereLightIrradiance(const in HemisphereLight hemiLight, const in vec3 normal) {
float dotNL = dot(normal, hemiLight.direction);
float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
vec3 irradiance = mix(hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight);
return irradiance;
}
#endif
#ifndef FLAT_SHADED
varying vec3 vNormal;
	#ifdef USE_TANGENT
varying vec3 vTangent;
varying vec3 vBitangent;
	#endif
#endif
varying vec3 vViewPosition;
struct BlinnPhongMaterial {
vec3 diffuseColor;
vec3 specularColor;
float specularShininess;
float specularStrength;
};
void RE_Direct_BlinnPhong(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight) {
float dotNL = saturate(dot(geometryNormal, directLight.direction));
vec3 irradiance = dotNL * directLight.color;
reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong(directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight) {
reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong
#if 0 > 0
varying vec4 vSpotLightCoord[0];
#endif
#if 0 > 0
uniform sampler2D spotLightMap[0];
#endif
#ifdef USE_SHADOWMAP
	#if 0 > 0
uniform sampler2D directionalShadowMap[0];
varying vec4 vDirectionalShadowCoord[0];
struct DirectionalLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform DirectionalLightShadow directionalLightShadows[0];
	#endif
	#if 0 > 0
uniform sampler2D spotShadowMap[0];
struct SpotLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform SpotLightShadow spotLightShadows[0];
	#endif
	#if 1 > 0
uniform sampler2D pointShadowMap[1];
varying vec4 vPointShadowCoord[1];
struct PointLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
float shadowCameraNear;
float shadowCameraFar;
};
uniform PointLightShadow pointLightShadows[1];
	#endif
float texture2DCompare(sampler2D depths, vec2 uv, float compare) {
return step(compare, unpackRGBAToDepth(texture2D(depths, uv)));
}
vec2 texture2DDistribution(sampler2D shadow, vec2 uv) {
return unpackRGBATo2Half(texture2D(shadow, uv));
}
float VSMShadow(sampler2D shadow, vec2 uv, float compare) {
float occlusion = 1.0;
vec2 distribution = texture2DDistribution(shadow, uv);
float hard_shadow = step(compare, distribution.x);
if(hard_shadow != 1.0) {
float distance = compare - distribution.x;
float variance = max(0.00000, distribution.y * distribution.y);
float softness_probability = variance / (variance + distance * distance);
softness_probability = clamp((softness_probability - 0.3) / (0.95 - 0.3), 0.0, 1.0);
occlusion = clamp(max(hard_shadow, softness_probability), 0.0, 1.0);
}
return occlusion;
}
float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord) {
float shadow = 1.0;
shadowCoord.xyz /= shadowCoord.w;
shadowCoord.z += shadowBias;
bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
if(frustumTest) {
		#if defined( SHADOWMAP_TYPE_PCF )
vec2 texelSize = vec2(1.0) / shadowMapSize;
float dx0 = - texelSize.x * shadowRadius;
float dy0 = - texelSize.y * shadowRadius;
float dx1 = + texelSize.x * shadowRadius;
float dy1 = + texelSize.y * shadowRadius;
float dx2 = dx0 / 2.0;
float dy2 = dy0 / 2.0;
float dx3 = dx1 / 2.0;
float dy3 = dy1 / 2.0;
shadow = (texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, dy2), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy2), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, dy2), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, 0.0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, 0.0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, 0.0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, 0.0), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, dy3), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy3), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, dy3), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy1), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy1), shadowCoord.z) +
    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy1), shadowCoord.z)) * (1.0 / 17.0);
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
vec2 texelSize = vec2(1.0) / shadowMapSize;
float dx = texelSize.x;
float dy = texelSize.y;
vec2 uv = shadowCoord.xy;
vec2 f = fract(uv * shadowMapSize + 0.5);
uv -= f * texelSize;
shadow = (texture2DCompare(shadowMap, uv, shadowCoord.z) +
    texture2DCompare(shadowMap, uv + vec2(dx, 0.0), shadowCoord.z) +
    texture2DCompare(shadowMap, uv + vec2(0.0, dy), shadowCoord.z) +
    texture2DCompare(shadowMap, uv + texelSize, shadowCoord.z) +
    mix(texture2DCompare(shadowMap, uv + vec2(- dx, 0.0), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0 * dx, 0.0), shadowCoord.z), f.x) +
    mix(texture2DCompare(shadowMap, uv + vec2(- dx, dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0 * dx, dy), shadowCoord.z), f.x) +
    mix(texture2DCompare(shadowMap, uv + vec2(0.0, - dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(0.0, 2.0 * dy), shadowCoord.z), f.y) +
    mix(texture2DCompare(shadowMap, uv + vec2(dx, - dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(dx, 2.0 * dy), shadowCoord.z), f.y) +
    mix(mix(texture2DCompare(shadowMap, uv + vec2(- dx, - dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0 * dx, - dy), shadowCoord.z), f.x), mix(texture2DCompare(shadowMap, uv + vec2(- dx, 2.0 * dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0 * dx, 2.0 * dy), shadowCoord.z), f.x), f.y)) * (1.0 / 9.0);
		#elif defined( SHADOWMAP_TYPE_VSM )
shadow = VSMShadow(shadowMap, shadowCoord.xy, shadowCoord.z);
		#else
shadow = texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z);
		#endif
}
return mix(1.0, shadow, shadowIntensity);
}
vec2 cubeToUV(vec3 v, float texelSizeY) {
vec3 absV = abs(v);
float scaleToCube = 1.0 / max(absV.x, max(absV.y, absV.z));
absV *= scaleToCube;
v *= scaleToCube * (1.0 - 2.0 * texelSizeY);
vec2 planar = v.xy;
float almostATexel = 1.5 * texelSizeY;
float almostOne = 1.0 - almostATexel;
if(absV.z >= almostOne) {
if(v.z > 0.0) planar.x = 4.0 - v.x;
} else if(absV.x >= almostOne) {
float signX = sign(v.x);
planar.x = v.z * signX + 2.0 * signX;
} else if(absV.y >= almostOne) {
float signY = sign(v.y);
planar.x = v.x + 2.0 * signY + 2.0;
planar.y = v.z * signY - 2.0;
}
return vec2(0.125, 0.25) * planar + vec2(0.375, 0.75);
}
float getPointShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar) {
float shadow = 1.0;
vec3 lightToPosition = shadowCoord.xyz;

float lightToPositionLength = length(lightToPosition);
if(lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0) {
float dp = (lightToPositionLength - shadowCameraNear) / (shadowCameraFar - shadowCameraNear);
dp += shadowBias;
vec3 bd3D = normalize(lightToPosition);
vec2 texelSize = vec2(1.0) / (shadowMapSize * vec2(4.0, 2.0));
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
vec2 offset = vec2(- 1, 1) * shadowRadius * texelSize.y;
shadow = (texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xyy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yyy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xyx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yyx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xxy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yxy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xxx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yxx, texelSize.y), dp)) * (1.0 / 9.0);
			#else
shadow = texture2DCompare(shadowMap, cubeToUV(bd3D, texelSize.y), dp);
			#endif
}
return mix(1.0, shadow, shadowIntensity);
}
#endif
#ifdef USE_BUMPMAP
uniform sampler2D bumpMap;
uniform float bumpScale;
vec2 dHdxy_fwd() {
vec2 dSTdx = dFdx(vBumpMapUv);
vec2 dSTdy = dFdy(vBumpMapUv);
float Hll = bumpScale * texture2D(bumpMap, vBumpMapUv).x;
float dBx = bumpScale * texture2D(bumpMap, vBumpMapUv + dSTdx).x - Hll;
float dBy = bumpScale * texture2D(bumpMap, vBumpMapUv + dSTdy).x - Hll;
return vec2(dBx, dBy);
}
vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
vec3 vN = surf_norm;
vec3 R1 = cross(vSigmaY, vN);
vec3 R2 = cross(vN, vSigmaX);
float fDet = dot(vSigmaX, R1) * faceDirection;
vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
return normalize(abs(fDet) * surf_norm - vGrad);
}
#endif
#ifdef USE_NORMALMAP
uniform sampler2D normalMap;
uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
mat3 getTangentFrame(vec3 eye_pos, vec3 surf_norm, vec2 uv) {
vec3 q0 = dFdx(eye_pos.xyz);
vec3 q1 = dFdy(eye_pos.xyz);
vec2 st0 = dFdx(uv.st);
vec2 st1 = dFdy(uv.st);
vec3 N = surf_norm;
vec3 q1perp = cross(q1, N);
vec3 q0perp = cross(N, q0);
vec3 T = q1perp * st0.x + q0perp * st1.x;
vec3 B = q1perp * st0.y + q0perp * st1.y;
float det = max(dot(T, T), dot(B, B));
float scale = (det == 0.0) ? 0.0 : inversesqrt(det);
return mat3(T * scale, B * scale, N);
}
#endif
#ifdef USE_SPECULARMAP
uniform sampler2D specularMap;
#endif
#if defined( USE_LOGDEPTHBUF )
uniform float logDepthBufFC;
varying float vFragDepth;
varying float vIsPerspective;
#endif
#if 0 > 0
varying vec3 vClipPosition;
uniform vec4 clippingPlanes[0];
#endif
void main() {
vec4 diffuseColor = vec4(diffuse, opacity);
#if 0 > 0
vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
float distanceToPlane, distanceGradient;
float clipOpacity = 1.0;

		#if 0 < 0
float unionClipOpacity = 1.0;

clipOpacity *= 1.0 - unionClipOpacity;
		#endif
diffuseColor.a *= clipOpacity;
if(diffuseColor.a == 0.0) discard;
	#else

		#if 0 < 0
bool clipped = true;

if(clipped) discard;
		#endif
	#endif
#endif
ReflectedLight reflectedLight = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
vec3 totalEmissiveRadiance = emissive;
#if defined( USE_LOGDEPTHBUF )
gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2(vFragDepth) * logDepthBufFC * 0.5;
#endif
#ifdef USE_MAP
vec4 sampledDiffuseColor = texture2D(map, vMapUv);
	#ifdef DECODE_VIDEO_TEXTURE
sampledDiffuseColor = vec4(mix(pow(sampledDiffuseColor.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), sampledDiffuseColor.rgb * 0.0773993808, vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045)))), sampledDiffuseColor.w);

	#endif
diffuseColor *= sampledDiffuseColor;
#endif
#if defined( USE_COLOR_ALPHA )
diffuseColor *= vColor;
#elif defined( USE_COLOR )
diffuseColor.rgb *= vColor;
#endif
#ifdef USE_ALPHAMAP
diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).g;
#endif
#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
diffuseColor.a = smoothstep(alphaTest, alphaTest + fwidth(diffuseColor.a), diffuseColor.a);
if(diffuseColor.a == 0.0) discard;
	#else
if(diffuseColor.a < alphaTest) discard;
	#endif
#endif
#ifdef USE_ALPHAHASH
if(diffuseColor.a < getAlphaHashThreshold(vPosition)) discard;
#endif
float specularStrength;
#ifdef USE_SPECULARMAP
vec4 texelSpecular = texture2D(specularMap, vSpecularMapUv);
specularStrength = texelSpecular.r;
#else
specularStrength = 1.0;
#endif
float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
vec3 fdx = dFdx(vViewPosition);
vec3 fdy = dFdy(vViewPosition);
vec3 normal = normalize(cross(fdx, fdy));
#else
vec3 normal = normalize(vNormal);
	#ifdef DOUBLE_SIDED
normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
mat3 tbn = mat3(normalize(vTangent), normalize(vBitangent), normal);
	#else
mat3 tbn = getTangentFrame(- vViewPosition, normal,
		#if defined( USE_NORMALMAP )
vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
vClearcoatNormalMapUv
		#else
vUv
		#endif
);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
tbn[0] *= faceDirection;
tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
mat3 tbn2 = mat3(normalize(vTangent), normalize(vBitangent), normal);
	#else
mat3 tbn2 = getTangentFrame(- vViewPosition, normal, vClearcoatNormalMapUv);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
tbn2[0] *= faceDirection;
tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;
#ifdef USE_NORMALMAP_OBJECTSPACE
normal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
normal = normal * faceDirection;
	#endif
normal = normalize(normalMatrix * normal);
#elif defined( USE_NORMALMAP_TANGENTSPACE )
vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
mapN.xy *= normalScale;
normal = normalize(tbn * mapN);
#elif defined( USE_BUMPMAP )
normal = perturbNormalArb(- vViewPosition, normal, dHdxy_fwd(), faceDirection);
#endif
#ifdef USE_EMISSIVEMAP
vec4 emissiveColor = texture2D(emissiveMap, vEmissiveMapUv);
totalEmissiveRadiance *= emissiveColor.rgb;
#endif
BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;

vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = (isOrthographic) ? vec3(0, 0, 1) : normalize(vViewPosition);
vec3 geometryClearcoatNormal = vec3(0.0);
#ifdef USE_CLEARCOAT
geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
float dotNVi = saturate(dot(normal, geometryViewDir));
if(material.iridescenceThickness == 0.0) {
material.iridescence = 0.0;
} else {
material.iridescence = saturate(material.iridescence);
}
if(material.iridescence > 0.0) {
material.iridescenceFresnel = evalIridescence(1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor);
material.iridescenceF0 = Schlick_to_F0(material.iridescenceFresnel, 1.0, dotNVi);
}
#endif
IncidentLight directLight;
#if ( 1 > 0 ) && defined( RE_Direct )
PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && 1 > 0
PointLightShadow pointLightShadow;
	#endif

pointLight = pointLights[0];
getPointLightInfo(pointLight, geometryPosition, directLight);
		#if defined( USE_SHADOWMAP ) && ( 0 < 1 )
pointLightShadow = pointLightShadows[0];
directLight.color *= (directLight.visible && receiveShadow) ? getPointShadow(pointShadowMap[0], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[0], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar) : 1.0;
		#endif
RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);

#endif
#if ( 0 > 0 ) && defined( RE_Direct )
SpotLight spotLight;
vec4 spotColor;
vec3 spotLightCoord;
bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && 0 > 0
SpotLightShadow spotLightShadow;
	#endif

#endif
#if ( 0 > 0 ) && defined( RE_Direct )
DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && 0 > 0
DirectionalLightShadow directionalLightShadow;
	#endif

#endif
#if ( 0 > 0 ) && defined( RE_Direct_RectArea )
RectAreaLight rectAreaLight;

#endif
#if defined( RE_IndirectDiffuse )
vec3 iblIrradiance = vec3(0.0);
vec3 irradiance = getAmbientLightIrradiance(ambientLightColor);
	#if defined( USE_LIGHT_PROBES )
irradiance += getLightProbeIrradiance(lightProbe, geometryNormal);
	#endif
	#if ( 0 > 0 )

	#endif
#endif
#if defined( RE_IndirectSpecular )
vec3 radiance = vec3(0.0);
vec3 clearcoatRadiance = vec3(0.0);
#endif
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
vec4 lightMapTexel = texture2D(lightMap, vLightMapUv);
vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
iblIrradiance += getIBLIrradiance(geometryNormal);
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
radiance += getIBLAnisotropyRadiance(geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy);
	#else
radiance += getIBLRadiance(geometryViewDir, geometryNormal, material.roughness);
	#endif
	#ifdef USE_CLEARCOAT
clearcoatRadiance += getIBLRadiance(geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness);
	#endif
#endif
#if defined( RE_IndirectDiffuse )
RE_IndirectDiffuse(irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
#endif
#if defined( RE_IndirectSpecular )
RE_IndirectSpecular(radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
#endif
#ifdef USE_AOMAP
float ambientOcclusion = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
float dotNV = saturate(dot(geometryNormal, geometryViewDir));
reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
	#endif
#endif
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
vec3 cameraToFrag;
if(isOrthographic) {
cameraToFrag = normalize(vec3(- viewMatrix[0][2], - viewMatrix[1][2], - viewMatrix[2][2]));
} else {
cameraToFrag = normalize(vWorldPosition - cameraPosition);
}
vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
		#ifdef ENVMAP_MODE_REFLECTION
vec3 reflectVec = reflect(cameraToFrag, worldNormal);
		#else
vec3 reflectVec = refract(cameraToFrag, worldNormal, refractionRatio);
		#endif
	#else
vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
vec4 envColor = textureCube(envMap, envMapRotation * vec3(flipEnvMap * reflectVec.x, reflectVec.yz));
	#else
vec4 envColor = vec4(0.0);
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
outgoingLight = mix(outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity);
	#elif defined( ENVMAP_BLENDING_MIX )
outgoingLight = mix(outgoingLight, envColor.xyz, specularStrength * reflectivity);
	#elif defined( ENVMAP_BLENDING_ADD )
outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif
#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4(outgoingLight, diffuseColor.a);
#if defined( TONE_MAPPING )
gl_FragColor.rgb = toneMapping(gl_FragColor.rgb);
#endif
gl_FragColor = linearToOutputTexel(gl_FragColor);
#ifdef USE_FOG
	#ifdef FOG_EXP2
float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
	#else
float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
	#endif
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
#ifdef PREMULTIPLIED_ALPHA
gl_FragColor.rgb *= gl_FragColor.a;
#endif
#ifdef DITHERING
gl_FragColor.rgb = dithering(gl_FragColor.rgb);
#endif
float zDepthReal = texture(realWorldDepth, vMapUv).x;
gl_FragColor.a = (1.0 - zDepthReal) / 1.0;
gl_FragColor = vec4(zDepthReal, zDepthReal, zDepthReal, 1.0);
gl_FragColor = vec4(zDepthScene, zDepthScene, zDepthScene, 1.0);

}