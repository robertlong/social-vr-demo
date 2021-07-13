import { THREE } from "aframe";

const zero = new THREE.Vector3(0, 0, 0);

/**
 * Represents an audio-zone-entity that has an audio component in the audio-zones-system.
 * Expects an audio-params component. It can be an audio, video, avatar or an audio target.
 */
AFRAME.registerComponent("audio-zone-source", {
  dependencies: ["audio-zone-entity"],

  init() {
    this.prevAudioParamsData = null;
    this.audioParamsComp = this.el.components["audio-params"];
    this.entity = this.el.components["audio-zone-entity"];
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.registerSource(this);
  },

  remove() {
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.unregisterSource(this);
  },

  // Returns the audio source world position.
  getPosition() {
    return this.audioParamsComp?.data.position || zero;
  },

  // Updates the audio-params component with new audio parameters.
  apply(params) {
    if (!params) return;
    if (this.audioParamsComp) {
      if (this.prevAudioParamsData === null) {
        this.prevAudioParamsData = {
          distanceModel: this.audioParamsComp.data.distanceModel,
          maxDistance: this.audioParamsComp.data.maxDistance,
          refDistance: this.audioParamsComp.data.refDistance,
          rolloffFactor: this.audioParamsComp.data.rolloffFactor,
          coneInnerAngle: this.audioParamsComp.data.coneInnerAngle,
          coneOuterAngle: this.audioParamsComp.data.coneOuterAngle,
          coneOuterGain: this.audioParamsComp.data.coneOuterGain,
          gain: this.audioParamsComp.data.gain
        };
      }
      this.el.setAttribute("audio-params", params);
    }
  },

  // Restores the original audio parameters.
  restore() {
    if (this.prevAudioParamsData) {
      this.el.setAttribute("audio-params", this.prevAudioParamsData);
    }
    this.prevAudioParamsData = null;
  }
});
