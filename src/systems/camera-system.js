import { waitForDOMContentLoaded } from "../utils/async-utils";
import { childMatch, setMatrixWorld, calculateViewingDistance } from "../utils/three-utils";
import { paths } from "./userinput/paths";
import { getBox } from "../utils/auto-box-collider";
import qsTruthy from "../utils/qs_truthy";
import { isTagged } from "../components/tags";
import { qsGet } from "../utils/qs_truthy";
const customFOV = qsGet("fov");
const enableThirdPersonMode = qsTruthy("thirdPerson");

function getInspectableInHierarchy(el) {
  let inspectable = el;
  while (inspectable) {
    if (isTagged(inspectable, "inspectable")) {
      return inspectable.object3D;
    }
    inspectable = inspectable.parentNode;
  }
  console.warn("could not find inspectable in hierarchy");
  return el.object3D;
}

function pivotFor(el) {
  const selector =
    el.components["inspect-pivot-child-selector"] && el.components["inspect-pivot-child-selector"].data.selector;
  if (!selector) {
    return el.object3D;
  }

  const child = el.querySelector(selector);
  if (!child) {
    console.error(`Failed to find pivot for selector: ${selector}`, el);
    return el.object3D;
  }
  return child.object3D;
}

export function getInspectableAndPivot(el) {
  const inspectable = getInspectableInHierarchy(el);
  const pivot = pivotFor(inspectable.el);
  return { inspectable, pivot };
}

const decompose = (function() {
  const scale = new THREE.Vector3();
  return function decompose(m, p, q) {
    m.decompose(p, q, scale); //ignore scale, like we're dealing with a motor
  };
})();

const IDENTITY = new THREE.Matrix4().identity();
const orbit = (function() {
  const owq = new THREE.Quaternion();
  const owp = new THREE.Vector3();
  const cwq = new THREE.Quaternion();
  const cwp = new THREE.Vector3();
  const rwq = new THREE.Quaternion();
  const UP = new THREE.Vector3();
  const RIGHT = new THREE.Vector3();
  const target = new THREE.Object3D();
  const dhQ = new THREE.Quaternion();
  const dvQ = new THREE.Quaternion();
  return function orbit(pivot, rig, camera, dh, dv, dz, dt, panY) {
    if (!target.parent) {
      // add dummy object to the scene, if this is the first time we call this function
      AFRAME.scenes[0].object3D.add(target);
      target.applyMatrix4(IDENTITY); // make sure target gets updated at least once for our matrix optimizations
    }
    pivot.updateMatrices();
    decompose(pivot.matrixWorld, owp, owq);
    decompose(camera.matrixWorld, cwp, cwq);
    rig.getWorldQuaternion(rwq);

    dhQ.setFromAxisAngle(UP.set(0, 1, 0).applyQuaternion(owq), 0.1 * dh * dt);
    target.quaternion.copy(cwq).premultiply(dhQ);
    const dPos = new THREE.Vector3().subVectors(cwp, owp);
    const zoom = 1 - dz * dt;
    const newLength = dPos.length() * zoom;
    // TODO: These limits should be calculated based on the calculated view distance.
    if (newLength > 0.1 && newLength < 100) {
      dPos.multiplyScalar(zoom);
    }

    dvQ.setFromAxisAngle(RIGHT.set(1, 0, 0).applyQuaternion(target.quaternion), 0.1 * dv * dt);
    target.quaternion.premultiply(dvQ);
    target.position.addVectors(owp, dPos.applyQuaternion(dhQ).applyQuaternion(dvQ)).add(
      UP.set(0, 1, 0)
        .multiplyScalar(panY * newLength)
        .applyQuaternion(target.quaternion)
    );
    target.matrixNeedsUpdate = true;
    target.updateMatrices();
    childMatch(rig, camera, target.matrixWorld);
  };
})();

