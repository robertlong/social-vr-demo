import { waitForDOMContentLoaded } from "../utils/async-utils";
const { Vector3, Quaternion, Matrix4, Euler } = THREE;

function quaternionAlmostEquals(epsilon, u, v) {
  // Note: q and -q represent same rotation
  return (
    (Math.abs(u.x - v.x) < epsilon &&
      Math.abs(u.y - v.y) < epsilon &&
      Math.abs(u.z - v.z) < epsilon &&
      Math.abs(u.w - v.w) < epsilon) ||
    (Math.abs(-u.x - v.x) < epsilon &&
      Math.abs(-u.y - v.y) < epsilon &&
      Math.abs(-u.z - v.z) < epsilon &&
      Math.abs(-u.w - v.w) < epsilon)
  );
}

/**
 * Provides access to the end effectors for IK.
 * @namespace avatar
 * @component ik-root
 */
AFRAME.registerComponent("ik-root", {
  schema: {
    camera: { type: "string", default: ".camera" },
    leftController: { type: "string", default: ".left-controller" },
    rightController: { type: "string", default: ".right-controller" }
  },
  update(oldData) {
    if (this.data.camera !== oldData.camera) {
      this.camera = this.el.querySelector(this.data.camera);
    }

    if (this.data.leftController !== oldData.leftController) {
      this.leftController = this.el.querySelector(this.data.leftController);
    }

    if (this.data.rightController !== oldData.rightController) {
      this.rightController = this.el.querySelector(this.data.rightController);
    }
  }
});

function findIKRoot(entity) {
  while (entity && !(entity.components && entity.components["ik-root"])) {
    entity = entity.parentNode;
  }
  return entity && entity.components["ik-root"];
}

const HAND_ROTATIONS = {
  left: new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2, Math.PI / 2, 0)),
  right: new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2, -Math.PI / 2, 0))
};

const angleOnXZPlaneBetweenMatrixRotations = (function() {
  const XZ_PLANE_NORMAL = new THREE.Vector3(0, -1, 0);
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  return function angleOnXZPlaneBetweenMatrixRotations(matrixA, matrixB) {
    v1.setFromMatrixColumn(matrixA, 2).projectOnPlane(XZ_PLANE_NORMAL);
    v2.setFromMatrixColumn(matrixB, 2).projectOnPlane(XZ_PLANE_NORMAL);
    return v1.angleTo(v2);
  };
})();

/**
 * Performs IK on a hip-rooted skeleton to align the hip, head and hands with camera and controller inputs.
 * @namespace avatar
 * @component ik-controller
 */
