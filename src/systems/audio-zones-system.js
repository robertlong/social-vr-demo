// We apply the most restrictive audio parameters
function paramsReducer(acc, curr) {
  if (acc === null) acc = curr;
  acc.gain = Math.min(acc.gain, curr.gain);
  acc.maxDistance = Math.min(acc.maxDistance, curr.maxDistance);
  acc.refDistance = Math.min(acc.refDistance, curr.refDistance);
  acc.rolloffFactor = Math.max(acc.rolloffFactor, curr.rolloffFactor);
  acc.coneInnerAngle = Math.min(acc.coneInnerAngle, curr.coneInnerAngle);
  acc.coneOuterAngle = Math.min(acc.coneOuterAngle, curr.coneOuterAngle);
  acc.coneOuterGain = Math.min(acc.coneOuterGain, curr.coneOuterGain);
  return acc;
}

/**
 * This system updates the audio-zone-sources audio-params based on the audio-zone-listener position.
 * On every tick it computes the audio-zone-source and audio-zone-listener positions to check
 * if the listener is inside/outside an audio-zone and applies the zone's audio parameters based.
 * It only updates in case there has been any changes in the sources or listener's positions.
 * If several audio-zones are in between the audio-zone-listener and the audio-zone-source, the applied
 * audio parameters is a reduction of the audio-zones most restrictive audio parameters.
 * i.e. If there are two audio-zones in between the listener and the source and the first one has gain == 0.1
 * and the other has gain == 1.0, gain == 0.1 is applied to the source.
 */
export class AudioZonesSystem {
  constructor(scene) {
    this.scene = scene;
    this.listener = null;
    this.sources = [];
    this.zones = [];
    this.initialized = false;
  }

  remove() {
    this.sources = [];
    this.zones = [];
  }

  setListener(listener) {
    this.listener = listener;
  }

  unsetListener() {
    this.listener = null;
  }

  registerSource(source) {
    this.sources.push(source);
  }

  unregisterSource(source) {
    const index = this.sources.indexOf(source);

    if (index !== -1) {
      this.sources.splice(index, 1);
    }
  }

  registerZone(zone) {
    this.zones.push(zone);
  }

  unregisterZone(zone) {
    const index = this.zones.indexOf(zone);

    if (index !== -1) {
      this.zones.splice(index, 1);
    }
  }

  tick = (function() {
    const ray = new THREE.Ray();
    const rayDir = new THREE.Vector3();
    const normalizedRayDir = new THREE.Vector3();
    const intersectTarget = new THREE.Vector3();
    return function() {
      if (!this.scene.is("entered") || this.zones.length === 0) return;

      // Update zones
      this._updateZones();

      for (let i = 0; i < this.sources.length; i++) {
        const source = this.sources[i];
        // Only check whenever either the source or the listener have updated zones (moved)
        if (source.entity.isUpdated() || this.listener.entity.isUpdated()) {
          // Cast a ray from the listener to the source
          rayDir.copy(
            source
              .getPosition()
              .clone()
              .sub(this.listener.getPosition())
          );
          normalizedRayDir.copy(rayDir.clone().normalize());
          ray.set(this.listener.getPosition(), normalizedRayDir);

          // First we check the zones the source is contained in and we check the inOut property
          // to modify the sources audio params when the listener is outside the source's zones
          // We always apply the outmost active zone audio params, the zone that's closest to the listener
          const inOutParams = source.entity
            .getZones()
            .filter(zone => {
              const zoneBBAA = zone.getBoundingBox();
              ray.intersectBox(zoneBBAA, intersectTarget);
              return intersectTarget !== null && zone.data.inOut && !this.listener.entity.getZones().includes(zone);
            })
            .map(zone => zone.getAudioParams())
            .reduce(paramsReducer, null);

          // Then we check the zones the listener is contained in and we check the outIn property
          // to modify the sources audio params when the source is outside the listener's zones
          // We always apply the inmost active zone audio params, the zone that's closest to the listener
          const outInParams = this.listener.entity
            .getZones()
            .filter(zone => {
              const zoneBBAA = zone.getBoundingBox();
              ray.intersectBox(zoneBBAA, intersectTarget);
              return intersectTarget !== null && zone.data.outIn && !source.entity.getZones().includes(zone);
            })
            .map(zone => zone.getAudioParams())
            .reduce(paramsReducer, null);

          // Resolve the zones
          if (outInParams || inOutParams) {
            const params = outInParams ? outInParams : inOutParams;
            params.gain = outInParams && inOutParams ? Math.min(outInParams.gain, inOutParams.gain) : params.gain;
            params.coneOuterGain =
              outInParams && inOutParams
                ? Math.min(outInParams.coneOuterGain, inOutParams.coneOuterGain)
                : params.coneOuterGain;
            source.apply(params);
          } else {
            source.restore();
          }
        }
      }
    };
  })();

  // Updates zones states in case they have changed.
  _updateZones() {
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (!zone.isEnabled()) return;

      const isListenerInZone = zone.contains(this.listener.getPosition());
      const wasListenerInZone = this.listener.entity.isInZone(zone);
      // Update audio zone listener status
      if (isListenerInZone && !wasListenerInZone) {
        this.listener.entity.addZone(zone);
      } else if (!isListenerInZone && wasListenerInZone) {
        this.listener.entity.removeZone(zone);
      }
      // Update audio zone source status
      this.sources.forEach(source => {
        const isSourceInZone = zone.contains(source.getPosition());
        const wasSourceInZone = source.entity.isInZone(zone);
        // Check if the audio source is in the audio zone
        if (isSourceInZone && !wasSourceInZone) {
          source.entity.addZone(zone);
        } else if (!isSourceInZone && wasSourceInZone) {
          source.entity.removeZone(zone);
        }
      });
    }
  }
}
