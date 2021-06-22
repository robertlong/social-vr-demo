import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import { getBackend } from "@tensorflow/tfjs-core";
import * as bodyPix from "@tensorflow-models/body-pix";
import { cpuBlur } from "@tensorflow-models/body-pix/dist/blur";
import { getInputSize } from "@tensorflow-models/body-pix/dist/util";

function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

const isMobile = AFRAME.utils.device.isMobile();
const isMobileVR = AFRAME.utils.device.isMobileVR();
const isFirefoxReality = isMobileVR && navigator.userAgent.match(/Firefox/);

// This is a list of regexes that match the microphone labels of HMDs.
//
// If entering VR mode, and if any of these regexes match an audio device,
// the user will be prevented from entering VR until one of those devices is
// selected as the microphone.
//
// Note that this doesn't have to be exhaustive: if no devices match any regex
// then we rely upon the user to select the proper mic.
const HMD_MIC_REGEXES = [/\Wvive\W/i, /\Wrift\W/i];

export const FilterType = Object.freeze({
  NONE: 0,
  MASK: 1,
  BACKGROUND_BLUR: 2,
  REPLACE_BACKGROUND: 3,
  BLUR_FACE: 4
});

const BODY_PIX_OPTIONS = {
  multiplier: isMobile ? 0.5 : 0.75,
  stride: 32,
  quantBytes: 4
};

const SEGMENT_PERSON_OPTIONS = {
  flipHorizontal: false,
  internalResolution: "high",
  segmentationThreshold: 0.7,
  maxDetections: 1
};

// Common
const FLIP_HORIZONTAL = false;

// drawBokehEffect
const BACKGROUND_BLUR_AMUNT = 3;
const EDGE_BLUR_AMUNT = 2;

// drawPixelatedMask
const BLUR_FACE_OPTIONS = {
  opacity: 0.7,
  maskBlurAmount: 0,
  flipHorizontal: false,
  pixelCellWidth: 10.0
};

// drawMask
const MASK_OPACITY = 0.7;
const MASK_BLUR_AMOUNT = 10;

const applyEffectBokeh = async (src, dst, segmentation) => {
  bodyPix.drawBokehEffect(dst, src, segmentation, BACKGROUND_BLUR_AMUNT, EDGE_BLUR_AMUNT, FLIP_HORIZONTAL);
};

const applyEffectPassthrough = async (src, dst) => {
  dst.getContext("2d").drawImage(src, 0, 0, dst.width, dst.height);
};

const applyEffectMask = async (src, dst, segmentation) => {
  const coloredPartImage = await bodyPix.toMask(segmentation);
  // dst.putImageData(coloredPartImage, 0, 0);
  bodyPix.drawMask(dst, src, coloredPartImage, MASK_OPACITY, MASK_BLUR_AMOUNT, FLIP_HORIZONTAL);
};

function flipCanvasHorizontal(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);
}

const offScreenCanvases = [];

function createOffScreenCanvas() {
  if (typeof document !== "undefined") {
    return document.createElement("canvas");
  } else if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(0, 0);
  } else {
    throw new Error("Cannot create a canvas in this context");
  }
}

function ensureOffscreenCanvasCreated(id) {
  if (!offScreenCanvases[id]) {
    offScreenCanvases[id] = createOffScreenCanvas();
  }
  return offScreenCanvases[id];
}

function renderImageToCanvas(image, canvas) {
  const { width, height } = image;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0, width, height);
}

function drawAndBlurImageOnCanvas(image, blurAmount, canvas) {
  const { height, width } = image;
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (isSafari()) {
    cpuBlur(canvas, image, blurAmount);
  } else {
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.restore();
}

function drawAndBlurImageOnOffScreenCanvas(image, blurAmount, offscreenCanvasName) {
  const canvas = ensureOffscreenCanvasCreated(offscreenCanvasName);
  if (blurAmount === 0) {
    renderImageToCanvas(image, canvas);
  } else {
    drawAndBlurImageOnCanvas(image, blurAmount, canvas);
  }
  return canvas;
}

function renderImageDataToCanvas(image, canvas) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");

  ctx.putImageData(image, 0, 0);
}

function renderImageDataToOffScreenCanvas(image, canvasName) {
  const canvas = ensureOffscreenCanvasCreated(canvasName);
  renderImageDataToCanvas(image, canvas);

  return canvas;
}

