import nextTick from "../utils/next-tick";
import { mapMaterials, convertStandardMaterial } from "../utils/material-utils";
import SketchfabZipWorker from "../workers/sketchfab-zip.worker.js";
import { getCustomGLTFParserURLResolver } from "../utils/media-url-utils";
import { promisifyWorker } from "../utils/promisify-worker.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { disposeNode, cloneObject3D } from "../utils/three-utils";
import HubsTextureLoader from "../loaders/HubsTextureLoader";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader";

// GLTFLoader is placed under THREE. Similarly we place VRM under THREE.
// So importing @pixiv/three-vrm/packages/three-vrm/lib/three-vrm.js,
// rather than @pixiv/three-vrm.
import "@pixiv/three-vrm/packages/three-vrm/lib/three-vrm";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

class GLTFCache {
  cache = new Map();

  set(src, gltf) {
    this.cache.set(src, {
      gltf,
      count: 0
    });
    return this.retain(src);
  }

  has(src) {
    return this.cache.has(src);
  }

  get(src) {
    return this.cache.get(src);
  }

  retain(src) {
    const cacheItem = this.cache.get(src);
    cacheItem.count++;
    return cacheItem;
  }

  release(src) {
    const cacheItem = this.cache.get(src);

    if (!cacheItem) {
      console.error(`Releasing uncached gltf ${src}`);
      return;
    }

    cacheItem.count--;
    if (cacheItem.count <= 0) {
      cacheItem.gltf.scene.traverse(disposeNode);
      this.cache.delete(src);
    }
  }
}
const gltfCache = new GLTFCache();
const inflightGltfs = new Map();

const extractZipFile = promisifyWorker(new SketchfabZipWorker());

function defaultInflator(el, componentName, componentData) {
  if (!AFRAME.components[componentName]) {
    throw new Error(`Inflator failed. "${componentName}" component does not exist.`);
  }
  if (AFRAME.components[componentName].multiple && Array.isArray(componentData)) {
    for (let i = 0; i < componentData.length; i++) {
      el.setAttribute(componentName + "__" + i, componentData[i]);
    }
  } else {
    el.setAttribute(componentName, componentData);
  }
}

AFRAME.GLTFModelPlus = {
  // eslint-disable-next-line no-unused-vars
  components: {},
  registerComponent(componentKey, componentName, inflator) {
    inflator = inflator || defaultInflator;
    AFRAME.GLTFModelPlus.components[componentKey] = { inflator, componentName };
  }
};

function generateMeshBVH(object3D) {
  object3D.traverse(obj => {
    // note that we might already have a bounds tree if this was a clone of an object with one
    const hasBufferGeometry = obj.isMesh && obj.geometry.isBufferGeometry;
    const hasBoundsTree = hasBufferGeometry && obj.geometry.boundsTree;
    if (hasBufferGeometry && !hasBoundsTree && obj.geometry.attributes.position) {
      const geo = obj.geometry;

      if (
        geo.attributes.position.isInterleavedBufferAttribute ||
        (geo.index && geo.index.isInterleavedBufferAttribute)
      ) {
        console.warn("Skipping generaton of MeshBVH for interleaved geoemtry as it is not supported");
        return;
      }

      const triCount = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      // only bother using memory and time making a BVH if there are a reasonable number of tris,
      // and if there are too many it's too painful and large to tolerate doing it (at least until
      // we put this in a web worker)

      if (triCount > 1000 && triCount < 1000000) {
        // note that bounds tree construction creates an index as a side effect if one doesn't already exist
        geo.boundsTree = new MeshBVH(obj.geometry, { strategy: 0, maxDepth: 30 });
      }
    }
  });
}

function cloneGltf(gltf) {
  return {
    animations: gltf.scene.animations,
    // Currently VRM.update() for the secondary animation doesn't have an effect
    // to cloned models. So no cloning as temporal workaroud for now.
    // Of course it's problematic if a same model is loaded twice or more.
    // @TODO: Fix the root issue
    scene: gltf.scene.userData.isVRM ? gltf.scene : cloneObject3D(gltf.scene)
  };
}

