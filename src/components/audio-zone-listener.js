/**
 * Represents the scene audio listener in the audio-zones-system.
 */
AFRAME.registerComponent("audio-zone-listener", {
  dependencies: ["audio-zone-entity"],

  init() {
    this.position = new THREE.Vector3();
    this.listener = this.el.sceneEl?.audioListener;
    this.entity = this.el.components["audio-zone-entity"];
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.setListener(this);
  },

  remove() {
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.unsetListener();
  },

  tick() {
    this.listener.getWorldPosition(this.position);
  },

  // Returns the audio listener world position.
  getPosition() {
    return this.position;
  }
});
