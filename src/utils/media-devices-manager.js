const isMobile = AFRAME.utils.device.isMobile();
const isMobileVR = AFRAME.utils.device.isMobileVR();
const isFirefoxReality = isMobileVR && navigator.userAgent.match(/Firefox/);
import { detectOS, detect } from "detect-browser";

// This is a list of regexes that match the microphone labels of HMDs.
//
// If entering VR mode, and if any of these regexes match an audio device,
// the user will be prevented from entering VR until one of those devices is
// selected as the microphone.
//
// Note that this doesn't have to be exhaustive: if no devices match any regex
// then we rely upon the user to select the proper mic.
const HMD_MIC_REGEXES = [/\Wvive\W/i, /\Wrift\W/i];

const IOS_MUTED_HACK_MIN_VERSION = 13;
const detectedOS = detectOS(navigator.userAgent);
const browser = detect();

export default class MediaDevicesManager {
  constructor(scene, store, audioSystem) {
    this._scene = scene;
    this._store = store;
    this._micDevices = [];
    this._videoDevices = [];
    this._deviceId = null;
    this._audioTrack = null;
    this.audioSystem = audioSystem;
    this._mediaStream = audioSystem.outboundStream;

    navigator.mediaDevices.addEventListener("devicechange", this.onDeviceChange);
  }

  get deviceId() {
    return this._deviceId;
  }

  set deviceId(deviceId) {
    this._deviceId = deviceId;
  }

  get audioTrack() {
    return this._audioTrack;
  }

  set audioTrack(audioTrack) {
    this._audioTrack = audioTrack;
  }

  get micDevices() {
    return this._micDevices;
  }

  set micDevices(micDevices) {
    this._micDevices = micDevices;
  }

  get videoDevices() {
    return this._videoDevices;
  }

  set videoDevices(videoDevices) {
    this._videoDevices = videoDevices;
  }

  get mediaStream() {
    return this._mediaStream;
  }

  set mediaStream(mediaStream) {
    this._mediaStream = mediaStream;
  }

  get selectedMicLabel() {
    return this.micLabelForAudioTrack(this.audioTrack);
  }

  get selectedMicDeviceId() {
    return this.micDeviceIdForMicLabel(this.selectedMicLabel);
  }

  get lastUsedMicDeviceId() {
    const { lastUsedMicDeviceId } = this._store.state.settings;
    return lastUsedMicDeviceId;
  }

  get isMicShared() {
    return this.audioTrack !== null;
  }

  get isVideoShared() {
    return this._mediaStream?.getVideoTracks().length > 0;
  }

  onDeviceChange = () => {
    this.fetchMediaDevices().then(() => {
      this._scene.emit("devicechange", null);
    });
  };

  async fetchMediaDevices() {
    return new Promise(resolve => {
      navigator.mediaDevices.enumerateDevices().then(mediaDevices => {
        this.micDevices = mediaDevices
          .filter(d => d.kind === "audioinput")
          .map(d => ({ value: d.deviceId, label: d.label || `Mic Device (${d.deviceId.substr(0, 9)})` }));
        this.videoDevices = mediaDevices
          .filter(d => d.kind === "videoinput")
          .map(d => ({ value: d.deviceId, label: d.label || `Camera Device (${d.deviceId.substr(0, 9)})` }));
        resolve();
      });
    });
  }

  async startMicShare(deviceId) {
    let constraints = { audio: {} };
    if (deviceId) {
      constraints = { audio: { deviceId: { exact: [deviceId] } } };
    }

    const result = await this._startMicShare(constraints);

    await this.fetchMediaDevices();

    // we should definitely have an audioTrack at this point unless they denied mic access
    if (this.audioTrack) {
      const micDeviceId = this.micDeviceIdForMicLabel(this.micLabelForAudioTrack(this.audioTrack));
      if (micDeviceId) {
        this._store.update({ settings: { lastUsedMicDeviceId: micDeviceId } });
        console.log(`Selected input device: ${this.micLabelForDeviceId(micDeviceId)}`);
      }
      this._scene.emit("local-media-stream-created");
    } else {
      console.log("No available audio tracks");
    }

    await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
    NAF.connection.adapter.enableMicrophone(!this._scene.is("muted"));

    return result;
  }

  async startLastUsedMicShare() {
    return await this.startMicShare(this.lastUsedMicDeviceId);
  }

