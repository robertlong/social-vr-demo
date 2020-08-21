function updateMediaAudioSettings(mediaVideo, settings, globalRolloffFactor) {
  mediaVideo.el.setAttribute("media-video", {
    distanceModel: settings.mediaDistanceModel,
    rolloffFactor: settings.mediaRolloffFactor * globalRolloffFactor,
    refDistance: settings.mediaRefDistance,
    maxDistance: settings.mediaMaxDistance,
    coneInnerAngle: settings.mediaConeInnerAngle,
    coneOuterAngle: settings.mediaConeOuterAngle,
    coneOuterGain: settings.mediaConeOuterGain
  });
}

function updateAvatarAudioSettings(avatarAudioSource, settings, positional, globalRolloffFactor) {
  avatarAudioSource.el.setAttribute("avatar-audio-source", {
    positional,
    distanceModel: settings.avatarDistanceModel,
    maxDistance: settings.avatarMaxDistance,
    refDistance: settings.avatarRefDistance,
    rolloffFactor: settings.avatarRolloffFactor * globalRolloffFactor
  });
}

export class AudioSettingsSystem {
  constructor(sceneEl) {
    this.sceneEl = sceneEl;
    this.defaultSettings = {
      avatarDistanceModel: "inverse",
      avatarRolloffFactor: 2,
      avatarRefDistance: 1,
      avatarMaxDistance: 10000,
      mediaVolume: 0.5,
      mediaDistanceModel: "inverse",
      mediaRolloffFactor: 1,
      mediaRefDistance: 1,
      mediaMaxDistance: 10000,
      mediaConeInnerAngle: 360,
      mediaConeOuterAngle: 0,
      mediaConeOuterGain: 0
    };
    this.audioSettings = this.defaultSettings;
    this.mediaVideos = [];
    this.avatarAudioSources = [];

    this.sceneEl.addEventListener("reset_scene", this.onSceneReset);

    if (window.APP.store.state.preferences.audioOutputMode === "audio") {
      //hack to always reset to "panner"
      window.APP.store.update({
        preferences: { audioOutputMode: "panner" }
      });
    }
    if (window.APP.store.state.preferences.globalRolloffFactor !== 1.0) {
      //hack to always reset to 1.0
      window.APP.store.update({
        preferences: { globalRolloffFactor: 1.0 }
      });
    }

    this.audioOutputMode = window.APP.store.state.preferences.audioOutputMode;
    this.globalRolloffFactor = window.APP.store.state.preferences.globalRolloffFactor;
    this.onPreferenceChanged = () => {
      const { audioOutputMode, globalRolloffFactor } = window.APP.store.state.preferences;
      const shouldUpdateAudioSettings = this.audioOutputMode !== audioOutputMode || this.globalRolloffFactor !== globalRolloffFactor;
      this.audioOutputMode = audioOutputMode;
      this.globalRolloffFactor = globalRolloffFactor;
      if (shouldUpdateAudioSettings) {
        this.updateAudioSettings(this.audioSettings);
      }
    };
    window.APP.store.addEventListener("statechanged", this.onPreferenceChanged);
  }

  registerMediaAudioSource(mediaVideo) {
    const index = this.mediaVideos.indexOf(mediaVideo);
    if (index === -1) {
      this.mediaVideos.push(mediaVideo);
    }
    updateMediaAudioSettings(mediaVideo, this.audioSettings, this.globalRolloffFactor);
  }

  unregisterMediaAudioSource(mediaVideo) {
    this.mediaVideos.splice(this.mediaVideos.indexOf(mediaVideo), 1);
  }

  registerAvatarAudioSource(avatarAudioSource) {
    const index = this.avatarAudioSources.indexOf(avatarAudioSource);
    if (index === -1) {
      this.avatarAudioSources.push(avatarAudioSource);
    }
    const positional = window.APP.store.state.preferences.audioOutputMode !== "audio";
    updateAvatarAudioSettings(avatarAudioSource, this.audioSettings, positional, this.globalRolloffFactor);
  }

  unregisterAvatarAudioSource(avatarAudioSource) {
    const index = this.avatarAudioSources.indexOf(avatarAudioSource);
    if (index !== -1) {
      this.avatarAudioSources.splice(index, 1);
    }
  }

  updateAudioSettings(settings) {
    this.audioSettings = Object.assign({}, this.defaultSettings, settings);

    for (const mediaVideo of this.mediaVideos) {
      updateMediaAudioSettings(mediaVideo, settings, this.globalRolloffFactor);
    }

    const positional = window.APP.store.state.preferences.audioOutputMode !== "audio";
    for (const avatarAudioSource of this.avatarAudioSources) {
      updateAvatarAudioSettings(avatarAudioSource, settings, positional, this.globalRolloffFactor);
    }
  }

  onSceneReset = () => {
    this.updateAudioSettings(this.defaultSettings);
  };
}

AFRAME.registerComponent("use-audio-system-settings", {
  init() {
    this.onVideoLoaded = this.onVideoLoaded.bind(this);
    this.el.addEventListener("video-loaded", this.onVideoLoaded);
  },

  onVideoLoaded() {
    const audioSettingsSystem = this.el.sceneEl.systems["hubs-systems"].audioSettingsSystem;
    if (this.mediaVideo) {
      audioSettingsSystem.unregisterMediaAudioSource(this.mediaVideo);
    }
    this.mediaVideo = this.el.components["media-video"];
    audioSettingsSystem.registerMediaAudioSource(this.mediaVideo);
  },

  remove() {
    const audioSettingsSystem = this.el.sceneEl.systems["hubs-systems"].audioSettingsSystem;
    if (this.mediaVideo) {
      audioSettingsSystem.unregisterMediaAudioSource(this.mediaVideo);
    }
    this.el.removeEventListener("video-loaded", this.onVideoLoaded);
  }
});
