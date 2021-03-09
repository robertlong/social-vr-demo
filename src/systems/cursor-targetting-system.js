import { waitForDOMContentLoaded } from "../utils/async-utils";

const noop = function() {};
AFRAME.registerComponent("overwrite-raycast-as-noop", {
  init() {
    this.el.object3D.raycast = noop;
    this.mesh = this.el.getObject3D("mesh");
    if (this.mesh) {
      this.mesh.raycast = noop;
    } else {
      this.el.addEventListener("model-loaded", () => {
        this.mesh = this.el.getObject3D("mesh");
        if (this.mesh) {
          this.mesh.raycast = noop;
        }
      });
    }
  }
});

export class CursorTargettingSystem {
  constructor(scene) {
    this.scene = scene;
    this.targets = [];
    this.setDirty = this.setDirty.bind(this);
    this.dirty = true;

    // TODO: Use the MutationRecords passed into the callback function to determine added/removed nodes!
    this.observer = new MutationObserver(this.setDirty);

    waitForDOMContentLoaded().then(() => {
      const scene = document.querySelector("a-scene");
      this.rightRemote = document.getElementById("right-cursor-controller");
      this.leftRemote = document.getElementById("left-cursor-controller");
      this.observer.observe(scene, { childList: true, attributes: true, subtree: true });
      scene.addEventListener("object3dset", this.setDirty);
      scene.addEventListener("object3dremove", this.setDirty);
    });
  }

  setDirty() {
    this.dirty = true;
  }

  tick(t) {
    if (this.dirty) {
      this.populateEntities(this.targets);
      this.dirty = false;
    }

    if (this.rightRemote) {
      this.rightRemote.components["cursor-controller"].tick2(t);
    }

    if (this.leftRemote) {
      this.leftRemote.components["cursor-controller"].tick2(t, true);
    }
  }

  populateEntities(targets) {
    targets.length = 0;
    // TODO: Do not querySelectorAll on the entire scene every time anything changes!
    const els = this.scene.querySelectorAll(
      ".collidable, .interactable, .ui, .drawing, .occupiable-waypoint-icon, .teleport-waypoint-icon, .avatar-inspect-collider"
    );
    for (let i = 0; i < els.length; i++) {
      if (els[i].object3D) {
        targets.push(els[i].object3D);
      }
    }
  }

  remove() {
    this.observer.disconnect();
    this.scene.removeEventListener("object3dset", this.setDirty);
    this.scene.removeEventListener("object3dremove", this.setDirty);
  }
}
