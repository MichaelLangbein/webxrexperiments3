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
#define SHADER_TYPE MeshBasicMaterial
#define SHADER_NAME 
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
	return dot(v, vec3(0.3333333f));
}
highp float rand(const in vec2 uv) {
	const highp float a = 12.9898f, b = 78.233f, c = 43758.5453f;
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
	return normalize((matrix * vec4(dir, 0.0f)).xyz);
}
vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {
	return normalize((vec4(dir, 0.0f) * matrix).xyz);
}
mat3 transposeMat3(const in mat3 m) {
	mat3 tmp;
	tmp[0] = vec3(m[0].x, m[1].x, m[2].x);
	tmp[1] = vec3(m[0].y, m[1].y, m[2].y);
	tmp[2] = vec3(m[0].z, m[1].z, m[2].z);
	return tmp;
}
float luminance(const in vec3 rgb) {
	const vec3 weights = vec3(0.2126729f, 0.7151522f, 0.0721750f);
	return dot(weights, rgb);
}
bool isPerspectiveMatrix(mat4 m) {
	return m[2][3] == -1.0f;
}
vec2 equirectUv(in vec3 dir) {
	float u = atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5f;
	float v = asin(clamp(dir.y, -1.0f, 1.0f)) * RECIPROCAL_PI + 0.5f;
	return vec2(u, v);
}
vec3 BRDF_Lambert(const in vec3 diffuseColor) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {
	float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);
	return f0 * (1.0f - fresnel) + (f90 * fresnel);
}
float F_Schlick(const in float f0, const in float f90, const in float dotVH) {
	float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);
	return f0 * (1.0f - fresnel) + (f90 * fresnel);
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
	vColor = vec4(1.0f);
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3(1.0f);
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
#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[MORPHTARGETS_COUNT];
	float morphTargetBaseInfluence = texelFetch(morphTexture, ivec2(0, gl_InstanceID), 0).r;
	for(int i = 0; i < MORPHTARGETS_COUNT; i++) {
		morphTargetInfluences[i] = texelFetch(morphTexture, ivec2(i + 1, gl_InstanceID), 0).r;
	}
#endif
#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for(int i = 0; i < MORPHTARGETS_COUNT; i++) {
		#if defined( USE_COLOR_ALPHA )
		if(morphTargetInfluences[i] != 0.0f)
			vColor += getMorph(gl_VertexID, i, 2) * morphTargetInfluences[i];
		#elif defined( USE_COLOR )
		if(morphTargetInfluences[i] != 0.0f)
			vColor += getMorph(gl_VertexID, i, 2).rgb * morphTargetInfluences[i];
		#endif
	}
#endif
#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix(getIndirectIndex(gl_DrawID));
#endif
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
	vec3 objectNormal = vec3(normal);
#ifdef USE_TANGENT
	vec3 objectTangent = vec3(tangent.xyz);
#endif
#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for(int i = 0; i < MORPHTARGETS_COUNT; i++) {
		if(morphTargetInfluences[i] != 0.0f)
			objectNormal += getMorph(gl_VertexID, i, 1).xyz * morphTargetInfluences[i];
	}
#endif
#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix(skinIndex.x);
	mat4 boneMatY = getBoneMatrix(skinIndex.y);
	mat4 boneMatZ = getBoneMatrix(skinIndex.z);
	mat4 boneMatW = getBoneMatrix(skinIndex.w);
#endif
#ifdef USE_SKINNING
	mat4 skinMatrix = mat4(0.0f);
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4(skinMatrix * vec4(objectNormal, 0.0f)).xyz;
	#ifdef USE_TANGENT
	objectTangent = vec4(skinMatrix * vec4(objectTangent, 0.0f)).xyz;
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
	transformedNormal = -transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = (modelViewMatrix * vec4(transformedTangent, 0.0f)).xyz;
	#ifdef FLIP_SIDED
	transformedTangent = -transformedTangent;
	#endif
#endif
	#endif
	vec3 transformed = vec3(position);
#ifdef USE_ALPHAHASH
	vPosition = vec3(position);