function getHubsComponents(node) {
  const hubsComponents =
    node.userData.gltfExtensions &&
    (node.userData.gltfExtensions.MOZ_hubs_components || node.userData.gltfExtensions.HUBS_components);

  // We can remove support for legacy components when our environment, avatar and interactable models are
  // updated to match Spoke output.
  const legacyComponents = node.userData.components;

  return hubsComponents || legacyComponents;
}

function getHubsComponentsFromMaterial(node) {
  const material = node.material;

  if (!material) {
    return null;
  }

  // VRM model can have multi materials (material array).
  // We want to think how we should handle it later
  // so returning null for now.
  // The only material component we have right now is
  // video-texture-target. Returning null may be ok so far.
  // @TODO: Fix me
  if (Array.isArray(material)) {
    return null;
  }

  return getHubsComponents(material);
}

/// Walks the tree of three.js objects starting at the given node, using the GLTF data
/// and template data to construct A-Frame entities and components when necessary.
/// (It's unnecessary to construct entities for subtrees that have no component data
/// or templates associated with any of their nodes.)
///
/// Returns the A-Frame entity associated with the given node, if one was constructed.
const inflateEntities = function(indexToEntityMap, node, templates, isRoot, modelToWorldScale = 1) {
  // TODO: Remove this once we update the legacy avatars to the new node names
  if (node.name === "Chest") {
    node.name = "Spine";
  } else if (node.name === "Root Scene") {
    node.name = "AvatarRoot";
  } else if (node.name === "Bot_Skinned") {
    node.name = "AvatarMesh";
  }

  // inflate subtrees first so that we can determine whether or not this node needs to be inflated
  const childEntities = [];
  const children = node.children.slice(0); // setObject3D mutates the node's parent, so we have to copy
  for (const child of children) {
    const el = inflateEntities(indexToEntityMap, child, templates);
    if (el) {
      childEntities.push(el);
    }
  }

  const entityComponents = getHubsComponents(node);
  const materialComponents = getHubsComponentsFromMaterial(node);

  const nodeHasBehavior = !!entityComponents || !!materialComponents || node.name in templates;
  if (!nodeHasBehavior && !childEntities.length && !isRoot) {
    return null; // we don't need an entity for this node
  }

  const el = document.createElement("a-entity");
  el.append.apply(el, childEntities);

  // Remove invalid CSS class name characters.
  const className = (node.name || node.uuid).replace(/[^\w-]/g, "");
  el.classList.add(className);

  // AFRAME rotation component expects rotations in YXZ, convert it
  if (node.rotation.order !== "YXZ") {
    node.rotation.setFromQuaternion(node.quaternion, "YXZ");
  }

  // Copy over the object's transform to the THREE.Group and reset the actual transform of the Object3D
  // all updates to the object should be done through the THREE.Group wrapper
  el.object3D.position.copy(node.position);
  el.object3D.rotation.copy(node.rotation);
  el.object3D.scale.copy(node.scale).multiplyScalar(modelToWorldScale);
  el.object3D.matrixNeedsUpdate = true;

  node.matrixAutoUpdate = false;
  node.matrix.identity();
  node.matrix.decompose(node.position, node.rotation, node.scale);

  el.setObject3D(node.type.toLowerCase(), node);
  if (entityComponents && "nav-mesh" in entityComponents) {
    el.setObject3D("mesh", node);
  }

  // Set the name of the `THREE.Group` to match the name of the node,
  // so that templates can be attached to the correct AFrame entity.
  el.object3D.name = node.name;

  // Set the uuid of the `THREE.Group` to match the uuid of the node,
  // so that `THREE.PropertyBinding` will find (and later animate)
  // the group. See `PropertyBinding.findNode`:
  // https://github.com/mrdoob/three.js/blob/dev/src/animation/PropertyBinding.js#L211
  el.object3D.uuid = node.uuid;
  node.uuid = THREE.Math.generateUUID();

  if (node.animations) {
    // Pass animations up to the group object so that when we can pass the group as
    // the optional root in `THREE.AnimationMixer.clipAction` and use the hierarchy
    // preserved under the group (but not the node). Otherwise `clipArray` will be
    // `null` in `THREE.AnimationClip.findByName`.
    node.parent.animations = node.animations;
  }

  if (node.morphTargetInfluences) {
    node.parent.morphTargetInfluences = node.morphTargetInfluences;
  }

  const gltfIndex = node.userData.gltfIndex;
  if (gltfIndex !== undefined) {
    indexToEntityMap[gltfIndex] = el;
  }

  return el;
};