const moveRigSoCameraLooksAtPivot = (function() {
  const owq = new THREE.Quaternion();
  const owp = new THREE.Vector3();
  const cwq = new THREE.Quaternion();
  const cwp = new THREE.Vector3();
  const oForw = new THREE.Vector3();
  const center = new THREE.Vector3();
  const defaultBoxMax = new THREE.Vector3(0.3, 0.3, 0.3);
  const target = new THREE.Object3D();
  return function moveRigSoCameraLooksAtPivot(rig, camera, inspectable, pivot, distanceMod) {
    if (!target.parent) {
      // add dummy object to the scene, if this is the first time we call this function
      AFRAME.scenes[0].object3D.add(target);
      target.applyMatrix4(IDENTITY); // make sure target gets updated at least once for our matrix optimizations
    }

    pivot.updateMatrices();
    decompose(pivot.matrixWorld, owp, owq);
    decompose(camera.matrixWorld, cwp, cwq);
    rig.getWorldQuaternion(cwq);

    const box = getBox(inspectable.el, inspectable.el.getObject3D("mesh") || inspectable, true);
    if (box.min.x === Infinity) {
      // fix edgecase where inspectable object has no mesh / dimensions
      box.min.subVectors(owp, defaultBoxMax);
      box.max.addVectors(owp, defaultBoxMax);
    }
    box.getCenter(center);
    const vrMode = inspectable.el.sceneEl.is("vr-mode");
    const dist =
      calculateViewingDistance(
        inspectable.el.sceneEl.camera.fov,
        inspectable.el.sceneEl.camera.aspect,
        box,
        center,
        vrMode
      ) * distanceMod;
    target.position.addVectors(
      owp,
      oForw
        .set(0, 0, 1) //TODO: Suspicious that this is called oForw but (0,0,1) is backwards
        .multiplyScalar(dist)
        .applyQuaternion(owq)
    );
    target.quaternion.copy(owq);
    target.matrixNeedsUpdate = true;
    target.updateMatrices();
    childMatch(rig, camera, target.matrixWorld);
  };
})();

export const CAMERA_MODE_FIRST_PERSON = 0;
export const CAMERA_MODE_THIRD_PERSON_NEAR = 1;
export const CAMERA_MODE_THIRD_PERSON_FAR = 2;
export const CAMERA_MODE_INSPECT = 3;
export const CAMERA_MODE_SCENE_PREVIEW = 4;

const NEXT_MODES = {
  [CAMERA_MODE_FIRST_PERSON]: CAMERA_MODE_THIRD_PERSON_NEAR,
  [CAMERA_MODE_THIRD_PERSON_NEAR]: CAMERA_MODE_THIRD_PERSON_FAR,
  [CAMERA_MODE_THIRD_PERSON_FAR]: CAMERA_MODE_FIRST_PERSON
};

const CAMERA_LAYER_INSPECT = 4;
// This layer is never actually rendered by a camera but lets the batching system know it should be rendered if inspecting
export const CAMERA_LAYER_BATCH_INSPECT = 5;

const ensureLightsAreSeenByCamera = function(o) {
  if (o.isLight) {
    o.layers.enable(CAMERA_LAYER_INSPECT);
  }
};
const enableInspectLayer = function(o) {
  const batchManagerSystem = AFRAME.scenes[0].systems["hubs-systems"].batchManagerSystem;
  const batch = batchManagerSystem.batchingEnabled && batchManagerSystem.batchManager.batchForMesh.get(o);
  if (batch) {
    batch.layers.enable(CAMERA_LAYER_INSPECT);
    o.layers.enable(CAMERA_LAYER_BATCH_INSPECT);
  } else {
    o.layers.enable(CAMERA_LAYER_INSPECT);
  }
};
const disableInspectLayer = function(o) {
  const batchManagerSystem = AFRAME.scenes[0].systems["hubs-systems"].batchManagerSystem;
  const batch = batchManagerSystem.batchingEnabled && batchManagerSystem.batchManager.batchForMesh.get(o);
  if (batch) {
    batch.layers.disable(CAMERA_LAYER_INSPECT);
    o.layers.disable(CAMERA_LAYER_BATCH_INSPECT);
  } else {
    o.layers.disable(CAMERA_LAYER_INSPECT);
  }
};

