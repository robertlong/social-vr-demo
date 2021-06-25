/**
 * Toggles the position of 2 bones into "on" and "off" positions to indicate mute state.
 * @namespace avatar
 * @component bone-mute-state-indicator
 */
// TODO: Remove this
AFRAME.registerComponent("bone-mute-state-indicator", {
  schema: {
    unmutedBoneName: { default: "Watch_Joint_MicON" },
    mutedBoneName: { default: "Watch_Joint_Muted" },
    onPos: { default: 0.81 },
    offPos: { default: 0.5 }
  },

  init() {
    this.onStateToggled = this.onStateToggled.bind(this);
    this.el.addEventListener("model-loaded", () => {
      this.unmutedBone = this.el.object3D.getObjectByName(this.data.unmutedBoneName);
      this.mutedBone = this.el.object3D.getObjectByName(this.data.mutedBoneName);
      this.modelLoaded = true;

      this.updateMuteState();
    });

    this.onMicStateChanged = () => {
      this.updateMuteState();
    };
  },

  play() {
    APP.dialog.on("mic-state-changed", this.onMicStateChanged);
  },

  pause() {
    APP.dialog.off("mic-state-changed", this.onMicStateChanged);
  },

  updateMuteState() {
    if (!this.modelLoaded) return;
    const muted = !APP.dialog.isMicEnabled;
    this.mutedBone.position.y = muted ? this.data.onPos : this.data.offPos;
    this.unmutedBone.position.y = !muted ? this.data.onPos : this.data.offPos;
    this.mutedBone.matrixNeedsUpdate = true;
    this.unmutedBone.matrixNeedsUpdate = true;
  }
});
