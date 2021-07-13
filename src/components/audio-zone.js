const DEBUG_BBAA_COLOR = 0x49ef4;

const debugMaterial = new THREE.MeshBasicMaterial({
  color: DEBUG_BBAA_COLOR,
  transparent: true,
  opacity: 0.25,
  side: THREE.DoubleSide
});

/**
 * Represents an 3D box area in the audio-zones-system that can contain audio-zone-entities.
 * It has an audio-params component whose values are used to override the audio source's audio properties.
 * based on the source's and listener's position. It can be of inOut or/and outIn types.
    inOut: applies this zone's audio-params to an audio-zone-source when the source is inside and listener is outside.
    i.e. You want to mute audio sources inside the audio zone when the listener is outside.
    outIn: applies this zone's audio-params to the an audio-zone-source when the listener is inside and the source is outside.
    i.e. You want to mute audio sources from outside the audio zone when the listener is inside.
 */
AFRAME.registerComponent("audio-zone", {
  schema: {
    enabled: { default: true },
    inOut: { default: true },
    outIn: { default: true },
    debuggable: { default: true }
  },

  init() {
    const bbox = new THREE.Box3();
    bbox.setFromObject(this.el.object3D);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    // Adjust the box scale to the bounding box size
    if (size.length() > 0) {
      this.el.object3D.scale.set(size.x, size.y, size.z);
    }

    for (let i = this.el.object3D.children.length - 1; i >= 0; i--) {
      this.el.object3D.children[i].visible = false;
    }

    const debugGeometry = new THREE.BoxGeometry();
    this.debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
    this.debugMesh.el = this.el.object3D.el;
    const debugBBAA = new THREE.BoxHelper(this.debugMesh, DEBUG_BBAA_COLOR);
    this.el.object3D.add(debugBBAA);

    this.el.sceneEl?.systems["audio-debug"].registerZone(this);
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.registerZone(this);

    this.enableDebug(window.APP.store.state.preferences.showAudioDebugPanel);
    this.el.setAttribute("audio-params", "debuggable", false);
    this.audioParamsComp = this.el.components["audio-params"];
  },

  remove() {
    this.el.sceneEl?.systems["audio-debug"].unregisterZone(this);
    this.el.sceneEl?.systems["hubs-systems"].audioZonesSystem.unregisterZone(this);
  },

  update() {
    this.enableDebug(this.data.debuggable && window.APP.store.state.preferences.showAudioDebugPanel);
  },

  isEnabled() {
    return this.data.enabled;
  },

  getBoundingBox: (function() {
    const bbaa = new THREE.Box3();
    return function() {
      return bbaa.copy(this.debugMesh.geometry.boundingBox).applyMatrix4(this.el.object3D.matrixWorld);
    };
  })(),

  enableDebug(debuggable) {
    this.data.debuggable = debuggable;
    this.el.object3D.visible = debuggable;
  },

  getAudioParams() {
    return {
      distanceModel: this.audioParamsComp.data.distanceModel,
      maxDistance: this.audioParamsComp.data.maxDistance,
      refDistance: this.audioParamsComp.data.refDistance,
      rolloffFactor: this.audioParamsComp.data.rolloffFactor,
      coneInnerAngle: this.audioParamsComp.data.coneInnerAngle,
      coneOuterAngle: this.audioParamsComp.data.coneOuterAngle,
      coneOuterGain: this.audioParamsComp.data.coneOuterGain,
      gain: this.audioParamsComp.data.gain
    };
  },

  contains(position) {
    return this.getBoundingBox().containsPoint(position);
  }
});
