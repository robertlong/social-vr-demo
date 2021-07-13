import { Vector3 } from "three";
import { AudioNormalizer } from "../utils/audio-normalizer";
import { CLIPPING_THRESHOLD_ENABLED, CLIPPING_THRESHOLD_DEFAULT } from "../react-components/preferences-screen";

export const DISTANCE_MODEL_OPTIONS = ["linear", "inverse", "exponential"];

export const SourceType = Object.freeze({
  MEDIA_VIDEO: 0,
  AVATAR_AUDIO_SOURCE: 1,
  AVATAR_RIG: 2,
  AUDIO_TARGET: 3,
  AUDIO_ZONE: 4
});

export const AudioType = {
  Stereo: "stereo",
  PannerNode: "pannernode"
};

export const DistanceModelType = {
  Linear: "linear",
  Inverse: "inverse",
  Exponential: "exponential"
};

export const AvatarAudioDefaults = Object.freeze({
  DISTANCE_MODEL: DistanceModelType.Inverse,
  ROLLOFF_FACTOR: 2,
  REF_DISTANCE: 1,
  MAX_DISTANCE: 10000,
  INNER_ANGLE: 180,
  OUTER_ANGLE: 360,
  OUTER_GAIN: 0,
  VOLUME: 1.0
});

export const MediaAudioDefaults = Object.freeze({
  DISTANCE_MODEL: DistanceModelType.Inverse,
  ROLLOFF_FACTOR: 1,
  REF_DISTANCE: 1,
  MAX_DISTANCE: 10000,
  INNER_ANGLE: 360,
  OUTER_ANGLE: 0,
  OUTER_GAIN: 0,
  VOLUME: 0.5
});

export const TargetAudioDefaults = Object.freeze({
  DISTANCE_MODEL: DistanceModelType.Inverse,
  ROLLOFF_FACTOR: 5,
  REF_DISTANCE: 8,
  MAX_DISTANCE: 10000,
  INNER_ANGLE: 170,
  OUTER_ANGLE: 300,
  OUTER_GAIN: 0.3,
  VOLUME: 1.0
});

const MUTE_DELAY_SECS = 1;

const distanceModels = {
  linear: function(distance, rolloffFactor, refDistance, maxDistance) {
    return 1.0 - rolloffFactor * ((distance - refDistance) / (maxDistance - refDistance));
  },
  inverse: function(distance, rolloffFactor, refDistance) {
    return refDistance / (refDistance + rolloffFactor * (Math.max(distance, refDistance) - refDistance));
  },
  exponential: function(distance, rolloffFactor, refDistance) {
    return Math.pow(Math.max(distance, refDistance) / refDistance, -rolloffFactor);
  }
};