AFRAME.registerComponent("ik-controller", {
  schema: {
    leftEye: { type: "string", default: "LeftEye" },
    rightEye: { type: "string", default: "RightEye" },
    head: { type: "string", default: "Head" },
    neck: { type: "string", default: "Neck" },
    leftHand: { type: "string", default: "LeftHand" },
    rightHand: { type: "string", default: "RightHand" },
    chest: { type: "string", default: "Spine" },
    rotationSpeed: { default: 8 },
    maxLerpAngle: { default: 90 * THREE.Math.DEG2RAD },
    alwaysUpdate: { type: "boolean", default: false }
  },

  init() {
    this._runScheduledWork = this._runScheduledWork.bind(this);
    this._updateIsInView = this._updateIsInView.bind(this);

    this.flipY = new Matrix4().makeRotationY(Math.PI);

    this.cameraForward = new Matrix4();
    this.headTransform = new Matrix4();
    this.hipsPosition = new Vector3();

    this.invHipsToHeadVector = new Vector3();

    this.middleEyeMatrix = new Matrix4();
    this.middleEyePosition = new Vector3();
    this.invMiddleEyeToHead = new Matrix4();

    this.cameraYRotation = new Euler();
    this.cameraYQuaternion = new Quaternion();

    this.invHipsQuaternion = new Quaternion();
    this.headQuaternion = new Quaternion();

    this.rootToChest = new Matrix4();
    this.invRootToChest = new Matrix4();

    this.ikRoot = findIKRoot(this.el);

    this.isInView = true;
    this.hasConvergedHips = false;
    this.lastCameraTransform = new THREE.Matrix4();
    waitForDOMContentLoaded().then(() => {
      this.playerCamera = document.getElementById("viewing-camera").getObject3D("camera");
    });

    this.el.sceneEl.systems["frame-scheduler"].schedule(this._runScheduledWork, "ik");
    this.forceIkUpdate = true;
  },

  remove() {
    this.el.sceneEl.systems["frame-scheduler"].unschedule(this._runScheduledWork, "ik");
  },

  update(oldData) {
    this.avatar = this.el.object3D;

    if (this.data.leftEye !== oldData.leftEye) {
      this.leftEye = this.el.object3D.getObjectByName(this.data.leftEye);
    }

    if (this.data.rightEye !== oldData.rightEye) {
      this.rightEye = this.el.object3D.getObjectByName(this.data.rightEye);
    }

    if (this.data.head !== oldData.head) {
      this.head = this.el.object3D.getObjectByName(this.data.head);
    }

    if (this.data.neck !== oldData.neck) {
      this.neck = this.el.object3D.getObjectByName(this.data.neck);
    }

    if (this.data.leftHand !== oldData.leftHand) {
      this.leftHand = this.el.object3D.getObjectByName(this.data.leftHand);
    }

    if (this.data.rightHand !== oldData.rightHand) {
      this.rightHand = this.el.object3D.getObjectByName(this.data.rightHand);
    }

    if (this.data.chest !== oldData.chest) {
      this.chest = this.el.object3D.getObjectByName(this.data.chest);
    }

    // Set middleEye's position to be right in the middle of the left and right eyes.
    this.middleEyePosition.addVectors(this.leftEye.position, this.rightEye.position);
    this.middleEyePosition.divideScalar(2);
    this.middleEyeMatrix.makeTranslation(this.middleEyePosition.x, this.middleEyePosition.y, this.middleEyePosition.z);
    this.invMiddleEyeToHead = this.middleEyeMatrix.copy(this.middleEyeMatrix).invert();

    this.invHipsToHeadVector
      .addVectors(this.chest.position, this.neck.position)
      .add(this.head.position)
      .negate();
  },

  tick(time, dt) {
    if (!this.ikRoot) {
      return;
    }

    const root = this.ikRoot.el.object3D;
    root.updateMatrices();
    const { camera, leftController, rightController } = this.ikRoot;

    camera.object3D.updateMatrix();

    const hasNewCameraTransform = !this.lastCameraTransform.equals(camera.object3D.matrix);

    // Optimization: if the camera hasn't moved and the hips converged to the target orientation on a previous frame,
    // then the avatar does not need any IK this frame.
    //
    // Update in-view avatars every frame, and update out-of-view avatars via frame scheduler.
    if (
      this.data.alwaysUpdate ||
      this.forceIkUpdate ||
      (this.isInView && (hasNewCameraTransform || !this.hasConvergedHips))
    ) {
      if (hasNewCameraTransform) {
        this.lastCameraTransform.copy(camera.object3D.matrix);
      }

      const {
        avatar,
        head,
        neck,
        chest,
        cameraForward,
        headTransform,
        invMiddleEyeToHead,
        invHipsToHeadVector,
        flipY,
        cameraYRotation,
        cameraYQuaternion,
        invHipsQuaternion,
        rootToChest,
        invRootToChest
      } = this;

      // Camera faces the -Z direction. Flip it along the Y axis so that it is +Z.
      cameraForward.multiplyMatrices(camera.object3D.matrix, flipY);

      // Compute the head position such that the hmd position would be in line with the middleEye
      headTransform.multiplyMatrices(cameraForward, invMiddleEyeToHead);

      // Then position the avatar such that the head is aligned with headTransform
      // (which positions middleEye in line with the hmd)
      //
      // Note that we position the avatar itself, *not* the hips, since positioning the
      // hips will use vertex skinning to do the root displacement, which results in
      // frustum culling errors since three.js does not take into account skinning when
      // computing frustum culling sphere bounds.
      avatar.position.setFromMatrixPosition(headTransform).add(invHipsToHeadVector);
      avatar.matrixNeedsUpdate = true;

      // Animate the hip rotation to follow the Y rotation of the camera with some damping.
      cameraYRotation.setFromRotationMatrix(cameraForward, "YXZ");
      cameraYRotation.x = 0;
      cameraYRotation.z = 0;
      cameraYQuaternion.setFromEuler(cameraYRotation);

      if (this._hadFirstTick) {
        camera.object3D.updateMatrices();
        avatar.updateMatrices();
        // Note: Camera faces down -Z, avatar faces down +Z
        const yDelta = Math.PI - angleOnXZPlaneBetweenMatrixRotations(camera.object3D.matrixWorld, avatar.matrixWorld);

        if (yDelta > this.data.maxLerpAngle) {
          avatar.quaternion.copy(cameraYQuaternion);
        } else {
          avatar.quaternion.slerpQuaternions(
            avatar.quaternion,
            cameraYQuaternion,
            (this.data.rotationSpeed * dt) / 1000
          );
        }
      } else {
        avatar.quaternion.copy(cameraYQuaternion);
      }

      this.hasConvergedHips = quaternionAlmostEquals(0.0001, cameraYQuaternion, avatar.quaternion);

      // Take the head orientation computed from the hmd, remove the Y rotation already applied to it by the hips,
      // and apply it to the head
      invHipsQuaternion.copy(avatar.quaternion).invert();
      head.quaternion.setFromRotationMatrix(headTransform).premultiply(invHipsQuaternion);

      avatar.updateMatrix();
      rootToChest.multiplyMatrices(avatar.matrix, chest.matrix);
      invRootToChest.copy(rootToChest).invert();

      root.matrixNeedsUpdate = true;
      neck.matrixNeedsUpdate = true;
      head.matrixNeedsUpdate = true;
      chest.matrixNeedsUpdate = true;
    }

    const { leftHand, rightHand } = this;

    if (leftHand) this.updateHand(HAND_ROTATIONS.left, leftHand, leftController.object3D, true, this.isInView);
    if (rightHand) this.updateHand(HAND_ROTATIONS.right, rightHand, rightController.object3D, false, this.isInView);
    this.forceIkUpdate = false;

    if (!this._hadFirstTick) {
      // Ensure the avatar is not shown until we've done our first IK step, to prevent seeing mis-oriented/t-pose pose or our own avatar at the wrong place.
      this.ikRoot.el.object3D.visible = true;
      this._hadFirstTick = true;
    }
  },

  updateHand(handRotation, handObject3D, controllerObject3D, isLeft, isInView) {
    const handMatrix = handObject3D.matrix;

    // TODO: This coupling with personal-space-invader is not ideal.
    // There should be some intermediate thing managing multiple opinions about object visibility
    const spaceInvader = handObject3D.el.components["personal-space-invader"];

    if (spaceInvader) {
      // If this hand has an invader, defer to it to manage visibility overall but tell it to hide based upon controller state
      spaceInvader.setAlwaysHidden(!controllerObject3D.visible);
    } else {
      handObject3D.visible = controllerObject3D.visible;
    }

    // Optimization: skip IK update if not in view and not forced by frame scheduler
    if (controllerObject3D.visible && (isInView || this.forceIkUpdate || this.data.alwaysUpdate)) {
      handMatrix.multiplyMatrices(this.invRootToChest, controllerObject3D.matrix);

      handMatrix.multiply(handRotation);

      handObject3D.position.setFromMatrixPosition(handMatrix);
      handObject3D.rotation.setFromRotationMatrix(handMatrix);
      handObject3D.matrixNeedsUpdate = true;
    }
  },

  _runScheduledWork() {
    // Every scheduled run, we force an IK update on the next frame (so at most one avatar with forced IK per frame)
    // and also update the this.isInView bit on the avatar which is used to determine if an IK update should be run
    // every frame.
    this.forceIkUpdate = true;

    this._updateIsInView();
  },

  _updateIsInView: (function() {
    const frustum = new THREE.Frustum();
    const frustumMatrix = new THREE.Matrix4();
    const cameraWorld = new THREE.Vector3();
    const isInViewOfCamera = (screenCamera, pos) => {
      frustumMatrix.multiplyMatrices(screenCamera.projectionMatrix, screenCamera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(frustumMatrix);
      return frustum.containsPoint(pos);
    };

    return function() {
      if (!this.playerCamera) return;

      const camera = this.ikRoot.camera.object3D;
      camera.getWorldPosition(cameraWorld);

      // Check player camera
      this.isInView = isInViewOfCamera(this.playerCamera, cameraWorld);

      if (!this.isInView) {
        // Check in-game camera if rendering to viewfinder and owned
        const cameraTools = this.el.sceneEl.systems["camera-tools"];

        if (cameraTools) {
          cameraTools.ifMyCameraRenderingViewfinder(cameraTool => {
            this.isInView = this.isInView || isInViewOfCamera(cameraTool.camera, cameraWorld);
          });
        }
      }
    };
  })()
});