#endif
#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for(int i = 0; i < MORPHTARGETS_COUNT; i++) {
		if(morphTargetInfluences[i] != 0.0f)
			transformed += getMorph(gl_VertexID, i, 0).xyz * morphTargetInfluences[i];
	}
#endif
#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4(transformed, 1.0f);
	vec4 skinned = vec4(0.0f);
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = (bindMatrixInverse * skinned).xyz;
#endif
	vec4 mvPosition = vec4(transformed, 1.0f);
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
	mvPosition = modelViewMatrix * mvPosition;
	gl_Position = projectionMatrix * mvPosition;
#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0f + gl_Position.w;
	vIsPerspective = float(isPerspectiveMatrix(projectionMatrix));
#endif
#if 0 > 0
	vClipPosition = -mvPosition.xyz;
#endif
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || 0 > 0
	vec4 worldPosition = vec4(transformed, 1.0f);
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
		cameraToVertex = normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2]));
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
#ifdef USE_FOG
	vFogDepth = -mvPosition.z;
#endif
}

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
#define SHADER_TYPE MeshBasicMaterial
#define SHADER_NAME 
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
#define OPAQUE

const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(vec3(0.8224621f, 0.177538f, 0.0f), vec3(0.0331941f, 0.9668058f, 0.0f), vec3(0.0170827f, 0.0723974f, 0.9105199f));
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(vec3(1.2249401f, -0.2249404f, 0.0f), vec3(-0.0420569f, 1.0420571f, 0.0f), vec3(-0.0196376f, -0.0786361f, 1.0982735f));
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
	return vec4(mix(pow(value.rgb, vec3(0.41666f)) * 1.055f - vec3(0.055f), value.rgb * 12.92f, vec3(lessThanEqual(value.rgb, vec3(0.0031308f)))), value.a);
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

uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
varying vec3 vNormal;
#endif
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
	return dot(v, vec3(0.3333333f));
}
highp float rand(const in vec2 uv) {
	const highp float a = 12.9898f, b = 78.233f, c = 43758.5453f;
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
	return normalize((matrix * vec4(dir, 0.0f)).xyz);
}
vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {
	return normalize((vec4(dir, 0.0f) * matrix).xyz);
}
mat3 transposeMat3(const in mat3 m) {
	mat3 tmp;
	tmp[0] = vec3(m[0].x, m[1].x, m[2].x);
	tmp[1] = vec3(m[0].y, m[1].y, m[2].y);
	tmp[2] = vec3(m[0].z, m[1].z, m[2].z);
	return tmp;
}
float luminance(const in vec3 rgb) {
	const vec3 weights = vec3(0.2126729f, 0.7151522f, 0.0721750f);
	return dot(weights, rgb);
}
bool isPerspectiveMatrix(mat4 m) {
	return m[2][3] == -1.0f;
}
vec2 equirectUv(in vec3 dir) {
	float u = atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5f;
	float v = asin(clamp(dir.y, -1.0f, 1.0f)) * RECIPROCAL_PI + 0.5f;
	return vec2(u, v);
}
vec3 BRDF_Lambert(const in vec3 diffuseColor) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {
	float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);
	return f0 * (1.0f - fresnel) + (f90 * fresnel);
}
float F_Schlick(const in float f0, const in float f90, const in float dotVH) {
	float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);
	return f0 * (1.0f - fresnel) + (f90 * fresnel);
} // validated
varying float zDepthScene;
uniform sampler2D realWorldDepth;
uniform vec2 coordTrans; 

