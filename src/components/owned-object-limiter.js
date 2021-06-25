/* global AFRAME NAF performance */
AFRAME.registerComponent("owned-object-limiter", {
  schema: {
    counter: { type: "selector" }
  },

  init() {
    this.counter = this.data.counter.components["networked-counter"];
  },

  tick() {
    this._syncCounterRegistration();
    const isHeld = this.el.sceneEl.systems.interaction.isHeld(this.el);
    if (!isHeld && this.wasHeld && this.counter.timestamps.has(this.el)) {
      this.counter.timestamps.set(this.el, performance.now());
    }
    this.wasHeld = isHeld;
  },

  remove() {
    this.counter.deregister(this.el);
  },

  _syncCounterRegistration() {
    if (!this.el.components["networked"]) return;
    // Ignore 'moveable' (embedded intractive) objects
    if (this.el.components["moveable"]) return;

    const isPinned = this.el.components["pinnable"] && this.el.components["pinnable"].data.pinned;

    if (NAF.utils.isMine(this.el) && !isPinned) {
      this.counter.register(this.el);
    } else {
      this.counter.deregister(this.el);
    }
  }
});
