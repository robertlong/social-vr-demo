/**
 * Represents an entity in the audio-zones-system.
 * Records the audio zones where the entity is and returns current/past states.
 * This entity is used together with the audio-zone-listeneror audio-zone-source components to composite actual entities.
 **/
AFRAME.registerComponent("audio-zone-entity", {
  init() {
    this.zones = [];
    this.prevZones = [];
  },

  remove() {
    this.zones.length = 0;
    this.prevZones.length = 0;
  },

  // Update the previous zones array.
  tock() {
    this.prevZones.length = this.zones.length;
    for (let i = 0; i < this.zones.length; i++) {
      this.prevZones[i] = this.zones[i];
    }
  },

  // Adds a zone to the current zones array.
  addZone(zone) {
    const index = this.zones.indexOf(zone);
    if (index < 0) {
      this.zones.push(zone);
    }
  },

  // Removes a zone from the current zones array.
  removeZone(zone) {
    const index = this.zones.indexOf(zone);
    if (index !== -1) {
      this.zones.splice(index, 1);
    }
  },

  // Returns true if this entity is inside a zone.
  isInZone(zone) {
    return this.zones.includes(zone);
  },

  // Returns true if this entity was inside the zone in the previous tick.
  wasInZone(zone) {
    return this.prevZones.includes(zone);
  },

  // Returns true if the entity has change zones (a zone has been added or removes in the last tick).
  isUpdated() {
    return !(
      this.zones.length === this.prevZones.length && this.zones.every((value, index) => value === this.prevZones[index])
    );
  },

  // Return the array of zones the entity is currently inside of.
  getZones() {
    return this.zones;
  }
});
