export function forEachMaterial(object3D, fn) {
  if (!object3D.material) return;

  if (Array.isArray(object3D.material)) {
    object3D.material.forEach(fn);
  } else {
    fn(object3D.material);
  }
}

export function mapMaterials(object3D, fn) {
  if (!object3D.material) return;

  if (Array.isArray(object3D.material)) {
    return object3D.material.map(fn);
  } else {
    return fn(object3D.material);
  }
}

// HubsMeshBasicMaterial exists because we need to be able to set the emissiveMap in the avatar preview.
// It also allows the material to be properly copied/cloned.
class HubsMeshBasicMaterial extends THREE.MeshBasicMaterial {
  static fromMeshStandardMaterial(source) {
    const material = new HubsMeshBasicMaterial();

    THREE.Material.prototype.copy.call(material, source);

    material.color.copy(source.color);

    material.emissive.copy(source.emissive);
    material.emissiveIntensity = source.emissiveIntensity;
    material.emissiveMap = source.emissiveMap;

    material.map = source.map;

    material.lightMap = source.lightMap;
    material.lightMapIntensity = source.lightMapIntensity;

    material.aoMap = source.aoMap;
    material.aoMapIntensity = source.aoMapIntensity;

    material.alphaMap = source.alphaMap;

    material.wireframe = source.wireframe;
    material.wireframeLinewidth = source.wireframeLinewidth;
    material.wireframeLinecap = source.wireframeLinecap;
    material.wireframeLinejoin = source.wireframeLinejoin;

    material.skinning = source.skinning;
    material.morphTargets = source.morphTargets;

    return material;
  }

  constructor({ emissive, emissiveMap, emissiveIntensity, ...rest } = {}) {
    super(rest);
    this._emissive = { value: emissive || new THREE.Color() };
    this._emissiveIntensity = { value: emissiveIntensity === undefined ? 1 : emissiveIntensity };
    this._emissiveMap = { value: emissiveMap };
  }

  get emissive() {
    return this._emissive.value;
  }

  set emissive(emissive) {
    this._emissive.value = emissive;
  }

  get emissiveIntensity() {
    return this._emissiveIntensity.value;
  }

  set emissiveIntensity(emissiveIntensity) {
    this._emissiveIntensity.value = emissiveIntensity;
  }

  get emissiveMap() {
    return this._emissiveMap.value;
  }

  set emissiveMap(emissiveMap) {
    this._emissiveMap.value = emissiveMap;
  }

  copy(source) {
    super.copy(source);
    this.emissive.copy(source.emissive);
    this.emissiveIntensity = source.emissiveIntensity;
    this.emissiveMap = source.emissiveMap;
    return this;
  }

  onBeforeCompile = shader => {
    // This patch to the MeshBasicMaterial adds support for emissive maps.
    shader.uniforms.emissive = this._emissive;
    shader.uniforms.emissiveIntensity = this._emissiveIntensity;
    shader.uniforms.emissiveMap = this._emissiveMap;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lightmap_pars_fragment>",
      `#include <lightmap_pars_fragment>
      uniform vec3 emissive;
      uniform sampler2D emissiveMap;
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <envmap_fragment>",
      `#include <envmap_fragment>

      vec3 totalEmissiveRadiance = emissive;
      #include <emissivemap_fragment>
      outgoingLight += totalEmissiveRadiance;

      `
    );
  };
}

class HubsMeshPhongMaterial extends THREE.MeshPhongMaterial {
  static fromMeshStandardMaterial(source) {
    const material = new HubsMeshPhongMaterial();

    THREE.Material.prototype.copy.call(material, source);

    material.color.copy(source.color);

    material.map = source.map;

    material.lightMap = source.lightMap;
    material.lightMapIntensity = source.lightMapIntensity;

    material.aoMap = source.aoMap;
    material.aoMapIntensity = source.aoMapIntensity;

    material.emissive.copy(source.emissive);
    material.emissiveMap = source.emissiveMap;
    material.emissiveIntensity = source.emissiveIntensity;

    material.normalMapType = source.normalMapType;
    material.normalMap = source.normalMap;
    material.normalScale.copy(source.normalScale);

    material.bumpMap = source.bumpMap;
    material.bumpScale = source.bumpScale;

    material.displacementMap = source.displacementMap;
    material.displacementScale = source.displacementScale;
    material.displacementBias = source.displacementBias;

    material.alphaMap = source.alphaMap;

    material.reflectivity = 0.5;
    material.refractionRatio = source.refractionRatio;

    material.wireframe = source.wireframe;
    material.wireframeLinewidth = source.wireframeLinewidth;
    material.wireframeLinecap = source.wireframeLinecap;
    material.wireframeLinejoin = source.wireframeLinejoin;

    material.skinning = source.skinning;
    material.morphTargets = source.morphTargets;
    material.morphNormals = source.morphNormals;

    return material;
  }

  onBeforeCompile = shader => {
    // This patch to MeshPhongMaterial adds support for tangent space normal maps.
    shader.vertexShader = shader.vertexShader.replace(
      "varying vec3 vNormal;",
      `varying vec3 vNormal;
      #ifdef USE_TANGENT
        varying vec3 vTangent;
        varying vec3 vBitangent;
      #endif
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      "vNormal = normalize( transformedNormal );",
      `vNormal = normalize( transformedNormal );
      
        #ifdef USE_TANGENT
      
          vTangent = normalize( transformedTangent );
          vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
      
        #endif
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_phong_pars_fragment>",
      `#include <lights_phong_pars_fragment>
      #ifndef FLAT_SHADED

        #ifdef USE_TANGENT
          varying vec3 vTangent;
          varying vec3 vBitangent;
        #endif

      #endif
      `
    );
  };
}

export function convertStandardMaterial(source, quality) {
  if (!source.isMeshStandardMaterial) {
    return source;
  }

  if (quality === "medium") {
    return HubsMeshPhongMaterial.fromMeshStandardMaterial(source);
  } else if (quality === "low") {
    return HubsMeshBasicMaterial.fromMeshStandardMaterial(source);
  }

  return source;
}

export function disposeTexture(texture) {
  if (texture.dash) {
    texture.dash.reset();
  }

  if (texture.image instanceof HTMLVideoElement) {
    const video = texture.image;
    video.pause();
    video.src = "";
    video.load();
  }

  if (texture.hls) {
    texture.hls.stopLoad();
    texture.hls.detachMedia();
    texture.hls.destroy();
    texture.hls = null;
  }

  texture.dispose();
}