async function inflateComponents(inflatedEntity, indexToEntityMap) {
  let isFirstInflation = true;
  const objectInflations = [];

  inflatedEntity.object3D.traverse(async object3D => {
    const objectInflation = {};
    objectInflation.promise = new Promise(resolve => (objectInflation.resolve = resolve));
    objectInflations.push(objectInflation);

    if (!isFirstInflation) {
      await objectInflations.shift().promise;
    }
    isFirstInflation = false;

    const entityComponents = getHubsComponents(object3D);
    const el = object3D.el;

    if (entityComponents && el) {
      for (const prop in entityComponents) {
        if (entityComponents.hasOwnProperty(prop) && AFRAME.GLTFModelPlus.components.hasOwnProperty(prop)) {
          const { componentName, inflator } = AFRAME.GLTFModelPlus.components[prop];
          await inflator(el, componentName, entityComponents[prop], entityComponents, indexToEntityMap);
        }
      }
    }

    const materialComponents = getHubsComponentsFromMaterial(object3D);

    if (materialComponents && el) {
      for (const prop in materialComponents) {
        if (materialComponents.hasOwnProperty(prop) && AFRAME.GLTFModelPlus.components.hasOwnProperty(prop)) {
          const { componentName, inflator } = AFRAME.GLTFModelPlus.components[prop];
          await inflator(el, componentName, materialComponents[prop], materialComponents, indexToEntityMap);
        }
      }
    }

    objectInflation.resolve();
  });

  await objectInflations.shift().promise;
}

function attachTemplate(root, name, templateRoot) {
  const targetEls = root.querySelectorAll("." + name);
  for (const el of targetEls) {
    const root = templateRoot.cloneNode(true);
    // Merge root element attributes with the target element
    for (const { name, value } of root.attributes) {
      el.setAttribute(name, value);
    }

    // Append all child elements
    while (root.children.length > 0) {
      el.appendChild(root.children[0]);
    }
  }
}

function getHubsComponentsExtension(node) {
  if (node.extensions && node.extensions.MOZ_hubs_components) {
    return node.extensions.MOZ_hubs_components;
  } else if (node.extensions && node.extensions.HUBS_components) {
    return node.extensions.HUBS_components;
  } else if (node.extras && node.extras.gltfExtensions && node.extras.gltfExtensions.MOZ_hubs_components) {
    return node.extras.gltfExtensions.MOZ_hubs_components;
  }
}

// Versions are documented here: https://github.com/mozilla/hubs/wiki/MOZ_hubs_components-Changelog
// Make sure to update the wiki and Spoke when bumping a version
function runMigration(version, json) {
  if (version < 2) {
    //old heightfields will be on the same node as the nav-mesh, delete those
    const oldHeightfieldNode = json.nodes.find(node => {
      const components = getHubsComponentsExtension(node);
      return components && components.heightfield && components["nav-mesh"];
    });
    if (oldHeightfieldNode) {
      if (oldHeightfieldNode.extensions && oldHeightfieldNode.extensions.MOZ_hubs_components) {
        delete oldHeightfieldNode.extensions.MOZ_hubs_components.heightfield;
      } else if (oldHeightfieldNode.extensions && oldHeightfieldNode.extensions.HUBS_components) {
        delete oldHeightfieldNode.extensions.HUBS_components.heightfield;
      } else if (
        oldHeightfieldNode.extras &&
        oldHeightfieldNode.extras.gltfExtensions &&
        oldHeightfieldNode.extras.gltfExtensions.MOZ_hubs_components
      ) {
        delete oldHeightfieldNode.extras.gltfExtensions.MOZ_hubs_components;
      }
    }
  }

  if (version < 4) {
    // Lights prior to version 4 should treat range === 0 as if it has zero decay
    if (json.nodes) {
      for (const node of json.nodes) {
        const components = getHubsComponentsExtension(node);

        if (!components) {
          continue;
        }

        const light = components["spot-light"] || components["point-light"];

        if (light && light.range === 0) {
          light.decay = 0;
        }
      }
    }
  }
}

