import { paths } from "../systems/userinput/paths";
import { waitForDOMContentLoaded } from "../utils/async-utils";
const COLLISION_LAYERS = require("../constants").COLLISION_LAYERS;
const AMMO_BODY_ATTRIBUTES = { type: "kinematic", collisionFilterMask: COLLISION_LAYERS.HANDS };

export const TRANSFORM_MODE = {
  AXIS: "axis",
  PUPPET: "puppet",
  CURSOR: "cursor",
  ALIGN: "align",
  SCALE: "scale"
};

const STEP_LENGTH = Math.PI / 10;
const CAMERA_WORLD_QUATERNION = new THREE.Quaternion();
const CAMERA_WORLD_POSITION = new THREE.Vector3();
const TARGET_WORLD_QUATERNION = new THREE.Quaternion();
const v = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

const eps = 0.001;
function qAlmostEquals(a, b) {
  return (
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps && Math.abs(a.w - b.w) < eps
  );
}

AFRAME.registerComponent("transform-button", {
  schema: {
    mode: {
      type: "string",
      oneof: Object.values(TRANSFORM_MODE),
      default: TRANSFORM_MODE.CURSOR
    },
    axis: { type: "vec3", default: null }
  },
  init() {
    NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
      this.targetEl = networkedEl;
    });
    let leftHand, rightHand;

    waitForDOMContentLoaded().then(() => {
      leftHand = document.getElementById("player-left-controller");
      rightHand = document.getElementById("player-right-controller");
    });
    this.onGrabStart = e => {
      if (!leftHand || !rightHand) return;

      if (!this.targetEl) {
        return;
      }
      if (!NAF.utils.isMine(this.targetEl) && !NAF.utils.takeOwnership(this.targetEl)) {
        return;
      }
      if (this.targetEl.body) {
        this.targetEl.setAttribute("body-helper", AMMO_BODY_ATTRIBUTES);
      }
      this.transformSystem = this.transformSystem || AFRAME.scenes[0].systems["transform-selected-object"];
      this.transformSystem.startTransform(
        this.targetEl.object3D,
        e.object3D.el.id === "right-cursor"
          ? rightHand.object3D
          : e.object3D.el.id === "left-cursor"
            ? leftHand.object3D
            : e.object3D,
        this.data
      );
    };
    this.onGrabEnd = () => {
      this.transformSystem = this.transformSystem || AFRAME.scenes[0].systems["transform-selected-object"];
      this.transformSystem.stopTransform();
    };
  },
  play() {
    this.el.object3D.addEventListener("interact", this.onGrabStart);
    this.el.object3D.addEventListener("holdable-button-down", this.onGrabStart);
    this.el.object3D.addEventListener("holdable-button-up", this.onGrabEnd);
  },
  pause() {
    this.el.object3D.removeEventListener("interact", this.onGrabStart);
    this.el.object3D.removeEventListener("holdable-button-down", this.onGrabStart);
    this.el.object3D.removeEventListener("holdable-button-up", this.onGrabEnd);
  }
});