function getAudio(o) {
  let audio;
  o.traverse(c => {
    if (!audio && c.type === "Audio") {
      audio = c;
    }
  });
  return audio;
}

const FALLOFF = 0.9;
export class CameraSystem {
  constructor(scene) {
    this.lightsEnabled = localStorage.getItem("show-background-while-inspecting") === "true";
    this.verticalDelta = 0;
    this.horizontalDelta = 0;
    this.inspectZoom = 0;
    this.mode = CAMERA_MODE_SCENE_PREVIEW;
    this.snapshot = { audioTransform: new THREE.Matrix4(), matrixWorld: new THREE.Matrix4() };
    this.audioSourceTargetTransform = new THREE.Matrix4();
    waitForDOMContentLoaded().then(() => {
      this.avatarPOV = document.getElementById("avatar-pov-node");
      this.avatarRig = document.getElementById("avatar-rig");
      this.viewingCamera = document.getElementById("viewing-camera");
      this.viewingRig = document.getElementById("viewing-rig");

      const bg = new THREE.Mesh(
        new THREE.BoxGeometry(100, 100, 100),
        new THREE.MeshBasicMaterial({ color: 0x020202, side: THREE.BackSide })
      );
      bg.layers.set(CAMERA_LAYER_INSPECT);
      this.viewingRig.object3D.add(bg);
      if (customFOV) {
        if (this.viewingCamera.components.camera) {
          this.viewingCamera.setAttribute("camera", { fov: customFOV });
        } else {
          scene.addEventListener("camera-set-active", () => {
            this.viewingCamera.setAttribute("camera", { fov: customFOV });
          });
        }
      }
      // TODO this bookkeeping also exists elsewhere in the code, it would be nice to put these references in one place
      const playerModelEl = document.querySelector("#avatar-rig .model");
      playerModelEl.addEventListener("model-loading", () => (this.playerHead = null));
      playerModelEl.addEventListener("model-loaded", this.updatePlayerHead.bind(this));
      this.updatePlayerHead();
    });
  }

  updatePlayerHead() {
    this.playerHead = document.getElementById("avatar-head");
  }

  nextMode() {
    if (this.mode === CAMERA_MODE_INSPECT) {
      this.uninspect();
      return;
    }

    if (!enableThirdPersonMode) return;
    if (this.mode === CAMERA_MODE_SCENE_PREVIEW) return;

    this.mode = NEXT_MODES[this.mode] || 0;
  }

  inspect(el, distanceMod, fireChangeEvent = true) {
    const { inspectable, pivot } = getInspectableAndPivot(el);

    this.verticalDelta = 0;
    this.horizontalDelta = 0;
    this.inspectZoom = 0;
    if (this.mode === CAMERA_MODE_INSPECT) {
      return;
    }
    const scene = AFRAME.scenes[0];
    scene.object3D.traverse(ensureLightsAreSeenByCamera);
    scene.classList.add("hand-cursor");
    scene.classList.remove("no-cursor");
    this.snapshot.mode = this.mode;
    this.mode = CAMERA_MODE_INSPECT;
    this.inspectable = inspectable;
    this.pivot = pivot;

    const vrMode = scene.is("vr-mode");
    const camera = vrMode ? scene.renderer.xr.getCamera(scene.camera) : scene.camera;
    this.snapshot.mask = camera.layers.mask;
    if (vrMode) {
      this.snapshot.mask0 = camera.cameras[0].layers.mask;
      this.snapshot.mask1 = camera.cameras[1].layers.mask;
    }
    if (!this.lightsEnabled) {
      this.hideEverythingButThisObject(inspectable);
    }

    this.viewingCamera.object3DMap.camera.updateMatrices();
    this.snapshot.matrixWorld.copy(this.viewingRig.object3D.matrixWorld);

    this.snapshot.audio = !(inspectable.el && isTagged(inspectable.el, "preventAudioBoost")) && getAudio(inspectable);
    if (this.snapshot.audio) {
      this.snapshot.audio.updateMatrices();
      this.snapshot.audioTransform.copy(this.snapshot.audio.matrixWorld);
      scene.audioListener.updateMatrices();
      this.audioSourceTargetTransform.makeTranslation(0, 0, -0.25).premultiply(scene.audioListener.matrixWorld);
      setMatrixWorld(this.snapshot.audio, this.audioSourceTargetTransform);
    }

    this.ensureListenerIsParentedCorrectly(scene);

    moveRigSoCameraLooksAtPivot(
      this.viewingRig.object3D,
      this.viewingCamera.object3DMap.camera,
      this.inspectable,
      this.pivot,
      distanceMod || 1
    );

    if (fireChangeEvent) {
      scene.emit("inspect-target-changed");
    }
  }