let ktxLoader;

class GLTFHubsPlugin {
  constructor(parser, jsonPreprocessor) {
    this.parser = parser;
    this.jsonPreprocessor = jsonPreprocessor;

    // We override glTF parser textureLoader with our HubsTextureLoader for
    // 1. Clean up the texture image related resources after it is uploaded to WebGL texture
    // 2. Use ImageBitmapLoader if it is available. The latest official Three.js (r128) glTF loader
    //    attempts to use ImageBitmapLoader if it is avaiable except for Firefox.
    //    But we want to use ImageBitmapLoader even for Firefox so we need this overriding hack.
    // But overriding the textureLoader is hacky and it can cause future potential problems
    // especially in upstraming Three.js. So ideally we should replace this hack
    // with the one using more proper APIs like plugin system at some point.
    // Note: Be careful when replacing our Three.js fork with the official upstraming one that
    //       the latest ImageBitmapLoader passes the second argument to createImageBitmap()
    //       but currently createImageBitmap() on Firefox fails if the second argument is defined.
    //       https://bugzilla.mozilla.org/show_bug.cgi?id=1367251
    //       and this is the reason why the official glTF loader doesn't use ImageBitmapLoader
    //       for Firefox. We will need a workaround for that.
    parser.textureLoader = new HubsTextureLoader(parser.options.manager);
  }

  beforeRoot() {
    const parser = this.parser;
    const jsonPreprocessor = this.jsonPreprocessor;

    //
    if (jsonPreprocessor) {
      parser.json = jsonPreprocessor(parser.json);
    }

    // Ideally Hubs components stuffs should be handled in MozHubsComponents plugin?
    let version = 0;
    if (
      parser.json.extensions &&
      parser.json.extensions.MOZ_hubs_components &&
      parser.json.extensions.MOZ_hubs_components.hasOwnProperty("version")
    ) {
      version = parser.json.extensions.MOZ_hubs_components.version;
    }
    runMigration(version, parser.json);

    // Note: Here may be rewritten with the one with parser.associations
    const nodes = parser.json.nodes;
    if (nodes) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (!node.extras) {
          node.extras = {};
        }

        node.extras.gltfIndex = i;
      }
    }
  }

  afterRoot(gltf) {
    gltf.scene.traverse(object => {
      // GLTFLoader sets matrixAutoUpdate on animated objects, we want to keep the defaults
      // @TODO: Should this be fixed in the gltf loader?
      object.matrixAutoUpdate = THREE.Object3D.DefaultMatrixAutoUpdate;
      const materialQuality = window.APP.store.materialQualitySetting;
      object.material = mapMaterials(object, material => convertStandardMaterial(material, materialQuality));
    });

    // Replace animation target node name with the node uuid.
    // I assume track name is 'nodename.property'.
    if (gltf.animations) {
      for (const animation of gltf.animations) {
        for (const track of animation.tracks) {
          const parsedPath = THREE.PropertyBinding.parseTrackName(track.name);
          for (const scene of gltf.scenes) {
            const node = THREE.PropertyBinding.findNode(scene, parsedPath.nodeName);
            if (node) {
              track.name = track.name.replace(/^[^.]*\./, node.uuid + ".");
              break;
            }
          }
        }
      }
    }

    //
    gltf.scene.animations = gltf.animations;
  }
}

class GLTFHubsLightMapExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = "MOZ_lightmap";
  }

  // @TODO: Ideally we should use extendMaterialParams hook.
  //        But the current official glTF loader doesn't fire extendMaterialParams
  //        hook for unlit and specular-glossiness materials.
  //        So using loadMaterial hook as workaround so far.
  //        Cons is loadMaterial hook is fired as _invokeOne so
  //        if other plugins defining loadMaterial is registered
  //        there is a chance that this light map extension handler isn't called.
  //        The glTF loader should be updated to remove the limitation.
  loadMaterial(materialIndex) {
    const parser = this.parser;
    const json = parser.json;
    const materialDef = json.materials[materialIndex];

    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return null;
    }

    const extensionDef = materialDef.extensions[this.name];

    const pending = [];

    pending.push(parser.loadMaterial(materialIndex));
    pending.push(parser.getDependency("texture", extensionDef.index));

    return Promise.all(pending).then(results => {
      const material = results[0];
      const lightMap = results[1];
      material.lightMap = lightMap;
      material.lightMapIntensity = extensionDef.intensity !== undefined ? extensionDef.intensity : 1;
      return material;
    });
  }
}

class GLTFHubsTextureBasisExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = "MOZ_HUBS_texture_basis";
  }

  loadTexture(textureIndex) {
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];

    if (!textureDef.extensions || !textureDef.extensions[this.name]) {
      return null;
    }

    if (!parser.options.ktx2Loader) {
      // @TODO: Display warning (only if the extension is in extensionsRequired)?
      return null;
    }

    console.warn(`The ${this.name} extension is deprecated, you should use KHR_texture_basisu instead.`);

    const extensionDef = textureDef.extensions[this.name];
    const source = json.images[extensionDef.source];
    const loader = parser.options.ktx2Loader.basisLoader;

    return parser.loadTextureImage(textureIndex, source, loader);
  }
}

class GLTFVRMPlugin {
  constructor(parser) {
    this.parser = parser;
    this.name = "VRM";
  }

  afterRoot(gltf) {
    const json = this.parser.json;
    if (!json.extensions || !json.extensions[this.name]) {
      return null;
    }

    THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);

    return THREE.VRM.from(gltf).then(vrm => {
      const scene = vrm.scene;

      // VRM Secondary animation with Spring bones
      // @TODO: This should be moved into the existing or new VRM animation system
      // @TODO: Currently the secondary animation doesn't work correctly
      // if the model's scale is non-zero. If we place a 3D object its scale
      // is controled to let the model be fit into a certain size and
      // the secondary animation will look weird. Fix the root issue in THREE.VRM.
      // @TODO: Evaluate the secondary animation performance. If it's slow,
      // consider to load off from the main thread to workers.
      // @TODO: Should owner handle the secondary animation and send transforms to
      // other peers rather than handling it in all peers?
      const clock = new THREE.Clock();
      const animate = () => {
        requestAnimationFrame(animate);
        vrm.update(clock.getDelta());
      };
      animate();

      // Add key frame animation clip for animation + VRM test
      // @TODO: Remove in the production
      gltf.animations.push(this._createAnimationClipForTest(scene, vrm));

      // Allow to detect the VRM model
      // @TODO: Think of better solution?
      scene.userData.isVRM = true;

      // For debug
      // @TODO: Remove in the production
      console.log(vrm);
    });
  }

  _createAnimationClipForTest(scene, vrm) {
    const quatA = new THREE.Quaternion(0.0, 0.0, 0.0, 1.0);
    const quatB = new THREE.Quaternion(0.0, 0.0, 0.0, 1.0);
    quatB.setFromEuler(new THREE.Euler(0.0, 0.0, 0.25 * Math.PI));

    const blinkTrack = new THREE.NumberKeyframeTrack(
      vrm.blendShapeProxy.getBlendShapeTrackName(THREE.VRMSchema.BlendShapePresetName.Blink), // name
      [0.0, 0.5, 1.0], // times
      [0.0, 2.0, 0.0] // values
    );

    const leftArmTrack = new THREE.QuaternionKeyframeTrack(
      vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftUpperArm).name + ".quaternion", // name
      [0.0, 1.0, 2.0], // times
      [...quatA.toArray(), ...quatB.toArray(), ...quatA.toArray()] // values
    );

    quatB.setFromEuler(new THREE.Euler(0.25 * Math.PI, 0, 0));
    const rightArmTrack = new THREE.QuaternionKeyframeTrack(
      vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightUpperArm).name + ".quaternion", // name
      [0.0, 1.0, 2.0], // times
      [...quatA.toArray(), ...quatB.toArray(), ...quatA.toArray()] // values
    );

    quatA.setFromEuler(new THREE.Euler(0.0, -0.25 * Math.PI, 0));
    quatB.setFromEuler(new THREE.Euler(0.0, 0.25 * Math.PI, 0));
    const neckTrack = new THREE.QuaternionKeyframeTrack(
      vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Neck).name + ".quaternion", // name
      [0.0, 1.0, 2.0], // times
      [...quatA.toArray(), ...quatB.toArray(), ...quatA.toArray()] // values
    );

    const clip = new THREE.AnimationClip("animation", 2.0, [blinkTrack, leftArmTrack, rightArmTrack, neckTrack]);

    for (const track of clip.tracks) {
      const parsedPath = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(scene, parsedPath.nodeName);
      if (node) {
        track.name = track.name.replace(/^[^.]*\./, node.uuid + ".");
      }
    }

    return clip;
  }
}

