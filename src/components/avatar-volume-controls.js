import { VOLUME_LABELS } from "./media-views";
const MAX_VOLUME = 8;
const SMALL_STEP = 1 / (VOLUME_LABELS.length / 2);
const BIG_STEP = (MAX_VOLUME - 1) / (VOLUME_LABELS.length / 2);

AFRAME.registerComponent("avatar-volume-controls", {
  init() {
    this.volumeUp = this.volumeUp.bind(this);
    this.volumeDown = this.volumeDown.bind(this);
    this.changeVolumeBy = this.changeVolumeBy.bind(this);
    this.volumeUpButton = this.el.querySelector(".avatar-volume-up-button");
    this.volumeDownButton = this.el.querySelector(".avatar-volume-down-button");
    this.volumeLabel = this.el.querySelector(".avatar-volume-label");
    this.volumeUpButton.object3D.addEventListener("interact", this.volumeUp);
    this.volumeDownButton.object3D.addEventListener("interact", this.volumeDown);
    this.update = this.update.bind(this);
    this.normalizer = null;
    window.APP.store.addEventListener("statechanged", this.update);
    this.audioParamsComp = this.el.parentEl.parentEl.querySelector("[audio-params]").components["audio-params"];
    this.updateVolumeLabel();
  },
  remove() {
    window.APP.store.removeEventListener("statechanged", this.update);
  },

  changeVolumeBy(v) {
    const vol = THREE.Math.clamp(this.audioParamsComp.data.gain + v, 0, MAX_VOLUME);
    this.el.setAttribute("avatar-volume-controls", "volume", vol);
    this.audioParamsComp.el.setAttribute("audio-params", "gain", vol);
    this.updateVolumeLabel();
  },

  volumeUp() {
    const step = this.audioParamsComp.data.gain > 1 - SMALL_STEP ? BIG_STEP : SMALL_STEP;
    this.changeVolumeBy(step);
  },

  volumeDown() {
    const step = this.audioParamsComp.data.gain > 1 + SMALL_STEP ? BIG_STEP : SMALL_STEP;
    this.changeVolumeBy(-1 * step);
  },

  updateVolumeLabel() {
    const numBars = Math.min(
      VOLUME_LABELS.length - 1,
      this.audioParamsComp.data.gain <= 1.001
        ? Math.floor(this.audioParamsComp.data.gain / SMALL_STEP)
        : Math.floor(VOLUME_LABELS.length / 2 + (this.audioParamsComp.data.gain - 1) / BIG_STEP)
    );
    this.volumeLabel.setAttribute(
      "text",
      "value",
      this.audioParamsComp.data.gain === 0 ? "Muted" : VOLUME_LABELS[numBars]
    );
  }
});