  async _startMicShare(constraints = { audio: {} }) {
    if (this.audioTrack) {
      this.audioTrack.stop();
    }

    constraints.audio.echoCancellation = this._store.state.preferences.disableEchoCancellation === true ? false : true;
    constraints.audio.noiseSuppression = this._store.state.preferences.disableNoiseSuppression === true ? false : true;
    constraints.audio.autoGainControl = this._store.state.preferences.disableAutoGainControl === true ? false : true;

    if (isFirefoxReality) {
      //workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1626081
      constraints.audio.echoCancellation =
        this._store.state.preferences.disableEchoCancellation === false ? true : false;
      constraints.audio.noiseSuppression =
        this._store.state.preferences.disableNoiseSuppression === false ? true : false;
      constraints.audio.autoGainControl = this._store.state.preferences.disableAutoGainControl === false ? true : false;

      this._store.update({
        preferences: {
          disableEchoCancellation: !constraints.audio.echoCancellation,
          disableNoiseSuppression: !constraints.audio.noiseSuppression,
          disableAutoGainControl: !constraints.audio.autoGainControl
        }
      });
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioSystem.addStreamToOutboundAudio("microphone", newStream);
      this.audioTrack = newStream.getAudioTracks()[0];
      this.audioTrack.addEventListener("ended", () => {
        this._scene.emit("action_end_mic_sharing");
      });

      this._iOSTrackMutedHack();

      if (/Oculus/.test(navigator.userAgent)) {
        // HACK Oculus Browser 6 seems to randomly end the microphone audio stream. This re-creates it.
        // Note the ended event will only fire if some external event ends the stream, not if we call stop().
        const recreateAudioStream = async () => {
          console.warn(
            "Oculus Browser 6 bug hit: Audio stream track ended without calling stop. Recreating audio stream."
          );

          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          this.audioTrack = newStream.getAudioTracks()[0];

          this._iOSTrackMutedHack();

          this.audioSystem.addStreamToOutboundAudio("microphone", newStream);

          this._scene.emit("local-media-stream-created");

          this.audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
        };

        this.audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
      }

      return true;
    } catch (e) {
      // Error fetching audio track, most likely a permission denial.
      console.error("Error during getUserMedia: ", e);
      this.audioTrack = null;
      return false;
    }
  }

  /**
   * Webkit issue on iOS>13: https://bugs.webkit.org/show_bug.cgi?id=213853
   */
  _iOSTrackMutedHack() {
    const iOSVersion = parseInt(browser.version.split(".")[0]);
    if (
      ["iOS", "Mac OS"].includes(detectedOS) &&
      ["safari", "ios"].includes(browser.name) &&
      iOSVersion >= IOS_MUTED_HACK_MIN_VERSION
    ) {
      this.audioTrack.onmute = this._muteStateChanged;
      this.audioTrack.onunmute = this._muteStateChanged;
    }
  }

  _muteStateChanged() {
    if (this._audioTrack && this._audioTrack.muted) {
      if (!this.reconnectIfUnmuted) {
        this.wasMicEnabledBeforeMute = NAF.connection.adapter.micEnabled;
        NAF.connection.adapter.enableMicrophone(false);
      }
      this.reconnectIfUnmuted = true;
    } else {
      if (this.reconnectIfUnmuted) {
        this.reconnectIfUnmuted = false;
        this.setMediaStreamToDefault();
        if (this.wasMicEnabledBeforeMute) {
          NAF.connection.adapter.enableMicrophone(true);
        }
      }
    }
  }

  async stopMicShare() {
    this.audioSystem.removeStreamFromOutboundAudio("microphone");

    this.audioTrack?.stop();
    this.audioTrack = null;

    await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
    NAF.connection.adapter.enableMicrophone(false);
  }

  async startVideoShare(constraints, isDisplayMedia, target, success, error) {
    let newStream;
    let videoTrackAdded = false;

    try {
      if (isDisplayMedia) {
        newStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      } else {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      const videoTracks = newStream ? newStream.getVideoTracks() : [];
      if (videoTracks.length > 0) {
        videoTrackAdded = true;

        newStream.getVideoTracks().forEach(track => {
          // Ideally we would use track.contentHint but it seems to be read-only in Chrome so we just add a custom property
          track["_hubs_contentHint"] = isDisplayMedia ? "share" : "camera";
          track.addEventListener("ended", () => {
            this._scene.emit("action_end_video_sharing");
          });
          this._mediaStream.addTrack(track);
        });

        if (newStream && newStream.getAudioTracks().length > 0) {
          this.audioSystem.addStreamToOutboundAudio("screenshare", newStream);
        }

        await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
      }
    } catch (e) {
      error(e);
      this._scene.emit("action_end_video_sharing");
      return;
    }

    success(isDisplayMedia, videoTrackAdded, target);
  }

  async stopVideoShare() {
    if (!this._mediaStream) return;

    for (const track of this._mediaStream.getVideoTracks()) {
      track.stop(); // Stop video track to remove the "Stop screen sharing" bar right away.
      this._mediaStream.removeTrack(track);
    }

    this.audioSystem.removeStreamFromOutboundAudio("screenshare");

    await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
  }

  async shouldShowHmdMicWarning() {
    if (isMobile || AFRAME.utils.device.isMobileVR()) return false;
    if (!this.state.enterInVR) return false;
    if (!this.hasHmdMicrophone()) return false;

    return !HMD_MIC_REGEXES.find(r => this.selectedMicLabel.match(r));
  }

  micLabelForAudioTrack(audioTrack) {
    return (audioTrack && audioTrack.label) || "";
  }

  micDeviceIdForMicLabel(label) {
    return this.micDevices.filter(d => d.label === label).map(d => d.value)[0];
  }

  micLabelForDeviceId(deviceId) {
    return this.micDevices.filter(d => d.value === deviceId).map(d => d.label)[0];
  }

  hasHmdMicrophone() {
    return !!this.state.micDevices.find(d => HMD_MIC_REGEXES.find(r => d.label.match(r)));
  }

  videoDeviceIdForMicLabel(label) {
    return this.videoDevices.filter(d => d.label === label).map(d => d.value)[0];
  }

  videoLabelForDeviceId(deviceId) {
    return this.videoDevices.filter(d => d.value === deviceId).map(d => d.label)[0];
  }
}
