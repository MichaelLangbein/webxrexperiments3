
/**********************************************************
 UNIFORMS
***********************************************************/

alphaMap : {
value : null }
alphaMapTransform : {
value : Matrix3 }
alphaTest : {
value : 0 }
aoMap : {
value : null }
aoMapIntensity : {
value : 1 }
aoMapTransform : {
value : Matrix3 }
diffuse : {
value : Color }
envMap : {
value : null }
envMapRotation : {
value : Matrix3 }
flipEnvMap : {
value : - 1 }
fogColor : {
value : Color }
fogDensity : {
value : 0.00025 }
fogFar : {
value : 2000 }
fogNear : {
value : 1 }
ior : {
value : 1.5 }
lightMap : {
value : null }
lightMapIntensity : {
value : 1 }
lightMapTransform : {
value : Matrix3 }
map : {
value : null }
mapTransform : {
value : Matrix3 }
opacity : {
value : 1 }
reflectivity : {
value : 1 }
refractionRatio : {
value : 0.98 }
specularMap : {
value : null }
specularMapTransform : {
value : Matrix3 }

/**********************************************************
 VERTEX
***********************************************************/

#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}

/**********************************************************
 FRAGMENT   
***********************************************************/

uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4(diffuse, opacity);
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
ReflectedLight reflectedLight = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
	#ifdef USE_LIGHTMAP
vec4 lightMapTexel = texture2D(lightMap, vLightMapUv);
reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
reflectedLight.indirectDiffuse += vec3(1.0);
	#endif
	#include <aomap_fragment>
reflectedLight.indirectDiffuse *= diffuseColor.rgb;
vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}