export async function loadGLTF(src, contentType, onProgress, jsonPreprocessor) {
  let gltfUrl = src;
  let fileMap;

  if (contentType && (contentType.includes("model/gltf+zip") || contentType.includes("application/x-zip-compressed"))) {
    fileMap = await extractZipFile(gltfUrl);
    gltfUrl = fileMap["scene.gtlf"];
  }

  const loadingManager = new THREE.LoadingManager();
  loadingManager.setURLModifier(getCustomGLTFParserURLResolver(gltfUrl));
  const gltfLoader = new THREE.GLTFLoader(loadingManager);
  gltfLoader
    .register(parser => new GLTFHubsPlugin(parser, jsonPreprocessor))
    .register(parser => new GLTFHubsLightMapExtension(parser))
    .register(parser => new GLTFHubsTextureBasisExtension(parser))
    .register(parser => new GLTFVRMPlugin(parser));

  // TODO some models are loaded before the renderer exists. This is likely things like the camera tool and loading cube.
  // They don't currently use KTX textures but if they did this would be an issue. Fixing this is hard but is part of
  // "taking control of the render loop" which is something we want to tackle for many reasons.
  if (!ktxLoader && AFRAME && AFRAME.scenes && AFRAME.scenes[0]) {
    ktxLoader = new KTX2Loader(loadingManager).detectSupport(AFRAME.scenes[0].renderer);
  }

  if (ktxLoader) {
    gltfLoader.setKTX2Loader(ktxLoader);
  }

  return new Promise((resolve, reject) => {
    gltfLoader.load(gltfUrl, resolve, onProgress, reject);
  }).finally(() => {
    if (fileMap) {
      // The GLTF is now cached as a THREE object, we can get rid of the original blobs
      Object.keys(fileMap).forEach(URL.revokeObjectURL);
    }
  });
}

export async function loadModel(src, contentType = null, useCache = false, jsonPreprocessor = null) {
  if (useCache) {
    if (gltfCache.has(src)) {
      gltfCache.retain(src);
      return cloneGltf(gltfCache.get(src).gltf);
    } else {
      if (inflightGltfs.has(src)) {
        const gltf = await inflightGltfs.get(src);
        gltfCache.retain(src);
        return cloneGltf(gltf);
      } else {
        const promise = loadGLTF(src, contentType, null, jsonPreprocessor);
        inflightGltfs.set(src, promise);
        const gltf = await promise;
        inflightGltfs.delete(src);
        gltfCache.set(src, gltf);
        return cloneGltf(gltf);
      }
    }
  } else {
    return loadGLTF(src, contentType, null, jsonPreprocessor);
  }
}

function resolveAsset(src) {
  // If the src attribute is a selector, get the url from the asset item.
  if (src && src.charAt(0) === "#") {
    const assetEl = document.getElementById(src.substring(1));
    if (assetEl) {
      return assetEl.getAttribute("src");
    }
  }
  return src;
}

/**
 * Loads a GLTF model, optionally recursively "inflates" the child nodes of a model into a-entities and sets
 * allowed components on them if defined in the node's extras.
 * @namespace gltf
 * @component gltf-model-plus
 */