AFRAME.registerComponent("audio-params", {
  multiple: true,
  schema: {
    enabled: { default: true },
    debuggable: { default: true },
    isLocal: { default: false },
    position: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    orientation: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    distanceModel: { default: AvatarAudioDefaults.DISTANCE_MODEL, oneOf: [DISTANCE_MODEL_OPTIONS] },
    rolloffFactor: { default: AvatarAudioDefaults.ROLLOFF_FACTOR },
    refDistance: { default: AvatarAudioDefaults.REF_DISTANCE },
    maxDistance: { default: AvatarAudioDefaults.MAX_DISTANCE },
    coneInnerAngle: { default: AvatarAudioDefaults.INNER_ANGLE },
    coneOuterAngle: { default: AvatarAudioDefaults.OUTER_ANGLE },
    coneOuterGain: { default: AvatarAudioDefaults.OUTER_GAIN },
    clippingEnabled: { default: CLIPPING_THRESHOLD_ENABLED },
    clippingThreshold: { default: CLIPPING_THRESHOLD_DEFAULT },
    preClipGain: { default: 1.0 },
    isClipped: { default: false },
    gain: { default: 1.0 },
    sourceType: { default: -1 },
    attenuation: { default: 1.0 },
    distance: { default: 0.0 },
    squaredDistance: { default: 0.0 }
  },

  init() {
    this.audioRef = null;
    this.avatarRigPosition = new THREE.Vector3();
    this.avatarAudio = {
      panner: {
        orientationX: {
          value: 0
        },
        orientationY: {
          value: 0
        },
        orientationZ: {
          value: 0
        },
        positionX: {
          value: 0
        },
        positionY: {
          value: 0
        },
        positionZ: {
          value: 0
        },
        distanceModel: AvatarAudioDefaults.DISTANCE_MODEL,
        maxDistance: AvatarAudioDefaults.MAX_DISTANCE,
        refDistance: AvatarAudioDefaults.REF_DISTANCE,
        rolloffFactor: AvatarAudioDefaults.ROLLOFF_FACTOR,
        coneInnerAngle: AvatarAudioDefaults.INNER_ANGLE,
        coneOuterAngle: AvatarAudioDefaults.OUTER_ANGLE,
        coneOuterGain: AvatarAudioDefaults.OUTER_GAIN
      }
    };
    this.avatarRigOrientation = new THREE.Vector3(0, 0, -1);
    this.listenerPos = new THREE.Vector3();
    this.data.position = new Vector3(0.0, 0.0, 0.0);
    this.data.orientation = new Vector3(0.0, 0.0, 0.0);
    this.normalizer = null;
    this.el.sceneEl?.systems["audio-debug"].registerSource(this);
    if (!this.data.isLocal) {
      this.el.sceneEl?.systems["hubs-systems"].gainSystem.registerSource(this);
    }

    const { enableAudioClipping, audioClippingThreshold } = window.APP.store.state.preferences;
    this.data.clippingEnabled = enableAudioClipping !== undefined ? enableAudioClipping : CLIPPING_THRESHOLD_ENABLED;
    this.data.clippingThreshold =
      audioClippingThreshold !== undefined ? audioClippingThreshold : CLIPPING_THRESHOLD_DEFAULT;

    this.onSourceSetAdded = this.sourceSetAdded.bind(this);
    if (this.data.isLocal) {
      this.data.sourceType = SourceType.AVATAR_RIG;
    } else if (this.el.components["media-video"]) {
      this.data.sourceType = SourceType.MEDIA_VIDEO;
    } else if (this.el.components["avatar-audio-source"]) {
      this.data.sourceType = SourceType.AVATAR_AUDIO_SOURCE;
    } else if (this.el.components["audio-target"]) {
      this.data.sourceType = SourceType.AUDIO_TARGET;
    } else if (this.el.components["audio-zone"]) {
      this.data.sourceType = SourceType.AUDIO_ZONE;
    }
    this.audioSettings = this.el.sceneEl.systems["hubs-systems"].audioSettingsSystem.audioSettings;
    this.avatarRigObj = document.getElementById("avatar-rig").querySelector(".camera").object3D;
  },

  remove() {
    this.normalizer = null;
    this.el.sceneEl?.systems["audio-debug"].unregisterSource(this);
    if (!this.data.isLocal) {
      this.el.sceneEl?.systems["hubs-systems"].gainSystem.unregisterSource(this);
    }

    if (this.data.sourceType === SourceType.AVATAR_AUDIO_SOURCE) {
      this.el.components["avatar-audio-source"].el.removeEventListener("sound-source-set", this.onSourceSetAdded);
    }
  },

  update() {
    if (this.audioRef) {
      this.audioRef.setDistanceModel(this.data.distanceModel);
      this.audioRef.setRolloffFactor(this.data.rolloffFactor);
      this.audioRef.setRefDistance(this.data.refDistance);
      this.audioRef.setMaxDistance(this.data.maxDistance);
      this.audioRef.panner.coneInnerAngle = this.data.coneInnerAngle;
      this.audioRef.panner.coneOuterAngle = this.data.coneOuterAngle;
      this.audioRef.panner.coneOuterGain = this.data.coneOuterGain;
      this.data.gain && this.updateGain(this.data.gain);
    }
  },

  tick() {
    const audio = this.getAudio();
    if (audio) {
      this.data.position = new THREE.Vector3(
        audio.panner.positionX.value,
        audio.panner.positionY.value,
        audio.panner.positionZ.value
      );
      this.data.orientation = new THREE.Vector3(
        audio.panner.orientationX.value,
        audio.panner.orientationY.value,
        audio.panner.orientationZ.value
      );
      this.data.distanceModel = audio.panner.distanceModel;
      this.data.rolloffFactor = audio.panner.rolloffFactor;
      this.data.refDistance = audio.panner.refDistance;
      this.data.maxDistance = audio.panner.maxDistance;
      this.data.coneInnerAngle = audio.panner.coneInnerAngle;
      this.data.coneOuterAngle = audio.panner.coneOuterAngle;
      this.data.coneOuterGain = audio.panner.coneOuterGain;
      this.updateDistances();
      this.updateAttenuation();
    }

    if (this.normalizer !== null) {
      this.normalizer.apply();
    } else {
      // We one only enable the Normalizer for avatar-audio-source components
      if (this.data.sourceType === SourceType.AVATAR_AUDIO_SOURCE) {
        this.enableNormalizer();
      }
    }
  },

  getAudio: (function() {
    const worldQuat = new THREE.Quaternion();

    return function() {
      switch (this.data.sourceType) {
        case SourceType.AVATAR_RIG: {
          // Create fake parametes for the avatar rig as it doens't have an audio source.
          const audioParams = this.audioSettings;
          this.avatarRigObj.updateMatrixWorld(true);
          this.avatarRigObj.getWorldPosition(this.avatarRigPosition);
          this.avatarRigOrientation.set(0, 0, -1);
          this.avatarRigObj.getWorldQuaternion(worldQuat);
          this.avatarRigOrientation.applyQuaternion(worldQuat);
          return {
            panner: {
              orientationX: {
                value: this.avatarRigOrientation.x
              },
              orientationY: {
                value: this.avatarRigOrientation.y
              },
              orientationZ: {
                value: this.avatarRigOrientation.z
              },
              positionX: {
                value: this.avatarRigPosition.x
              },
              positionY: {
                value: this.avatarRigPosition.y
              },
              positionZ: {
                value: this.avatarRigPosition.z
              },
              distanceModel: audioParams.avatarDistanceModel,
              maxDistance: audioParams.avatarMaxDistance,
              refDistance: audioParams.avatarRefDistance,
              rolloffFactor: audioParams.avatarRolloffFactor,
              coneInnerAngle: audioParams.avatarConeInnerAngle,
              coneOuterAngle: audioParams.avatarConeOuterAngle,
              coneOuterGain: audioParams.avatarConeOuterGain
            }
          };
        }
        case SourceType.MEDIA_VIDEO:
        case SourceType.AVATAR_AUDIO_SOURCE:
        case SourceType.AUDIO_TARGET: {
          return this.audioRef?.panner ? this.audioRef : null;
        }
      }

      return null;
    };
  })(),

  setAudio(audio) {
    this.audioRef = audio;
  },

  enableNormalizer() {
    const audio = this.getAudio();
    if (audio) {
      const avatarAudioSource = this.el.components["avatar-audio-source"];
      if (avatarAudioSource) {
        this.normalizer = new AudioNormalizer(audio);
        avatarAudioSource.el.addEventListener("sound-source-set", this.onSourceSetAdded);
      }
    }
  },

  sourceSetAdded() {
    const avatarAudioSource = this.el.components["avatar-audio-source"];
    const audio = avatarAudioSource && avatarAudioSource.el.getObject3D(avatarAudioSource.attrName);
    if (audio) {
      this.normalizer = new AudioNormalizer(audio);
      this.normalizer.apply();
    }
  },

  updateDistances() {
    this.el.sceneEl.audioListener.getWorldPosition(this.listenerPos);
    this.data.distance = this.data.position.distanceTo(this.listenerPos);
    this.data.squaredDistance = this.data.position.distanceToSquared(this.listenerPos);
  },

  updateAttenuation() {
    this.data.attenuation = distanceModels[this.data.distanceModel](
      this.data.distance,
      this.data.rolloffFactor,
      this.data.refDistance,
      this.data.maxDistance
    );
  },

  clipGain(gain) {
    if (!this.data.isClipped) {
      const audio = this.getAudio();
      this.data.isClipped = true;
      this.data.preClipGain = this.data.gain;
      this.data.gain = gain;
      this.data.gain = Math.max(0.001, this.data.gain);
      audio.gain.gain.exponentialRampToValueAtTime(this.data.gain, audio.context.currentTime + MUTE_DELAY_SECS);
    }
  },

  unclipGain() {
    if (this.data.isClipped) {
      const audio = this.getAudio();
      this.data.isClipped = false;
      this.data.gain = this.data.preClipGain;
      this.data.gain = Math.max(0.001, this.data.gain);
      audio?.gain?.gain.exponentialRampToValueAtTime(this.data.gain, audio.context.currentTime + MUTE_DELAY_SECS);
    }
  },

  updateGain(newGain) {
    const audio = this.getAudio();
    if (!audio) return;

    this.data.gain = Math.max(0.001, newGain);
    let gainFilter;
    switch (this.data.sourceType) {
      case SourceType.MEDIA_VIDEO: {
        gainFilter = this.el.components["media-video"].getGainFilter();
        break;
      }
      case SourceType.AVATAR_AUDIO_SOURCE: {
        gainFilter = this.el.components["avatar-audio-source"].getGainFilter();
        break;
      }
      case SourceType.AUDIO_TARGET: {
        gainFilter = this.el.components["audio-target"].getGainFilter();
        break;
      }
    }
    const { audioOutputMode } = window.APP.store.state.preferences;
    if (audioOutputMode === "audio") {
      this.data.gain = this.data.gain * Math.min(1, 10 / Math.max(1, this.data.squaredDistance));
    }
    gainFilter?.gain.exponentialRampToValueAtTime(this.data.gain, audio.context.currentTime + MUTE_DELAY_SECS);
  },

  updateClipping() {
    const { clippingEnabled, clippingThreshold } = window.APP.store.state.preferences;
    this.data.clippingEnabled = clippingEnabled !== undefined ? clippingEnabled : CLIPPING_THRESHOLD_ENABLED;
    this.data.clippingThreshold = clippingThreshold !== undefined ? clippingThreshold : CLIPPING_THRESHOLD_DEFAULT;
  }
});
