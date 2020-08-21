import { VOLUME_LABELS } from "./media-views";
const MAX_VOLUME = 8;
const SMALL_STEP = 1 / (VOLUME_LABELS.length / 2);
const BIG_STEP = (MAX_VOLUME - 1) / (VOLUME_LABELS.length / 2);

AFRAME.registerComponent("avatar-volume-controls", {
  schema: {
    volume: { type: "number", default: 1.0 }
  },

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
    window.APP.store.addEventListener("statechanged", this.update);

    this.updateVolumeLabel();
  },
  remove() {
    window.APP.store.removeEventListener("statechanged", this.update);
  },

  changeVolumeBy(v) {
    this.el.setAttribute("avatar-volume-controls", "volume", THREE.Math.clamp(this.data.volume + v, 0, MAX_VOLUME));
    this.updateVolumeLabel();
  },

  volumeUp() {
    const step = this.data.volume > 1 - SMALL_STEP ? BIG_STEP : SMALL_STEP;
    this.changeVolumeBy(step);
  },

  volumeDown() {
    const step = this.data.volume > 1 + SMALL_STEP ? BIG_STEP : SMALL_STEP;
    this.changeVolumeBy(-1 * step);
  },

  update: (function() {
    const positionA = new THREE.Vector3();
    const positionB = new THREE.Vector3();
    return function update() {
      const audio = this.avatarAudioSource && this.avatarAudioSource.el.getObject3D(this.avatarAudioSource.attrName);
      if (!audio) {
        return;
      }

      const { audioOutputMode, globalVoiceVolume, globalRolloffFactor } = window.APP.store.state.preferences;
      const volumeModifier = (globalVoiceVolume !== undefined ? globalVoiceVolume : 100) / 100;
      let gain = volumeModifier * this.data.volume;
      if (audioOutputMode === "audio") {
        this.avatarAudioSource.el.object3D.getWorldPosition(positionA);
        this.el.sceneEl.camera.getWorldPosition(positionB);
        const squaredDistance = positionA.distanceToSquared(positionB);
        const distanceBasedAttenuation = Math.min(1, 10 / Math.max(1, squaredDistance));
        const rolloffFactor = globalRolloffFactor !== undefined ? globalRolloffFactor : 1.0;
        // Clamp rolloffFactor to [0.0, 1.0]
        gain = gain * (1.0 + Math.max(0.0, Math.min(1.0, rolloffFactor)) *
          (distanceBasedAttenuation - 1.0));
      }

      audio.gain.gain.value = gain;
    };
  })(),

  updateVolumeLabel() {
    const numBars = Math.min(
      VOLUME_LABELS.length - 1,
      this.data.volume <= 1.001
        ? Math.floor(this.data.volume / SMALL_STEP)
        : Math.floor(VOLUME_LABELS.length / 2 + (this.data.volume - 1) / BIG_STEP)
    );
    this.volumeLabel.setAttribute("text", "value", this.data.volume === 0 ? "Muted" : VOLUME_LABELS[numBars]);
  },

  tick() {
    if (!this.avatarAudioSource && !this.searchFailed) {
      // Walk up to Spine and then search down.
      const sourceEl = this.el.parentNode.parentNode.querySelector("[avatar-audio-source]");
      if (!sourceEl || !sourceEl.components["avatar-audio-source"]) {
        this.searchFailed = true;
        return;
      }
      this.avatarAudioSource = sourceEl.components["avatar-audio-source"];
    }

    this.update();
  }
});
