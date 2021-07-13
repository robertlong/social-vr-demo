import { AvatarAudioDefaults, MediaAudioDefaults } from "../components/audio-params";

function updateMediaAudioSettings(mediaVideo, settings) {
  mediaVideo.el.setAttribute("audio-params", {
    distanceModel: settings.mediaDistanceModel,
    rolloffFactor: settings.mediaRolloffFactor,
    refDistance: settings.mediaRefDistance,
    maxDistance: settings.mediaMaxDistance,
    coneInnerAngle: settings.mediaConeInnerAngle,
    coneOuterAngle: settings.mediaConeOuterAngle,
    coneOuterGain: settings.mediaConeOuterGain,
    gain: settings.mediaVolume
  });
}

function updateAvatarAudioSettings(avatarAudioSource, settings) {
  avatarAudioSource.el.setAttribute("audio-params", {
    distanceModel: settings.avatarDistanceModel,
    maxDistance: settings.avatarMaxDistance,
    refDistance: settings.avatarRefDistance,
    rolloffFactor: settings.avatarRolloffFactor,
    coneInnerAngle: settings.avatarConeInnerAngle,
    coneOuterAngle: settings.avatarConeOuterAngle,
    coneOuterGain: settings.avatarConeOuterGain
  });
}

export class AudioSettingsSystem {
  constructor(sceneEl) {
    this.sceneEl = sceneEl;
    this.defaultSettings = {
      avatarDistanceModel: AvatarAudioDefaults.DISTANCE_MODEL,
      avatarRolloffFactor: AvatarAudioDefaults.ROLLOFF_FACTOR,
      avatarRefDistance: AvatarAudioDefaults.REF_DISTANCE,
      avatarMaxDistance: AvatarAudioDefaults.MAX_DISTANCE,
      avatarConeInnerAngle: AvatarAudioDefaults.INNER_ANGLE,
      avatarConeOuterAngle: AvatarAudioDefaults.OUTER_ANGLE,
      avatarConeOuterGain: AvatarAudioDefaults.OUTER_GAIN,
      mediaVolume: MediaAudioDefaults.VOLUME,
      mediaDistanceModel: AvatarAudioDefaults.DISTANCE_MODEL,
      mediaRolloffFactor: AvatarAudioDefaults.ROLLOFF_FACTOR,
      mediaRefDistance: AvatarAudioDefaults.REF_DISTANCE,
      mediaMaxDistance: AvatarAudioDefaults.MAX_DISTANCE,
      mediaConeInnerAngle: AvatarAudioDefaults.INNER_ANGLE,
      mediaConeOuterAngle: AvatarAudioDefaults.OUTER_ANGLE,
      mediaConeOuterGain: AvatarAudioDefaults.OUTER_GAIN
    };
    this.audioSettings = this.defaultSettings;
    this.mediaVideos = [];
    this.avatarAudioSources = [];

    this.sceneEl.addEventListener("reset_scene", this.onSceneReset);

    if (
      !window.APP.store.state.preferences.audioOutputMode ||
      window.APP.store.state.preferences.audioOutputMode === "audio"
    ) {
      //hack to always reset to "panner"
      window.APP.store.update({
        preferences: { audioOutputMode: "panner" }
      });
    }
    if (window.APP.store.state.preferences.audioNormalization !== 0.0) {
      //hack to always reset to 0.0 (disabled)
      window.APP.store.update({
        preferences: { audioNormalization: 0.0 }
      });
    }

    this.audioOutputMode = window.APP.store.state.preferences.audioOutputMode;
    this.onPreferenceChanged = () => {
      const newPref = window.APP.store.state.preferences.audioOutputMode;
      const shouldUpdateAudioSettings = this.audioOutputMode !== newPref;
      this.audioOutputMode = newPref;
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
    updateMediaAudioSettings(mediaVideo, this.audioSettings);
  }

  unregisterMediaAudioSource(mediaVideo) {
    this.mediaVideos.splice(this.mediaVideos.indexOf(mediaVideo), 1);
  }

  registerAvatarAudioSource(avatarAudioSource) {
    const index = this.avatarAudioSources.indexOf(avatarAudioSource);
    if (index === -1) {
      this.avatarAudioSources.push(avatarAudioSource);
    }
    updateAvatarAudioSettings(avatarAudioSource, this.audioSettings);
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
      updateMediaAudioSettings(mediaVideo, settings);
    }

    for (const avatarAudioSource of this.avatarAudioSources) {
      updateAvatarAudioSettings(avatarAudioSource, settings);
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
