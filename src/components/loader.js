import { computeObjectAABB, getBox, getScaleCoefficient } from "../utils/auto-box-collider";
import loadingObjectSrc from "../assets/models/LoadingObject_Atom.glb";
import { SOUND_MEDIA_LOADING, SOUND_MEDIA_LOADED } from "../systems/sound-effects-system";
import { loadModel } from "./gltf-model-plus";
import { cloneObject3D, setMatrixWorld } from "../utils/three-utils";
import { waitForDOMContentLoaded } from "../utils/async-utils";

import { SHAPE } from "three-ammo/constants";

let loadingObjectEnvMap;
let loadingObject;

waitForDOMContentLoaded().then(() => {
  loadModel(loadingObjectSrc).then(gltf => {
    loadingObject = gltf;
  });
});

AFRAME.registerComponent("loader", {
  schema: {
    loadedEvent: { type: "string", default: "" },
    errorEvent: { type: "string", default: "error" },
    playSoundEffect: { type: "boolean", default: true }
  },

  init() {
    this.onLoad = this.onLoad.bind(this);
    this.onError = this.onError.bind(this);

    this.loaderMixer = null;

    this.showLoader();
  },

  update(oldData) {
    if (this.data.loadedEvent !== oldData.loadedEvent) {
      if (oldData.loadedEvent) {
        this.el.removeEventListener(oldData.loadedEvent, this.onLoad);
      }

      if (this.data.loadedEvent) {
        this.el.addEventListener(this.data.loadedEvent, this.onLoad);
      }
    }

    if (this.data.errorEvent !== oldData.errorEvent) {
      if (oldData.errorEvent) {
        this.el.removeEventListener(oldData.errorEvent, this.onLoad);
      }

      if (this.data.errorEvent) {
        this.el.addEventListener(this.data.errorEvent, this.onLoad);
      }
    }
  },

  tick(t, dt) {
    if (this.loaderMixer) {
      this.loaderMixer.update(dt / 1000);
    }
  },

  onLoad() {
    this.clearLoadingTimeout();

    if (this.el.sceneEl.is("entered") && this.data.playSoundEffect) {
      this.loadedSoundEffect = this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playPositionalSoundFollowing(
        SOUND_MEDIA_LOADED,
        this.el.object3D,
        false
      );
    }
  },

  onError() {
    this.el.setAttribute("media-image", { src: "error" });
    this.clearLoadingTimeout();
  },

  showLoader() {
    if (this.el.object3DMap.mesh) {
      this.clearLoadingTimeout();
      return;
    }

    const useFancyLoader = !!loadingObject;

    const mesh = useFancyLoader
      ? cloneObject3D(loadingObject.scene)
      : new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

    this.el.setObject3D("mesh", mesh);

    this.updateScale(true, false);

    if (useFancyLoader) {
      const environmentMapComponent = this.el.sceneEl.components["environment-map"];

      if (environmentMapComponent) {
        const currentEnivronmentMap = environmentMapComponent.environmentMap;
        if (loadingObjectEnvMap !== currentEnivronmentMap) {
          environmentMapComponent.applyEnvironmentMap(mesh);
          loadingObjectEnvMap = currentEnivronmentMap;
        }
      }

      this.loaderMixer = new THREE.AnimationMixer(mesh);

      this.loadingClip = this.loaderMixer.clipAction(mesh.animations[0]);
      this.loadingScaleClip = this.loaderMixer.clipAction(
        new THREE.AnimationClip(null, 1000, [
          new THREE.VectorKeyframeTrack(".scale", [0, 0.2], [0, 0, 0, mesh.scale.x, mesh.scale.y, mesh.scale.z])
        ])
      );
      setTimeout(() => {
        if (!this.loaderMixer) return; // Animation/loader was stopped early
        this.el.setAttribute("shape-helper__loader", { type: SHAPE.BOX });
      }, 200);

      this.loadingClip.play();
      this.loadingScaleClip.play();
    }

    if (this.el.sceneEl.is("entered") && this.data.playSoundEffect) {
      this.loadingSoundEffect = this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playPositionalSoundFollowing(
        SOUND_MEDIA_LOADING,
        this.el.object3D,
        true
      );
    }

    delete this.showLoaderTimeout;
  },

  updateScale: (function() {
    const center = new THREE.Vector3();
    const originalMeshMatrix = new THREE.Matrix4();
    const desiredObjectMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const box = new THREE.Box3();

    return function(fitToBox, moveTheParentNotTheMesh) {
      this.el.object3D.updateMatrices();
      const mesh = this.el.getObject3D("mesh");
      mesh.updateMatrices();
      if (moveTheParentNotTheMesh) {
        if (fitToBox) {
          console.warn(
            "Unexpected combination of inputs. Can fit the mesh to a box OR move the parent to the mesh, but did not expect to do both.",
            this.el
          );
        }
        // Keep the mesh exactly where it is, but move the parent transform such that it aligns with the center of the mesh's bounding box.
        originalMeshMatrix.copy(mesh.matrixWorld);
        computeObjectAABB(mesh, box);
        center.addVectors(box.min, box.max).multiplyScalar(0.5);
        this.el.object3D.matrixWorld.decompose(position, quaternion, scale);
        desiredObjectMatrix.compose(
          center,
          quaternion,
          scale
        );
        setMatrixWorld(this.el.object3D, desiredObjectMatrix);
        mesh.updateMatrices();
        setMatrixWorld(mesh, originalMeshMatrix);
      } else {
        // Move the mesh such that the center of its bounding box is in the same position as the parent matrix position
        const box = getBox(this.el, mesh);
        const scaleCoefficient = fitToBox ? getScaleCoefficient(0.5, box) : 1;
        const { min, max } = box;
        center.addVectors(min, max).multiplyScalar(0.5 * scaleCoefficient);
        mesh.scale.multiplyScalar(scaleCoefficient);
        mesh.position.sub(center);
        mesh.matrixNeedsUpdate = true;
      }
    };
  })(),

  removeShape(id) {
    if (this.el.getAttribute("shape-helper__" + id)) {
      this.el.removeAttribute("shape-helper__" + id);
    }
  },

  clearLoadingTimeout() {
    clearTimeout(this.showLoaderTimeout);

    if (this.loadingSoundEffect) {
      this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.stopPositionalAudio(this.loadingSoundEffect);
      this.loadingSoundEffect = null;
    }

    if (this.loaderMixer) {
      this.loadingClip.stop();
      this.loadingScaleClip.stop();
      delete this.loaderMixer;
      delete this.loadingScaleClip;
      delete this.loadingClip;
    }

    delete this.showLoaderTimeout;
    this.removeShape("loader");
  }
});