AFRAME.registerComponent("gltf-model-plus", {
  schema: {
    src: { type: "string" },
    contentType: { type: "string" },
    useCache: { default: true },
    inflate: { default: false },
    batch: { default: false },
    modelToWorldScale: { type: "number", default: 1 }
  },

  init() {
    // This can be set externally if a consumer wants to do some node preprocssing.
    this.jsonPreprocessor = null;

    this.loadTemplates();
  },

  update() {
    this.applySrc(resolveAsset(this.data.src), this.data.contentType);
  },

  remove() {
    if (this.data.batch && this.model) {
      this.el.sceneEl.systems["hubs-systems"].batchManagerSystem.removeObject(this.el.object3DMap.mesh);
    }
    const src = resolveAsset(this.data.src);
    if (src) {
      gltfCache.release(src);
    }
  },

  loadTemplates() {
    this.templates = {};
    this.el.querySelectorAll(":scope > template").forEach(templateEl => {
      const root = document.importNode(templateEl.firstElementChild || templateEl.content.firstElementChild, true);
      this.templates[templateEl.getAttribute("data-name")] = root;
    });
  },

  async applySrc(src, contentType) {
    try {
      if (src === this.lastSrc) return;

      const lastSrc = this.lastSrc;
      this.lastSrc = src;

      if (!src) {
        if (this.inflatedEl) {
          console.warn("gltf-model-plus set to an empty source, unloading inflated model.");
          this.disposeLastInflatedEl();
        }
        return;
      }

      this.el.emit("model-loading");
      const gltf = await loadModel(src, contentType, this.data.useCache, this.jsonPreprocessor);

      // If we started loading something else already
      // TODO: there should be a way to cancel loading instead
      if (src != this.lastSrc) return;

      // If we had inflated something already before, clean that up
      this.disposeLastInflatedEl();

      this.model = gltf.scene;

      if (this.data.batch) {
        this.el.sceneEl.systems["hubs-systems"].batchManagerSystem.addObject(this.model);
      }

      if (gltf.animations.length > 0) {
        this.el.setAttribute("animation-mixer", {});
        this.el.components["animation-mixer"].initMixer(this.model.animations);
      } else {
        generateMeshBVH(this.model);
      }

      const indexToEntityMap = {};

      let object3DToSet = this.model;
      if (
        this.data.inflate &&
        (this.inflatedEl = inflateEntities(
          indexToEntityMap,
          this.model,
          this.templates,
          true,
          this.data.modelToWorldScale
        ))
      ) {
        this.el.appendChild(this.inflatedEl);

        object3DToSet = this.inflatedEl.object3D;
        object3DToSet.visible = false;

        // TODO: Still don't fully understand the lifecycle here and how it differs between browsers, we should dig in more
        // Wait one tick for the appended custom elements to be connected before attaching templates
        await nextTick();
        if (src != this.lastSrc) return; // TODO: there must be a nicer pattern for this

        await inflateComponents(this.inflatedEl, indexToEntityMap);

        for (const name in this.templates) {
          attachTemplate(this.el, name, this.templates[name]);
        }
      }

      // The call to setObject3D below recursively clobbers any `el` backreferences to entities
      // in the entire inflated entity graph to point to `object3DToSet`.
      //
      // We don't want those overwritten, since lots of code assumes `object3d.el` points to the relevant
      // A-Frame entity for that three.js object, so we back them up and re-wire them here. If we didn't do
      // this, all the `el` properties on these object3ds would point to the `object3DToSet` which is either
      // the model or the root GLTF inflated entity.
      const rewires = [];

      object3DToSet.traverse(o => {
        const el = o.el;
        if (el) rewires.push(() => (o.el = el));
      });

      const environmentMapComponent = this.el.sceneEl.components["environment-map"];

      if (environmentMapComponent) {
        environmentMapComponent.applyEnvironmentMap(object3DToSet);
      }

      if (lastSrc) {
        gltfCache.release(lastSrc);
      }
      this.el.setObject3D("mesh", object3DToSet);

      rewires.forEach(f => f());

      object3DToSet.visible = true;
      this.el.emit("model-loaded", { format: "gltf", model: object3DToSet });
    } catch (e) {
      gltfCache.release(src);
      console.error("Failed to load glTF model", e, this);
      this.el.emit("model-error", { format: "gltf", src });
    }
  },

  disposeLastInflatedEl() {
    if (this.inflatedEl) {
      this.inflatedEl.parentNode.removeChild(this.inflatedEl);

      this.inflatedEl.object3D.traverse(x => {
        if (x.material && x.material.dispose) {
          x.material.dispose();
        }

        if (x.geometry) {
          if (x.geometry.dispose) {
            x.geometry.dispose();
          }

          x.geometry.boundsTree = null;
        }
      });

      delete this.inflatedEl;

      this.el.removeAttribute("animation-mixer");
    }
  }
});