  uninspect(fireChangeEvent = true) {
    if (this.mode !== CAMERA_MODE_INSPECT) return;
    const scene = AFRAME.scenes[0];
    if (scene.is("entered")) {
      scene.classList.remove("hand-cursor");
      scene.classList.add("no-cursor");
    }
    this.showEverythingAsNormal();
    this.inspectable = null;
    this.pivot = null;
    if (this.snapshot.audio) {
      setMatrixWorld(this.snapshot.audio, this.snapshot.audioTransform);
      this.snapshot.audio = null;
    }

    this.mode = this.snapshot.mode;
    if (this.snapshot.mode === CAMERA_MODE_SCENE_PREVIEW) {
      setMatrixWorld(this.viewingRig.object3D, this.snapshot.matrixWorld);
    }
    this.snapshot.mode = null;
    this.tick(AFRAME.scenes[0]);

    if (fireChangeEvent) {
      scene.emit("inspect-target-changed");
    }
  }

  toggleLights() {
    this.lightsEnabled = !this.lightsEnabled;
    localStorage.setItem("show-background-while-inspecting", this.lightsEnabled.toString());

    if (this.mode === CAMERA_MODE_INSPECT && this.inspectable) {
      if (this.lightsEnabled) {
        this.showEverythingAsNormal();
      } else {
        this.hideEverythingButThisObject(this.inspectable);
      }
    }

    AFRAME.scenes[0].emit("inspect-lights-changed");
  }

  ensureListenerIsParentedCorrectly(scene) {
    if (scene.audioListener && this.avatarPOV) {
      if (this.mode === CAMERA_MODE_INSPECT && scene.audioListener.parent !== this.avatarPOV.object3D) {
        this.avatarPOV.object3D.add(scene.audioListener);
      } else if (
        (this.mode === CAMERA_MODE_FIRST_PERSON ||
          this.mode === CAMERA_MODE_THIRD_PERSON_NEAR ||
          this.mode === CAMERA_MODE_THIRD_PERSON_FAR) &&
        scene.audioListener.parent !== this.viewingCamera.object3DMap.camera
      ) {
        this.viewingCamera.object3DMap.camera.add(scene.audioListener);
      }
    }
  }

  hideEverythingButThisObject(o) {
    this.notHiddenObject = o;
    o.traverse(enableInspectLayer);

    const scene = AFRAME.scenes[0];
    const vrMode = scene.is("vr-mode");
    const camera = vrMode ? scene.renderer.xr.getCamera(scene.camera) : scene.camera;
    camera.layers.set(CAMERA_LAYER_INSPECT);
    if (vrMode) {
      camera.cameras[0].layers.set(CAMERA_LAYER_INSPECT);
      camera.cameras[1].layers.set(CAMERA_LAYER_INSPECT);
    }
  }