function createPersonMask(multiPersonSegmentation, edgeBlurAmount) {
  const backgroundMaskImage = bodyPix.toMask(
    multiPersonSegmentation,
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 0, g: 0, b: 0, a: 0 }
  );

  const backgroundMask = renderImageDataToOffScreenCanvas(backgroundMaskImage, "mask");
  if (edgeBlurAmount === 0) {
    return backgroundMask;
  } else {
    return drawAndBlurImageOnOffScreenCanvas(backgroundMask, edgeBlurAmount, "blurred-mask");
  }
}

function drawWithCompositing(ctx, image, compositeOperation) {
  ctx.globalCompositeOperation = compositeOperation;
  ctx.drawImage(image, 0, 0);
}

const applyEffectReplaceBackground = (src, dst, background, multiPersonSegmentation) => {
  if (!background) return;

  const ctx = dst.getContext("2d");

  if (Array.isArray(multiPersonSegmentation) && multiPersonSegmentation.length === 0) {
    ctx.drawImage(background, 0, 0);
    return;
  }

  const personMask = createPersonMask(multiPersonSegmentation, EDGE_BLUR_AMUNT);

  ctx.save();
  if (FLIP_HORIZONTAL) {
    flipCanvasHorizontal(dst);
  }
  // draw the original image on the final canvas
  const [height, width] = getInputSize(src);
  ctx.drawImage(src, 0, 0, width, height);

  // "destination-in" - "The existing canvas content is kept where both the
  // new shape and existing canvas content overlap. Everything else is made
  // transparent."
  // crop what's not the person using the mask from the original image
  drawWithCompositing(ctx, personMask, "destination-in");

  // Scale to height
  const s = Math.max(dst.width / background.width, dst.height / background.height);
  // Scale to fit
  // const s = Math.min(dst.width / background.width, dst.height / background.height);
  ctx.scale(s, s);
  // "destination-over" - "The existing canvas content is kept where both the

  // new shape and existing canvas content overlap. Everything else is made
  // transparent."
  // draw the blurred background on top of the original image where it doesn't
  // overlap.
  drawWithCompositing(ctx, background, "destination-over");
  ctx.restore();
};

const rainbow = new Array(24).fill([120, 120, 120]);

