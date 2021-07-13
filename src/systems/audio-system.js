import { LogMessageType } from "../react-components/room/ChatSidebar";

export const MixerType = Object.freeze({
  AVATAR: 0,
  MEDIA: 1
});

let delayedReconnectTimeout = null;
function performDelayedReconnect(gainNode) {
  if (delayedReconnectTimeout) {
    clearTimeout(delayedReconnectTimeout);
  }

  delayedReconnectTimeout = setTimeout(() => {
    delayedReconnectTimeout = null;
    console.warn(
      "enableChromeAEC: recreate RTCPeerConnection loopback because the local connection was disconnected for 10s"
    );
    // eslint-disable-next-line no-use-before-define
    enableChromeAEC(gainNode);
  }, 10000);
}

import * as sdpTransform from "sdp-transform";

async function enableChromeAEC(gainNode) {
  /**
   *  workaround for: https://bugs.chromium.org/p/chromium/issues/detail?id=687574
   *  1. grab the GainNode from the scene's THREE.AudioListener
   *  2. disconnect the GainNode from the AudioDestinationNode (basically the audio out), this prevents hearing the audio twice.
   *  3. create a local webrtc connection between two RTCPeerConnections (see this example: https://webrtc.github.io/samples/src/content/peerconnection/pc1/)
   *  4. create a new MediaStreamDestination from the scene's THREE.AudioContext and connect the GainNode to it.
   *  5. add the MediaStreamDestination's track  to one of those RTCPeerConnections
   *  6. connect the other RTCPeerConnection's stream to a new audio element.
   *  All audio is now routed through Chrome's audio mixer, thus enabling AEC, while preserving all the audio processing that was performed via the WebAudio API.
   */

  const audioEl = new Audio();
  audioEl.setAttribute("autoplay", "autoplay");
  audioEl.setAttribute("playsinline", "playsinline");

  const context = THREE.AudioContext.getContext();
  const loopbackDestination = context.createMediaStreamDestination();
  const outboundPeerConnection = new RTCPeerConnection();
  const inboundPeerConnection = new RTCPeerConnection();

  const onError = e => {
    console.error("enableChromeAEC: RTCPeerConnection loopback initialization error", e);
  };

  outboundPeerConnection.addEventListener("icecandidate", e => {
    inboundPeerConnection.addIceCandidate(e.candidate).catch(onError);
  });
  outboundPeerConnection.addEventListener("iceconnectionstatechange", () => {
    console.warn(
      "enableChromeAEC: outboundPeerConnection state changed to " + outboundPeerConnection.iceConnectionState
    );
    if (outboundPeerConnection.iceConnectionState === "disconnected") {
      performDelayedReconnect(gainNode);
    }
    if (outboundPeerConnection.iceConnectionState === "connected") {
      if (delayedReconnectTimeout) {
        // The RTCPeerConnection reconnected by itself, cancel recreating the
        // local connection.
        clearTimeout(delayedReconnectTimeout);
      }
    }
  });

  inboundPeerConnection.addEventListener("icecandidate", e => {
    outboundPeerConnection.addIceCandidate(e.candidate).catch(onError);
  });
  inboundPeerConnection.addEventListener("iceconnectionstatechange", () => {
    console.warn("enableChromeAEC: inboundPeerConnection state changed to " + inboundPeerConnection.iceConnectionState);
    if (inboundPeerConnection.iceConnectionState === "disconnected") {
      performDelayedReconnect(gainNode);
    }
    if (inboundPeerConnection.iceConnectionState === "connected") {
      if (delayedReconnectTimeout) {
        // The RTCPeerConnection reconnected by itself, cancel recreating the
        // local connection.
        clearTimeout(delayedReconnectTimeout);
      }
    }
  });

  inboundPeerConnection.addEventListener("track", e => {
    audioEl.srcObject = e.streams[0];
  });

  try {
    //The following should never fail, but just in case, we won't disconnect/reconnect the gainNode unless all of this succeeds
    loopbackDestination.stream.getTracks().forEach(track => {
      outboundPeerConnection.addTrack(track, loopbackDestination.stream);
    });

    const offer = await outboundPeerConnection.createOffer();
    outboundPeerConnection.setLocalDescription(offer);
    await inboundPeerConnection.setRemoteDescription(offer);

    const answer = await inboundPeerConnection.createAnswer();

    // Rewrite SDP to be stereo and (variable) max bitrate
    const parsedSdp = sdpTransform.parse(answer.sdp);
    for (let i = 0; i < parsedSdp.media.length; i++) {
      for (let j = 0; j < parsedSdp.media[i].fmtp.length; j++) {
        parsedSdp.media[i].fmtp[j].config += `;stereo=1;cbr=0;maxaveragebitrate=510000;`;
      }
    }
    answer.sdp = sdpTransform.write(parsedSdp);

    inboundPeerConnection.setLocalDescription(answer);
    outboundPeerConnection.setRemoteDescription(answer);

    gainNode.disconnect();
    gainNode.connect(loopbackDestination);
  } catch (e) {
    onError(e);
  }
}