  showEverythingAsNormal() {
    if (this.notHiddenObject) {
      this.notHiddenObject.traverse(disableInspectLayer);
      this.notHiddenObject = null;
    }
    const scene = AFRAME.scenes[0];
    const vrMode = scene.is("vr-mode");
    const camera = vrMode ? scene.renderer.xr.getCamera(scene.camera) : scene.camera;
    camera.layers.mask = this.snapshot.mask;
    if (vrMode) {
      camera.cameras[0].layers.mask = this.snapshot.mask0;
      camera.cameras[1].layers.mask = this.snapshot.mask1;
    }
  }

  tick = (function() {
    const translation = new THREE.Matrix4();
    let uiRoot;
    return function tick(scene, dt) {
      this.viewingCamera.object3DMap.camera.matrixNeedsUpdate = true;
      this.viewingCamera.object3DMap.camera.updateMatrix();
      this.viewingCamera.object3DMap.camera.updateMatrixWorld();

      const entered = scene.is("entered");
      uiRoot = uiRoot || document.getElementById("ui-root");
      const isGhost = !entered && uiRoot && uiRoot.firstChild && uiRoot.firstChild.classList.contains("isGhost");
      if (isGhost && this.mode !== CAMERA_MODE_FIRST_PERSON && this.mode !== CAMERA_MODE_INSPECT) {
        this.mode = CAMERA_MODE_FIRST_PERSON;
        const position = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        this.viewingRig.object3D.updateMatrices();
        this.viewingRig.object3D.matrixWorld.decompose(position, quat, scale);
        position.setFromMatrixPosition(this.viewingCamera.object3DMap.camera.matrixWorld);
        position.y = position.y - 1.6;
        setMatrixWorld(
          this.avatarRig.object3D,
          new THREE.Matrix4().compose(
            position,
            quat,
            scale
          )
        );
        scene.systems["hubs-systems"].characterController.fly = true;
        this.avatarPOV.object3D.updateMatrices();
        setMatrixWorld(this.avatarPOV.object3D, this.viewingCamera.object3DMap.camera.matrixWorld);
      }
      if (!this.enteredScene && entered) {
        this.enteredScene = true;
        this.mode = CAMERA_MODE_FIRST_PERSON;
      }
      this.avatarPOVRotator = this.avatarPOVRotator || this.avatarPOV.components["pitch-yaw-rotator"];
      this.viewingCameraRotator = this.viewingCameraRotator || this.viewingCamera.components["pitch-yaw-rotator"];
      this.avatarPOVRotator.on = true;
      this.viewingCameraRotator.on = true;

      this.userinput = this.userinput || scene.systems.userinput;
      this.interaction = this.interaction || scene.systems.interaction;

      if (this.userinput.get(paths.actions.startInspecting) && this.mode !== CAMERA_MODE_INSPECT) {
        const hoverEl = this.interaction.state.rightRemote.hovered || this.interaction.state.leftRemote.hovered;

        if (hoverEl) {
          this.inspect(hoverEl, 1.5);
        }
      } else if (this.mode === CAMERA_MODE_INSPECT && this.userinput.get(paths.actions.stopInspecting)) {
        scene.emit("uninspect");
        this.uninspect();
      }

      if (this.userinput.get(paths.actions.nextCameraMode)) {
        this.nextMode();
      }

      const headShouldBeVisible = this.mode !== CAMERA_MODE_FIRST_PERSON;
      if (this.playerHead && headShouldBeVisible !== this.playerHead.object3D.visible) {
        this.playerHead.object3D.visible = headShouldBeVisible;

        // Skip a frame so we don't see our own avatar, etc.
        return;
      }

      this.ensureListenerIsParentedCorrectly(scene);

      if (this.mode === CAMERA_MODE_FIRST_PERSON) {
        this.viewingCameraRotator.on = false;
        this.avatarRig.object3D.updateMatrices();
        setMatrixWorld(this.viewingRig.object3D, this.avatarRig.object3D.matrixWorld);
        if (scene.is("vr-mode")) {
          this.viewingCamera.object3DMap.camera.updateMatrices();
          setMatrixWorld(this.avatarPOV.object3D, this.viewingCamera.object3DMap.camera.matrixWorld);
        } else {
          this.avatarPOV.object3D.updateMatrices();
          setMatrixWorld(this.viewingCamera.object3DMap.camera, this.avatarPOV.object3D.matrixWorld);
        }
      } else if (this.mode === CAMERA_MODE_THIRD_PERSON_NEAR || this.mode === CAMERA_MODE_THIRD_PERSON_FAR) {
        if (this.mode === CAMERA_MODE_THIRD_PERSON_NEAR) {
          translation.makeTranslation(0, 1, 3);
        } else {
          translation.makeTranslation(0, 2, 8);
        }
        this.avatarRig.object3D.updateMatrices();
        this.viewingRig.object3D.matrixWorld.copy(this.avatarRig.object3D.matrixWorld).multiply(translation);
        setMatrixWorld(this.viewingRig.object3D, this.viewingRig.object3D.matrixWorld);
        this.avatarPOV.object3D.quaternion.copy(this.viewingCamera.object3DMap.camera.quaternion);
        this.avatarPOV.object3D.matrixNeedsUpdate = true;
      } else if (this.mode === CAMERA_MODE_INSPECT) {
        this.avatarPOVRotator.on = false;
        this.viewingCameraRotator.on = false;
        const cameraDelta = this.userinput.get(
          scene.is("entered") ? paths.actions.cameraDelta : paths.actions.lobbyCameraDelta
        );

        if (cameraDelta) {
          // TODO: Move device specific tinkering to action sets
          const horizontalDelta = (AFRAME.utils.device.isMobile() ? -0.6 : 1) * cameraDelta[0] || 0;
          const verticalDelta = (AFRAME.utils.device.isMobile() ? -1.2 : 1) * cameraDelta[1] || 0;
          this.horizontalDelta = (this.horizontalDelta + horizontalDelta) / 2;
          this.verticalDelta = (this.verticalDelta + verticalDelta) / 2;
        } else if (Math.abs(this.verticalDelta) > 0.0001 || Math.abs(this.horizontalDelta) > 0.0001) {
          this.verticalDelta = FALLOFF * this.verticalDelta;
          this.horizontalDelta = FALLOFF * this.horizontalDelta;
        }

        const inspectZoom = this.userinput.get(paths.actions.inspectZoom) * 0.001;
        if (inspectZoom) {
          this.inspectZoom = inspectZoom + (5 * this.inspectZoom) / 6;
        } else if (Math.abs(this.inspectZoom) > 0.0001) {
          this.inspectZoom = FALLOFF * this.inspectZoom;
        }
        const panY = this.userinput.get(paths.actions.inspectPanY) || 0;
        if (this.userinput.get(paths.actions.resetInspectView)) {
          moveRigSoCameraLooksAtPivot(
            this.viewingRig.object3D,
            this.viewingCamera.object3DMap.camera,
            this.inspectable,
            this.pivot,
            1
          );
        }
        if (this.snapshot.audio) {
          setMatrixWorld(this.snapshot.audio, this.audioSourceTargetTransform);
        }

        if (
          Math.abs(this.verticalDelta) > 0.001 ||
          Math.abs(this.horizontalDelta) > 0.001 ||
          Math.abs(this.inspectZoom) > 0.001 ||
          Math.abs(panY) > 0.0001
        ) {
          orbit(
            this.pivot,
            this.viewingRig.object3D,
            this.viewingCamera.object3DMap.camera,
            this.horizontalDelta,
            this.verticalDelta,
            this.inspectZoom,
            dt,
            panY
          );
        }
      }
    };
  })();
}
