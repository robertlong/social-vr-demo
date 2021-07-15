import { paths } from "../systems/userinput/paths";

const rotatePitchAndYaw = (function() {
  const opq = new THREE.Quaternion();
  const owq = new THREE.Quaternion();
  const oq = new THREE.Quaternion();
  const pq = new THREE.Quaternion();
  const yq = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const v = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  return function rotatePitchAndYaw(o, p, y) {
    o.parent.updateMatrices();
    o.updateMatrices();
    o.parent.getWorldQuaternion(opq);
    o.getWorldQuaternion(owq);
    oq.copy(o.quaternion);
    v.set(0, 1, 0).applyQuaternion(oq);
    const initialUpDot = v.dot(UP);
    v.set(0, 0, 1).applyQuaternion(oq);
    const initialForwardDotUp = Math.abs(v.dot(UP));
    right.set(1, 0, 0).applyQuaternion(owq);
    pq.setFromAxisAngle(right, p);
    yq.setFromAxisAngle(UP, y);

    q.copy(owq)
      .premultiply(pq)
      .premultiply(yq)
      .premultiply(opq.invert());
    v.set(0, 1, 0).applyQuaternion(q);
    const newUpDot = v.dot(UP);
    v.set(0, 0, 1).applyQuaternion(q);
    const newForwardDotUp = Math.abs(v.dot(UP));
    // Ensure our pitch is in an accepted range and our head would not be flipped upside down
    if ((newForwardDotUp > 0.9 && newForwardDotUp > initialForwardDotUp) || (newUpDot < 0 && newUpDot < initialUpDot)) {
      // TODO: Apply a partial rotation that does not exceed the bounds for nicer UX
      return;
    } else {
      o.quaternion.copy(q);
      o.matrixNeedsUpdate = true;
      o.updateMatrices();
    }
  };
})();

let uiRoot;
let scenePreviewNode;
AFRAME.registerComponent("pitch-yaw-rotator", {
  init() {
    this.pendingXRotation = 0;
    this.el.sceneEl.addEventListener("rotateX", e => {
      this.pendingXRotation += e.detail;
    });
    this.on = true;
  },

  tick() {
    if (this.on) {
      const scene = AFRAME.scenes[0];
      const userinput = scene.systems.userinput;
      uiRoot = uiRoot || document.getElementById("ui-root");
      scenePreviewNode = scenePreviewNode || document.getElementById("scene-preview-node");
      const lobby = !scene.is("entered");
      const isGhost = lobby && uiRoot && uiRoot.firstChild && uiRoot.firstChild.classList.contains("isGhost");
      const cameraDelta = userinput.get(lobby ? paths.actions.lobbyCameraDelta : paths.actions.cameraDelta);
      if (cameraDelta) {
        rotatePitchAndYaw(
          lobby && !isGhost ? scenePreviewNode.object3D : this.el.object3D,
          this.pendingXRotation + cameraDelta[1],
          cameraDelta[0]
        );
      } else if (this.pendingXRotation) {
        rotatePitchAndYaw(lobby && !isGhost ? scenePreviewNode.object3D : this.el.object3D, this.pendingXRotation, 0);
      }
    }
    this.pendingXRotation = 0;
  }
});
