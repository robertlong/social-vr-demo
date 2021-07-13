const CLIPPING_GAIN = 0.0001;

export class GainSystem {
  constructor() {
    this.sources = [];
    this.onPrefsUpdated = this.updatePrefs.bind(this);
    window.APP.store.addEventListener("statechanged", this.onPrefsUpdated);
  }

  remove() {
    this.sources = [];
    window.APP.store.removeEventListener("statechanged", this.onPrefsUpdated);
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

  tick() {
    this.sources.forEach(source => {
      if (source.data.clippingEnabled) {
        const audio = source.getAudio();
        if (source.data.attenuation < source.data.clippingThreshold) {
          if (audio.gain.gain.value > 0 && !source.data.isClipped) {
            source.clipGain(CLIPPING_GAIN);
          }
        } else if (source.data.isClipped) {
          source.unclipGain();
        }
      } else if (source.data.isClipped) {
        source.unclipGain();
      }
    });
  }

  updatePrefs() {
    this.sources.forEach(source => {
      source.updateClipping();
    });
  }
}