export class AudioSystem {
  constructor(sceneEl) {
    this._sceneEl = sceneEl;
    this._sceneEl.audioListener = this._sceneEl.audioListener || new THREE.AudioListener();
    if (this._sceneEl.camera) {
      this._sceneEl.camera.add(this._sceneEl.audioListener);
    }
    this._sceneEl.addEventListener("camera-set-active", evt => {
      evt.detail.cameraEl.getObject3D("camera").add(this._sceneEl.audioListener);
    });

    this.audioContext = THREE.AudioContext.getContext();
    this.audioNodes = new Map();
    this.mediaStreamDestinationNode = this.audioContext.createMediaStreamDestination();
    this.outboundStream = this.mediaStreamDestinationNode.stream;
    this.outboundGainNode = this.audioContext.createGain();
    this.outboundAnalyser = this.audioContext.createAnalyser();
    this.outboundAnalyser.fftSize = 32;
    this.analyserLevels = new Uint8Array(this.outboundAnalyser.fftSize);
    this.outboundGainNode.connect(this.outboundAnalyser);
    this.outboundAnalyser.connect(this.mediaStreamDestinationNode);
    this.audioContextNeedsToBeResumed = false;

    this.mixer = {
      [MixerType.AVATAR]: this.audioContext.createGain(),
      [MixerType.MEDIA]: this.audioContext.createGain()
    };
    this.mixer[MixerType.MEDIA].connect(this._sceneEl.audioListener.getInput());
    this.mixer[MixerType.AVATAR].connect(this._sceneEl.audioListener.getInput());

    // Webkit Mobile fix
    this._safariMobileAudioInterruptionFix();

    document.body.addEventListener("touchend", this._resumeAudioContext, false);
    document.body.addEventListener("mouseup", this._resumeAudioContext, false);

    this.onPrefsUpdated = this.updatePrefs.bind(this);
    window.APP.store.addEventListener("statechanged", this.onPrefsUpdated);
  }

  addStreamToOutboundAudio(id, mediaStream) {
    if (this.audioNodes.has(id)) {
      this.removeStreamFromOutboundAudio(id);
    }

    const sourceNode = this.audioContext.createMediaStreamSource(mediaStream);
    const gainNode = this.audioContext.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(this.outboundGainNode);
    this.audioNodes.set(id, { sourceNode, gainNode });
  }

  removeStreamFromOutboundAudio(id) {
    if (this.audioNodes.has(id)) {
      const nodes = this.audioNodes.get(id);
      nodes.sourceNode.disconnect();
      nodes.gainNode.disconnect();
      this.audioNodes.delete(id);
    }
  }

  addAudio(mixerTrack, audioNode) {
    this.removeAudio(audioNode);
    audioNode.getOutput().connect(this.mixer[mixerTrack]);
  }

  removeAudio(audioNode) {
    audioNode.getOutput().disconnect();
    audioNode.sourceType !== "empty" && audioNode.disconnect();
  }

  updatePrefs() {
    const { globalVoiceVolume, globalMediaVolume } = window.APP.store.state.preferences;
    let newGain = (globalMediaVolume !== undefined ? globalMediaVolume : 100) / 100;
    newGain = Math.max(0.001, newGain);
    this.mixer[MixerType.MEDIA].gain.exponentialRampToValueAtTime(newGain, this.audioContext.currentTime + 1);

    newGain = (globalVoiceVolume !== undefined ? globalVoiceVolume : 100) / 100;
    newGain = Math.max(0.001, newGain);
    this.mixer[MixerType.AVATAR].gain.exponentialRampToValueAtTime(newGain, this.audioContext.currentTime + 1);
  }

  /**
   * Chrome and Safari will start Audio contexts in a "suspended" state.
   * A user interaction (touch/mouse event) is needed in order to resume the AudioContext.
   */
  _resumeAudioContext = () => {
    this.audioContext.resume();

    setTimeout(() => {
      if (this.audioContext.state === "running") {
        const disableAEC = window.APP.store.state.preferences.disableEchoCancellation;
        if (!AFRAME.utils.device.isMobile() && /chrome/i.test(navigator.userAgent) && !disableAEC) {
          enableChromeAEC(this._sceneEl.audioListener.gain);
        }

        document.body.removeEventListener("touchend", this._resumeAudioContext, false);
        document.body.removeEventListener("mouseup", this._resumeAudioContext, false);
      }
    }, 0);
  };

  // Webkit mobile fix
  // https://stackoverflow.com/questions/10232908/is-there-a-way-to-detect-a-mobile-safari-audio-interruption-headphones-unplugg
  _safariMobileAudioInterruptionFix() {
    this.audioContext.onstatechange = () => {
      console.log(`AudioContext state changed to ${this.audioContext.state}`);
      if (this.audioContext.state === "suspended") {
        // When you unplug the headphone or when the bluetooth headset disconnects on
        // iOS Safari or Chrome, the state changes to suspended.
        // Chrome Android doesn't go in suspended state for this case.
        document.getElementById("avatar-rig").messageDispatch.log(LogMessageType.audioSuspended);
        document.body.addEventListener("touchend", this._resumeAudioContext, false);
        document.body.addEventListener("mouseup", this._resumeAudioContext, false);
        this.audioContextNeedsToBeResumed = true;
      } else if (this.audioContext.state === "running" && this.audioContextNeedsToBeResumed) {
        this.audioContextNeedsToBeResumed = false;
        document.getElementById("avatar-rig").messageDispatch.log(LogMessageType.audioResumed);
      }
    };
  }
}
