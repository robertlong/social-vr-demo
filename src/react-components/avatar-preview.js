import React, { Component } from "react";
import PropTypes from "prop-types";
import { injectIntl, FormattedMessage } from "react-intl";
import classNames from "classnames";

// It seems we need to use require to import modules
// under the three/examples/js to avoid tree shaking
// in webpack production mode.
require("three/examples/js/controls/OrbitControls");

import { createDefaultEnvironmentMap } from "../components/environment-map";
import { loadGLTF } from "../components/gltf-model-plus";
import { disposeNode, findNode } from "../utils/three-utils";
import { ensureAvatarMaterial, MAT_NAME } from "../utils/avatar-utils";
import { createImageBitmap, disposeImageBitmap } from "../utils/image-bitmap-utils";
import { proxiedUrlFor } from "../utils/media-url-utils";
import styles from "../assets/stylesheets/avatar-preview.scss";

const TEXTURE_PROPS = {
  base_map: ["map"],
  emissive_map: ["emissiveMap"],
  normal_map: ["normalMap"],
  orm_map: ["aoMap", "roughnessMap", "metalnessMap"]
};

const ALL_MAPS = Object.keys(TEXTURE_PROPS);

// This should match our aframe renderer="antialias: true; colorManagement: true; sortObjects: true;
// physicallyCorrectLights: true; webgl2: true; multiview: false;"
function createRenderer(canvas, alpha = false, useDevicePixelRatio = true) {
  const context = canvas.getContext("webgl2", {
    alpha,
    depth: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "default"
  });

  const renderer = new THREE.WebGLRenderer({ alpha, canvas, context, forceWebVR: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.physicallyCorrectLights = true;
  if (useDevicePixelRatio) {
    renderer.setPixelRatio(window.devicePixelRatio);
  }
  return renderer;
}

const createImageBitmapFromURL = url =>
  fetch(url)
    .then(r => r.blob())
    .then(createImageBitmap);

const ORBIT_ANGLE = new THREE.Euler(-30 * THREE.Math.DEG2RAD, 30 * THREE.Math.DEG2RAD, 0);
const DEFAULT_MARGIN = 1;

function fitBoxInFrustum(camera, box, center, margin = DEFAULT_MARGIN) {
  const halfYExtents = Math.max(box.max.y - center.y, center.y - box.min.y);
  const halfVertFOV = THREE.Math.degToRad(camera.fov / 2);
  camera.position.set(0, 0, (halfYExtents / Math.tan(halfVertFOV) + box.max.z) * margin);
  camera.position.applyEuler(ORBIT_ANGLE);
  camera.position.add(center);
  camera.lookAt(center);
}

class AvatarPreview extends Component {
  static propTypes = {
    avatarGltfUrl: PropTypes.string,
    className: PropTypes.string,
    onGltfLoaded: PropTypes.func
  };
  constructor(props) {
    super(props);
    this.state = { loading: true, error: null };
    this.avatar = null;
    this.imageBitmaps = {};
  }

  componentDidMount = () => {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    this.controls.screenSpacePanning = true;
    this.controls.enableKeys = true;

    const light = new THREE.DirectionalLight(0xf7f6ef, 1);
    light.position.set(0, 10, 10);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight(0xb1e3ff, 0xb1e3ff, 2.5));

    this.loadId = 0;

    this.camera.position.set(-0.2, 0.5, 0.5);
    this.camera.matrixAutoUpdate = true;

    this.controls.target.set(0, 0.45, 0);
    this.controls.update();

    if (this.props.avatarGltfUrl) {
      this.loadCurrentAvatarGltfUrl();
    }

    const clock = new THREE.Clock();

    this.snapshotCanvas = document.createElement("canvas");
    this.snapshotCanvas.width = 720;
    this.snapshotCanvas.height = 1280;
    this.snapshotCamera = new THREE.PerspectiveCamera(55, 720 / 1280, 0.1, 1000);
    this.snapshotCamera.matrixAutoUpdate = true;
    this.snapshotRenderer = createRenderer(this.snapshotCanvas, true, false);
    this.snapshotRenderer.setClearAlpha(0);

    this.previewRenderer = createRenderer(this.canvas);
    this.previewRenderer.setClearColor(0xeaeaea);
    this.previewRenderer.setAnimationLoop(() => {
      const dt = clock.getDelta();
      this.mixer && this.mixer.update(dt);
      this.previewRenderer.render(this.scene, this.camera);
    });
    window.addEventListener("resize", this.resize);
    this.resize();
  };

  resize = () => {
    const width = this.canvas.parentElement.offsetWidth;
    const height = this.canvas.parentElement.offsetHeight;
    this.previewRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  setAvatar = avatar => {
    if (!avatar) return;
    this.avatar = avatar;
    this.scene.add(avatar);
    this.resetCamera();
    this.setState({ error: null, loading: false });
  };

  resetCamera = (() => {
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    return () => {
      box.setFromObject(this.avatar);
      box.getCenter(center);

      // Shift the center vertically in order to frame the avatar nicely.
      center.y = (box.max.y - box.min.y) * 0.6 + box.min.y;

      fitBoxInFrustum(this.camera, box, center);
      fitBoxInFrustum(this.snapshotCamera, box, center, 0.7);

      this.controls.target.copy(center);
      this.controls.update();
    };
  })();

  componentWillUnmount = () => {
    // Gotta be particularly careful about disposing things here since we will likely create many avatar
    // previews during a session and Chrome will eventually discard the oldest webgl context if we leak
    // contexts by holding on to them directly or indirectly.

    this.scene && this.scene.traverse(disposeNode);
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
    }
    if (this.snapshotRenderer) {
      this.snapshotRenderer.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls.domElement = null;
    }

    Object.values(this.imageBitmaps).forEach(img => disposeImageBitmap(img));
    window.removeEventListener("resize", this.resize);
  };

  componentDidUpdate = async oldProps => {
    if (oldProps.avatarGltfUrl !== this.props.avatarGltfUrl) {
      if (this.avatar) {
        this.scene.remove(this.avatar);
        this.avatar = null;
      }
      if (this.props.avatarGltfUrl) {
        this.setState({ error: null, loading: true });
        await this.loadCurrentAvatarGltfUrl();
      }
    }
    this.applyMaps(oldProps, this.props);
  };

  async loadCurrentAvatarGltfUrl() {
    const newLoadId = ++this.loadId;
    const url = proxiedUrlFor(this.props.avatarGltfUrl);
    const gltf = await this.loadPreviewAvatar(url);
    // If we had started loading another avatar while we were loading this one, throw this one away
    if (newLoadId !== this.loadId) return;
    if (gltf && this.props.onGltfLoaded) this.props.onGltfLoaded(gltf);
    this.setAvatar(gltf.scene);
  }

  applyMaps(oldProps, newProps) {
    return Promise.all(
      ALL_MAPS.map(mapName => {
        const applyMap = this.applyMapToPreview.bind(this, mapName);
        if (oldProps[mapName] != newProps[mapName]) {
          if (newProps[mapName] instanceof File) {
            return createImageBitmap(newProps[mapName]).then(applyMap);
          } else if (newProps[mapName]) {
            return createImageBitmapFromURL(newProps[mapName]).then(applyMap);
          } else {
            return this.revertMap(mapName);
          }
        }
      })
    );
  }

  loadPreviewAvatar = async avatarGltfUrl => {
    let gltf;
    try {
      gltf = await loadGLTF(avatarGltfUrl, "model/gltf", null, ensureAvatarMaterial);
    } catch (e) {
      console.error("Failed to load avatar preview", e);
      this.setState({ loading: false, error: true });
      return;
    }

    // TODO Check for "Bot_Skinned" here is a hack for legacy avatars which only has a name one of the MOZ_alt_material nodes
    this.previewMesh = findNode(
      gltf.scene,
      n => (n.isMesh && n.material && n.material.name === MAT_NAME) || n.name === "Bot_Skinned"
    );

    if (!this.previewMesh) {
      console.error("Failed to find avatar preview mesh");
      this.setState({ loading: false, error: true });
      return;
    }

    const idleAnimation = gltf.animations && gltf.animations.find(({ name }) => name === "idle_eyes");
    if (idleAnimation) {
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      const action = this.mixer.clipAction(idleAnimation);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity).play();
      this.idleAnimationAction = action;
    }

    gltf.scene.traverse(node => {
      // Camera in preview is pretty tight, and skinned meshes tend to have poor bounding boxes
      if (node.isSkinnedMesh) {
        node.frustumCulled = false;
      }

      // We delete onUpdate here to opt out of the auto texture cleanup after GPU upload.
      if (node.material) {
        const removeOnUpdate = p => node.material[p] && delete node.material[p].onUpdate;
        TEXTURE_PROPS["base_map"].forEach(removeOnUpdate);
        TEXTURE_PROPS["emissive_map"].forEach(removeOnUpdate);
        TEXTURE_PROPS["normal_map"].forEach(removeOnUpdate);
        TEXTURE_PROPS["orm_map"].forEach(removeOnUpdate);
      }
    });

    const { material } = this.previewMesh;
    if (material) {
      const getImage = p => material[p] && material[p].image;
      this.originalMaps = {
        base_map: TEXTURE_PROPS["base_map"].map(getImage),
        emissive_map: TEXTURE_PROPS["emissive_map"].map(getImage),
        normal_map: TEXTURE_PROPS["normal_map"].map(getImage),
        orm_map: TEXTURE_PROPS["orm_map"].map(getImage)
      };

      const dependencies = [
        this.applyMaps({}, this.props) // Apply initial maps
      ];

      // Low and medium quality materials don't use environment maps
      if (window.APP.store.materialQualitySetting === "high") {
        dependencies.push(
          // TODO apply environment map to secondary materials as well
          createDefaultEnvironmentMap().then(t => {
            this.previewMesh.material.envMap = t;
            this.previewMesh.material.needsUpdate = true;
          })
        );
      }

      await Promise.all(dependencies);
    } else {
      this.originalMaps = {};
    }

    return gltf;
  };

  applyMapToPreview = (name, image) => {
    if (this.imageBitmaps[name]) {
      disposeImageBitmap(this.imageBitmaps[name]);
    }
    this.imageBitmaps[name] = image;
    TEXTURE_PROPS[name].forEach(prop => {
      const texture = this.previewMesh.material[prop];

      // Low quality materials are missing normal maps
      if (prop === "normalMap" && window.APP.store.materialQualitySetting === "low") {
        return;
      }

      // Medium Quality materials are missing metalness and roughness maps
      if ((prop === "roughnessMap" || prop === "metalnessMap") && window.APP.store.materialQualitySetting !== "high") {
        return;
      }

      texture.image = image;
      texture.needsUpdate = true;
    });
  };

  revertMap = name => {
    if (this.imageBitmaps[name]) {
      disposeImageBitmap(this.imageBitmaps[name]);
    }
    delete this.imageBitmaps[name];
    this.originalMaps[name].forEach((bm, i) => {
      const texture = this.previewMesh.material[TEXTURE_PROPS[name][i]];

      if (texture) {
        texture.image = bm;
        texture.needsUpdate = true;
      }
    });
  };

  snapshot = () => {
    return new Promise(resolve => {
      if (this.idleAnimationAction) this.idleAnimationAction.stop();
      this.snapshotCamera.position.copy(this.camera.position);
      this.snapshotCamera.rotation.copy(this.camera.rotation);
      this.snapshotRenderer.render(this.scene, this.snapshotCamera);
      this.snapshotCanvas.toBlob(blob => {
        if (this.idleAnimationAction) this.idleAnimationAction.play();
        resolve(blob);
      });
    });
  };

  render() {
    return (
      <div className={classNames(styles.preview, this.props.className)}>
        {!this.props.avatarGltfUrl ||
          (this.state.loading &&
            !this.state.error && (
              <div className="loader">
                <div className="loader-center" />
              </div>
            ))}
        {this.props.avatarGltfUrl &&
          (this.state.error && !this.state.loading) && (
            <div className="error">
              <img
                src="../assets/images/warning_icon.png"
                srcSet="../assets/images/warning_icon@2x.png 2x"
                className="error-icon"
              />
              <FormattedMessage
                id="avatar-preview.loading-failed"
                defaultMessage="Loading failed{linebreak}Please choose another avatar"
                values={{ linebreak: <br /> }}
              />
            </div>
          )}
        <canvas ref={c => (this.canvas = c)} />
      </div>
    );
  }
}

export default injectIntl(AvatarPreview, { forwardRef: true });