AFRAME.registerSystem("transform-selected-object", {
  init() {
    this.target = null;
    this.mode = null;
    this.transforming = false;
    this.axis = new THREE.Vector3();
    this.store = window.APP.store;
    this.startQ = new THREE.Quaternion();

    this.dxStore = 0;
    this.dxApplied = 0;
    this.dyAll = 0;
    this.dyStore = 0;
    this.dyApplied = 0;
    this.raycasters = {};

    this.puppet = {
      initialControllerOrientation: new THREE.Quaternion(),
      initialControllerOrientation_inverse: new THREE.Quaternion(),
      initialObjectOrientation: new THREE.Quaternion(),
      currentControllerOrientation: new THREE.Quaternion(),
      controllerOrientationDelta: new THREE.Quaternion()
    };

    this.planarInfo = {
      plane: new THREE.Mesh(
        new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
        new THREE.MeshBasicMaterial({
          visible: false,
          wireframe: true,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.3
        })
      ),
      normal: new THREE.Vector3(),
      intersections: [],
      previousPointOnPlane: new THREE.Vector3(),
      currentPointOnPlane: new THREE.Vector3(),
      deltaOnPlane: new THREE.Vector3(),
      finalProjectedVec: new THREE.Vector3()
    };
    this.el.object3D.add(this.planarInfo.plane);
  },

  stopTransform: (function() {
    const q = new THREE.Quaternion();
    const PI_AROUND_Y = new THREE.Quaternion(0, 1, 0, 0);
    const pInv = new THREE.Quaternion();
    return function stopTransform() {
      this.transforming = false;
      if (this.mode === TRANSFORM_MODE.CURSOR) {
        this.target.getWorldQuaternion(q);
        if (qAlmostEquals(q, this.startQ)) {
          q.multiply(PI_AROUND_Y);
          this.target.parent.getWorldQuaternion(pInv);
          pInv.invert();
          this.target.quaternion.copy(pInv).multiply(q);
          this.target.matrixNeedsUpdate = true;
        }
      }
    };
  })(),

  startPlaneCasting() {
    const { plane, intersections, previousPointOnPlane } = this.planarInfo;

    this.el.camera.getWorldQuaternion(CAMERA_WORLD_QUATERNION);
    plane.quaternion.copy(CAMERA_WORLD_QUATERNION);
    this.target.getWorldPosition(plane.position);
    plane.matrixNeedsUpdate = true;
    plane.updateMatrixWorld(true);

    intersections.length = 0;
    this.raycasters.right =
      this.raycasters.right ||
      document.getElementById("right-cursor-controller").components["cursor-controller"].raycaster;
    this.raycasters.left =
      this.raycasters.left ||
      document.getElementById("left-cursor-controller").components["cursor-controller"].raycaster;
    const raycaster = this.hand.el.id === "player-left-controller" ? this.raycasters.left : this.raycasters.right;
    const far = raycaster.far;
    raycaster.far = 1000;
    plane.raycast(raycaster, intersections);
    raycaster.far = far;
    this.transforming = !!intersections[0];
    if (!this.transforming) {
      return;
    }

    previousPointOnPlane.copy(intersections[0].point);

    this.target.getWorldQuaternion(TARGET_WORLD_QUATERNION);

    v.set(0, 0, -1).applyQuaternion(CAMERA_WORLD_QUATERNION);
    v2.set(0, 0, -1).applyQuaternion(TARGET_WORLD_QUATERNION);
    this.sign = v.dot(v2) > 0 ? 1 : -1;

    v.set(0, 1, 0); //.applyQuaternion(this.CAMERA_WORLD_QUATERNION);
    v2.set(0, 1, 0).applyQuaternion(TARGET_WORLD_QUATERNION);
    this.sign2 = v.dot(v2) > 0 ? 1 : -1;

    this.dyAll = 0;
    this.dyStore = 0;
    this.dyApplied = 0;
    this.dxAll = 0;
    this.dxStore = 0;
    this.dxApplied = 0;
  },

  startTransform(target, hand, data) {
    this.target = target;
    this.hand = hand;
    this.mode = data.mode;
    this.transforming = true;

    if (this.mode === TRANSFORM_MODE.ALIGN) {
      this.store.update({ activity: { hasRecentered: true } });
      return;
    } else {
      this.store.update({ activity: { hasRotated: true } });
    }

    if (this.mode === TRANSFORM_MODE.CURSOR) {
      this.target.getWorldQuaternion(this.startQ);
    }

    if (this.mode === TRANSFORM_MODE.PUPPET) {
      this.target.getWorldQuaternion(this.puppet.initialObjectOrientation);
      this.hand.getWorldQuaternion(this.puppet.initialControllerOrientation);
      this.puppet.initialControllerOrientation_inverse.copy(this.puppet.initialControllerOrientation).invert();
      return;
    }

    if (this.mode === TRANSFORM_MODE.AXIS) {
      this.axis.copy(data.axis);
    }

    this.startPlaneCasting();
  },

  puppetingTick() {
    const {
      currentControllerOrientation,
      controllerOrientationDelta,
      initialControllerOrientation_inverse,
      initialObjectOrientation
    } = this.puppet;
    this.hand.getWorldQuaternion(currentControllerOrientation);
    controllerOrientationDelta.copy(initialControllerOrientation_inverse).premultiply(currentControllerOrientation);
    this.target.quaternion
      .copy(initialObjectOrientation)
      .premultiply(controllerOrientationDelta)
      .premultiply(controllerOrientationDelta);
    this.target.matrixNeedsUpdate = true;
  },

  cursorAxisOrScaleTick() {
    const {
      plane,
      normal,
      intersections,
      previousPointOnPlane,
      currentPointOnPlane,
      deltaOnPlane,
      finalProjectedVec
    } = this.planarInfo;
    this.target.getWorldPosition(plane.position);
    //    this.el.camera.getWorldQuaternion(plane.quaternion);
    this.el.camera.getWorldPosition(v);
    plane.matrixNeedsUpdate = true;
    const cameraToPlaneDistance = v.sub(plane.position).length();

    intersections.length = 0;
    const raycaster = this.hand.el.id === "player-left-controller" ? this.raycasters.left : this.raycasters.right;
    const far = raycaster.far;
    raycaster.far = 1000;
    plane.raycast(raycaster, intersections);
    raycaster.far = far;
    const intersection = intersections[0];
    if (!intersection) return;

    normal.set(0, 0, -1).applyQuaternion(plane.quaternion);

    currentPointOnPlane.copy(intersection.point);
    deltaOnPlane.copy(currentPointOnPlane).sub(previousPointOnPlane);
    const SENSITIVITY = 10;
    finalProjectedVec
      .copy(deltaOnPlane)
      .projectOnPlane(normal)
      .applyQuaternion(q.copy(plane.quaternion).invert())
      .multiplyScalar(SENSITIVITY / cameraToPlaneDistance);
    if (this.mode === TRANSFORM_MODE.CURSOR) {
      const modify = AFRAME.scenes[0].systems.userinput.get(paths.actions.transformModifier);

      this.dyAll = this.dyStore + finalProjectedVec.y;
      this.dyApplied = modify ? this.dyAll : Math.round(this.dyAll / STEP_LENGTH) * STEP_LENGTH;
      this.dyStore = this.dyAll - this.dyApplied;

      this.dxAll = this.dxStore + finalProjectedVec.x;
      this.dxApplied = modify ? this.dxAll : Math.round(this.dxAll / STEP_LENGTH) * STEP_LENGTH;
      this.dxStore = this.dxAll - this.dxApplied;

      if (this.mode === TRANSFORM_MODE.CURSOR) {
        this.target.getWorldQuaternion(TARGET_WORLD_QUATERNION);
        v.set(1, 0, 0).applyQuaternion(modify ? CAMERA_WORLD_QUATERNION : TARGET_WORLD_QUATERNION);
        q.setFromAxisAngle(v, modify ? -this.dyApplied : this.sign2 * this.sign * -this.dyApplied);

        if (modify) {
          v.set(0, 1, 0).applyQuaternion(CAMERA_WORLD_QUATERNION);
        } else {
          v.set(0, 1, 0);
        }
        q2.setFromAxisAngle(v, this.dxApplied);

        this.target.quaternion.premultiply(q).premultiply(q2);
      }

      this.target.matrixNeedsUpdate = true;
    } else if (this.mode === TRANSFORM_MODE.AXIS) {
      this.dxAll = this.dxStore + finalProjectedVec.x;
      this.dxApplied = Math.round(this.dxAll / STEP_LENGTH) * STEP_LENGTH;
      this.dxStore = this.dxAll - this.dxApplied;

      this.target.quaternion.multiply(q.setFromAxisAngle(this.axis, -this.sign * this.dxApplied));
      this.target.matrixNeedsUpdate = true;
    }

    previousPointOnPlane.copy(currentPointOnPlane);
  },

  tick() {
    if (!this.transforming) {
      return;
    }

    if (this.mode === TRANSFORM_MODE.SCALE) {
      return; // Taken care of by scale-button
    }

    if (this.mode === TRANSFORM_MODE.ALIGN) {
      this.el.camera.getWorldPosition(CAMERA_WORLD_POSITION);
      this.target.lookAt(CAMERA_WORLD_POSITION);
      this.transforming = false;
      return;
    }

    if (this.mode === TRANSFORM_MODE.PUPPET) {
      this.puppetingTick();
      return;
    }
    this.cursorAxisOrScaleTick();
  }
});