const applyEffectBlurFace = (src, dst, multiPersonSegmentation) => {
  const coloredPartImage = bodyPix.toColoredPartMask(multiPersonSegmentation, rainbow);
  bodyPix.drawPixelatedMask(
    dst,
    src,
    coloredPartImage,
    BLUR_FACE_OPTIONS.opacity,
    BLUR_FACE_OPTIONS.maskBlurAmount,
    BLUR_FACE_OPTIONS.flipHorizontal,
    BLUR_FACE_OPTIONS.pixelCellWidth
  );
};

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
    this._videoStream = null;;

    this._filterType = FilterType.NONE;
    this._dstCanvas = null;
    this._srcVideo = null;
    this._net = null;
    this._backgroundUrl = null;
    this._backgroundImagesCache = {};

    this._filter = {
      [FilterType.NONE]: () => {
        applyEffectPassthrough(this._srcVideo, this._dstCanvas);
      },
      [FilterType.MASK]: async () => {
        const segmentation = await this._net.segmentPerson(this._srcVideo, SEGMENT_PERSON_OPTIONS);
        applyEffectMask(this._srcVideo, this._dstCanvas, segmentation);
      },
      [FilterType.BACKGROUND_BLUR]: async () => {
        const segmentation = await this._net.segmentPerson(this._srcVideo, SEGMENT_PERSON_OPTIONS);
        applyEffectBokeh(this._srcVideo, this._dstCanvas, segmentation);
      },
      [FilterType.REPLACE_BACKGROUND]: async () => {
        if (this._backgroundImagesCache[this._backgroundUrl]) {
          const segmentation = await this._net.segmentPerson(this._srcVideo, SEGMENT_PERSON_OPTIONS);
          applyEffectReplaceBackground(
            this._srcVideo,
            this._dstCanvas,
            this._backgroundImagesCache[this._backgroundUrl],
            segmentation
          );
        } else if (this._backgroundUrl) {
          const backgroundImage = new Image();
          backgroundImage.onload = async () => {
            this._backgroundImagesCache[this._backgroundUrl] = backgroundImage;
            const segmentation = await this._net.segmentPerson(this._srcVideo, {
              maxDetections: 1
            });
            applyEffectReplaceBackground(
              this._srcVideo,
              this._dstCanvas,
              this._backgroundImagesCache[this._backgroundUrl],
              segmentation
            );
          };
          backgroundImage.src = this._backgroundUrl;
        } else {
          throw new Error("Camera filter error: No background set");
        }
      },
      [FilterType.BLUR_FACE]: async () => {
        const segmentation = await this._net.segmentPersonParts(this._srcVideo, SEGMENT_PERSON_OPTIONS);
        segmentation.allPoses[0].keypoints = segmentation.allPoses[0].keypoints.splice(0, 5);
        applyEffectBlurFace(this._srcVideo, this._dstCanvas, segmentation);
      }
    };

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

    NAF.connection.adapter.enableMicrophone(true);

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

      if (/Oculus/.test(navigator.userAgent)) {
        // HACK Oculus Browser 6 seems to randomly end the microphone audio stream. This re-creates it.
        // Note the ended event will only fire if some external event ends the stream, not if we call stop().
        const recreateAudioStream = async () => {
          console.warn(
            "Oculus Browser 6 bug hit: Audio stream track ended without calling stop. Recreating audio stream."
          );

          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          this.audioTrack = newStream.getAudioTracks()[0];

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

  async stopMicShare() {
    this.audioSystem.removeStreamFromOutboundAudio("microphone");

    this.audioTrack?.stop();
    this.audioTrack = null;

    this._scene.emit("action_mute");

    NAF.connection.adapter.enableMicrophone(false);
    await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
  }

  async applyFilter() {
    if (!this.isVideoShared) return;

    if (this._srcVideo.width > 0 && this._srcVideo.height > 0) {
      this._filter[this._filterType]();
    }

    requestAnimationFrame(this.applyFilter.bind(this));
  }

  async initFilter(stream, frameRate) {
    await tf.setBackend("webgl");
    console.info(`Using Tensorflow backend: ${getBackend()}`);

    this._net = await bodyPix.load(BODY_PIX_OPTIONS);

    this._dstCanvas = document.createElement("canvas");
    // FF complaints about the canvas not being initialized if we don't access the context before captureStream
    this._dstCanvas.getContext("2d");
    this._srcVideo = document.createElement("video");
    this._srcVideo.onresize = () => {
      this._srcVideo.width = this._srcVideo.videoWidth;
      this._srcVideo.height = this._srcVideo.videoHeight;
      this._dstCanvas.width = this._srcVideo.videoWidth;
      this._dstCanvas.height = this._srcVideo.videoHeight;
    };
    this._srcVideo.onplaying = async () => {
      const newStream = this._dstCanvas.captureStream(frameRate);
      await this.updateVideoStream(newStream, false);
      await this.applyFilter(this._net);
    };
    this._srcVideo.srcObject = stream;
    this._srcVideo.play();
  }

  switchFilter({ type, src }) {
    this._filterType = type;
    this._backgroundUrl = src;
  }

  async startVideoShare(constraints, isDisplayMedia, target, success, error) {
    try {
      if (isDisplayMedia) {
        this._videoStream = await navigator.mediaDevices.getDisplayMedia(constraints);
        const isAdded = await this.updateVideoStream(this._videoStream, isDisplayMedia);
        success(isDisplayMedia, isAdded, target);
      } else {
        this._videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        await this.initFilter(this._videoStream, constraints.video.frameRate);
        success(false, true, target);
      }
    } catch (e) {
      error(e);
      this._scene.emit("action_end_video_sharing");
      return;
    }
  }

  async updateVideoStream(stream, isDisplayMedia) {
    let videoTrackAdded = false;
    const videoTracks = stream ? stream.getVideoTracks() : [];
    if (videoTracks.length > 0) {
      videoTrackAdded = true;
      stream.getVideoTracks().forEach(track => {
        // Ideally we would use track.contentHint but it seems to be read-only in Chrome so we just add a custom property
        track["_hubs_contentHint"] = isDisplayMedia ? "share" : "camera";
        track.addEventListener("ended", () => {
          this._scene.emit("action_end_video_sharing");
        });
        this._mediaStream.addTrack(track);
      });

      if (stream && stream.getAudioTracks().length > 0) {
        this.audioSystem.addStreamToOutboundAudio("screenshare", stream);
      }

      await NAF.connection.adapter.setLocalMediaStream(this._mediaStream);
    }

    return videoTrackAdded;
  }

  async stopVideoShare() {
    if (!this._mediaStream) return;

    if (this._videoStream) {
      for (const track of this._videoStream.getVideoTracks()) {
        track.stop();
      }
    }

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