#ifdef DITHERING
vec3 dithering(vec3 color) {
	float grid_position = rand(gl_FragCoord.xy);
	vec3 dither_shift_RGB = vec3(0.25f / 255.0f, -0.25f / 255.0f, 0.25f / 255.0f);
	dither_shift_RGB = mix(2.0f * dither_shift_RGB, -2.0f * dither_shift_RGB, grid_position);
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
const float ALPHA_HASH_SCALE = 0.05f;
float hash2D(vec2 value) {
	return fract(1.0e4f * sin(17.0f * value.x + 0.1f * value.y) * (0.1f + abs(sin(13.0f * value.y + value.x))));
}
float hash3D(vec3 value) {
	return hash2D(vec2(hash2D(value.xy), value.z));
}
float getAlphaHashThreshold(vec3 position) {
	float maxDeriv = max(length(dFdx(position.xyz)), length(dFdy(position.xyz)));
	float pixScale = 1.0f / (ALPHA_HASH_SCALE * maxDeriv);
	vec2 pixScales = vec2(exp2(floor(log2(pixScale))), exp2(ceil(log2(pixScale))));
	vec2 alpha = vec2(hash3D(floor(pixScales.x * position.xyz)), hash3D(floor(pixScales.y * position.xyz)));
	float lerpFactor = fract(log2(pixScale));
	float x = (1.0f - lerpFactor) * alpha.x + lerpFactor * alpha.y;
	float a = min(lerpFactor, 1.0f - lerpFactor);
	vec3 cases = vec3(x * x / (2.0f * a * (1.0f - a)), (x - 0.5f * a) / (1.0f - a), 1.0f - ((1.0f - x) * (1.0f - x) / (2.0f * a * (1.0f - a))));
	float threshold = (x < (1.0f - a)) ? ((x < a) ? cases.x : cases.y) : cases.z;
	return clamp(threshold, 1.0e-6f, 1.0f);
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
	float clipOpacity = 1.0f;

		#if 0 < 0
	float unionClipOpacity = 1.0f;

	clipOpacity *= 1.0f - unionClipOpacity;
		#endif
	diffuseColor.a *= clipOpacity;
	if(diffuseColor.a == 0.0f)
		discard;
	#else

		#if 0 < 0
	bool clipped = true;

	if(clipped)
		discard;
		#endif
	#endif
#endif
#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0f ? gl_FragCoord.z : log2(vFragDepth) * logDepthBufFC * 0.5f;
#endif
#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D(map, vMapUv);
	#ifdef DECODE_VIDEO_TEXTURE
	sampledDiffuseColor = vec4(mix(pow(sampledDiffuseColor.rgb * 0.9478672986f + vec3(0.0521327014f), vec3(2.4f)), sampledDiffuseColor.rgb * 0.0773993808f, vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045f)))), sampledDiffuseColor.w);

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
	if(diffuseColor.a == 0.0f)
		discard;
	#else
	if(diffuseColor.a < alphaTest)
		discard;
	#endif
#endif
#ifdef USE_ALPHAHASH
	if(diffuseColor.a < getAlphaHashThreshold(vPosition))
		discard;
#endif
	float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D(specularMap, vSpecularMapUv);
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0f;
#endif
	ReflectedLight reflectedLight = ReflectedLight(vec3(0.0f), vec3(0.0f), vec3(0.0f), vec3(0.0f));
	#ifdef USE_LIGHTMAP
	vec4 lightMapTexel = texture2D(lightMap, vLightMapUv);
	reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
	reflectedLight.indirectDiffuse += vec3(1.0f);
	#endif
#ifdef USE_AOMAP
	float ambientOcclusion = (texture2D(aoMap, vAoMapUv).r - 1.0f) * aoMapIntensity + 1.0f;
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
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
	vec3 cameraToFrag;
	if(isOrthographic) {
		cameraToFrag = normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2]));
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
	vec4 envColor = vec4(0.0f);
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
	diffuseColor.a = 1.0f;
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
	float fogFactor = 1.0f - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
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
	vec2 coord = coordTrans * gl_FragCoord.xy + vec2(1.0f, 1.0f);
	float zDepthReal = texture2D(realWorldDepth, coord.yx).x;
	if(zDepthReal < zDepthScene) {
		gl_FragColor.a = 0.1f;
	}
	gl_FragColor = vec4(-1.0f * zDepthScene * 255.0f, -1.0f * zDepthScene * 255.0f, -1.0f * zDepthScene * 255.0f, 1.0f);
	if(zDepthScene < 0.01f && zDepthScene > -0.01f) {
		gl_FragColor = vec4(0.0f, 1.0f, 0.0f, 1.0f);
	}

}