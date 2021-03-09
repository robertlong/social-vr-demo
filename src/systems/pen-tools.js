import { waitForDOMContentLoaded } from "../utils/async-utils";

// Used for tracking and managing pen tools in the scene
AFRAME.registerSystem("pen-tools", {
  init() {
    this.penEls = [];
    this.updateMyPen = this.updateMyPen.bind(this);

    waitForDOMContentLoaded().then(() => {
      this.updateMyPen();
    });
  },

  register(el) {
    this.penEls.push(el);
    el.addEventListener("ownership-changed", this.updateMyPen);
    this.updateMyPen();
  },

  deregister(el) {
    this.penEls.splice(this.penEls.indexOf(el), 1);
    el.removeEventListener("ownership-changed", this.updateMyPen);

    if (!AFRAME.scenes[0]) {
      // Aframe Scene was removed. Avoid other side effects.
      return;
    }

    this.updateMyPen();
  },

  getMyPen() {
    return this.myPen;
  },

  updateMyPen() {
    this.myPen = this.penEls.find(NAF.utils.isMine);

    if (this.myPen) {
      this.sceneEl.addState("pen");
    } else {
      this.sceneEl.removeState("pen");
    }
  }
});
