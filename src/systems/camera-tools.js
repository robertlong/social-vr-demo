import { waitForDOMContentLoaded } from "../utils/async-utils";

const CAMERA_UPDATE_FRAME_DELAY = 10; // Update one camera every N'th frame

// Used for tracking and managing camera tools in the scene
AFRAME.registerSystem("camera-tools", {
  init() {
    this.cameraEls = [];
    this.cameraUpdateCount = 0;
    this.ticks = 0;
    this.updateMyCamera = this.updateMyCamera.bind(this);

    waitForDOMContentLoaded().then(() => {
      const playerModelEl = document.querySelector("#avatar-rig .model");
      playerModelEl.addEventListener("model-loading", () => (this.playerHead = null));
      playerModelEl.addEventListener("model-loaded", this.updatePlayerHead.bind(this));
      this.updatePlayerHead();
      this.updateMyCamera();
    });
  },

  updatePlayerHead() {
    const headEl = document.getElementById("avatar-head");
    this.playerHead = headEl && headEl.object3D;
  },

  register(el) {
    this.cameraEls.push(el);
    el.addEventListener("ownership-changed", this.updateMyCamera);
    this.updateMyCamera();
  },

  deregister(el) {
    this.cameraEls.splice(this.cameraEls.indexOf(el), 1);
    el.removeEventListener("ownership-changed", this.updateMyCamera);

    if (!AFRAME.scenes[0]) {
      // Aframe Scene was removed. Avoid other side effects.
      return;
    }

    this.updateMyCamera();
  },

  getMyCamera() {
    return this.myCamera;
  },

  ifMyCameraRenderingViewfinder(f) {
    if (!this.myCamera) return;

    const myCameraTool = this.myCamera.components["camera-tool"];

    if (myCameraTool && myCameraTool.showCameraViewfinder && myCameraTool.camera) {
      f(myCameraTool);
    }
  },

  updateMyCamera() {
    this.myCamera = this.cameraEls.find(NAF.utils.isMine);

    if (this.myCamera) {
      this.sceneEl.addState("camera");
    } else {
      this.sceneEl.removeState("camera");
    }
  },

  tick() {
    this.ticks++;

    // We update at most one camera viewfinder per frame.
    if (this.ticks % CAMERA_UPDATE_FRAME_DELAY === 0) {
      if (this.cameraEls.length == 0) return;

      this.cameraUpdateCount++;
      this.cameraEls[this.cameraUpdateCount % this.cameraEls.length].components["camera-tool"].updateViewfinder();
    }
  }
});