AFRAME.registerComponent("transform-button-selector", {
  tick() {
    this.userinput = this.userinput || this.el.sceneEl.systems.userinput;
    const hasHand = this.userinput.get(paths.actions.rightHand.pose) || this.userinput.get(paths.actions.leftHand.pose);
    if (!hasHand) {
      if (this.el.components["transform-button"].data.mode !== TRANSFORM_MODE.CURSOR) {
        this.el.setAttribute("transform-button", "mode", TRANSFORM_MODE.CURSOR);
      }
    } else {
      if (this.el.components["transform-button"].data.mode !== TRANSFORM_MODE.PUPPET) {
        this.el.setAttribute("transform-button", "mode", TRANSFORM_MODE.PUPPET);
      }
    }
  }
});

const FORWARD = new THREE.Vector3(0, 0, 1);
const TWO_PI = 2 * Math.PI;
AFRAME.registerComponent("visible-if-transforming", {
  schema: {
    hand: { type: "string" }
  },
  init() {},
  tick(t) {
    const shouldBeVisible =
      AFRAME.scenes[0].systems["transform-selected-object"].transforming &&
      AFRAME.scenes[0].systems["transform-selected-object"].hand.el.id.indexOf(this.data.hand) !== -1;
    const visibleNeedsUpdate = this.el.getAttribute("visible") !== shouldBeVisible;
    if (visibleNeedsUpdate) {
      this.el.setAttribute("visible", AFRAME.scenes[0].systems["transform-selected-object"].transforming);
    }

    if (shouldBeVisible) {
      this.el.object3D.quaternion.setFromAxisAngle(FORWARD, TWO_PI * Math.sin(t / 1000.0));
      this.el.object3D.matrixNeedsUpdate = true;
    }
  }
});
