import { addAndArrangeMedia } from "../utils/media-utils";
import { createImageBitmap } from "../utils/image-bitmap-utils";
import { ObjectTypes } from "../object-types";
import { paths } from "../systems/userinput/paths";
import { SOUND_CAMERA_TOOL_TOOK_SNAPSHOT, SOUND_CAMERA_TOOL_COUNTDOWN } from "../systems/sound-effects-system";
import { getAudioFeedbackScale } from "./audio-feedback";
import { cloneObject3D } from "../utils/three-utils";
import { loadModel } from "./gltf-model-plus";
import { waitForDOMContentLoaded } from "../utils/async-utils";
import cameraModelSrc from "../assets/camera_tool.glb";
import anime from "animejs";

const cameraModelPromise = waitForDOMContentLoaded().then(() => loadModel(cameraModelSrc));

const pathsMap = {
  "player-right-controller": {
    takeSnapshot: paths.actions.rightHand.takeSnapshot
  },
  "player-left-controller": {
    takeSnapshot: paths.actions.leftHand.takeSnapshot
  },
  "right-cursor": {
    takeSnapshot: paths.actions.cursor.right.takeSnapshot
  },
  "left-cursor": {
    takeSnapshot: paths.actions.cursor.left.takeSnapshot
  }
};

const isMobileVR = AFRAME.utils.device.isMobileVR();

const VIEWFINDER_FPS = 6;
const VIDEO_FPS = 25;
// Prefer h264 if available due to faster decoding speec on most platforms
const videoCodec = ["h264", "vp9,opus", "vp8,opus", "vp9", "vp8"].find(
  codec => window.MediaRecorder && MediaRecorder.isTypeSupported(`video/webm; codecs=${codec}`)
);
const videoMimeType = videoCodec ? `video/webm; codecs=${videoCodec}` : null;
const hasWebGL2 = !!document.createElement("canvas").getContext("webgl2");
const allowVideo = !!videoMimeType && hasWebGL2;

const isOculusBrowser = navigator.userAgent.match(/Oculus/);
const CAPTURE_WIDTH = isMobileVR && !isOculusBrowser ? 640 : 1280;
const CAPTURE_HEIGHT = isMobileVR && !isOculusBrowser ? 360 : 720;
const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;
const CAPTURE_DURATIONS = [3, 7, 15, 30, 60, Infinity];
const DEFAULT_CAPTURE_DURATION = 7;
const COUNTDOWN_DURATION = 3;
const VIDEO_LOOPS = 3; // Number of times to loop the videos we spawn before stopping them (for perf)
const MAX_DURATION_TO_LIMIT_LOOPS = 31; // Max duration for which we limit loops (eg GIFs vs long form videos)

const snapCanvas = document.createElement("canvas");

async function pixelsToPNG(pixels, width, height) {
  snapCanvas.width = width;
  snapCanvas.height = height;
  const context = snapCanvas.getContext("2d");

  const imageData = context.createImageData(width, height);
  imageData.data.set(pixels);
  const bitmap = await createImageBitmap(imageData);
  context.scale(1, -1);
  context.drawImage(bitmap, 0, -height);
  const blob = await new Promise(resolve => snapCanvas.toBlob(resolve));
  return new File([blob], "snap.png", { type: "image/png" });
}

function blitFramebuffer(renderer, src, srcX0, srcY0, srcX1, srcY1, dest, dstX0, dstY0, dstX1, dstY1) {
  const gl = renderer.getContext();

  // Copies from one framebuffer to another. Note that at the end of this function, you need to restore
  // the original framebuffer via setRenderTarget
  const srcFramebuffer = renderer.properties.get(src).__webglFramebuffer;
  const destFramebuffer = renderer.properties.get(dest).__webglFramebuffer;

  if (srcFramebuffer && destFramebuffer) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destFramebuffer);

    if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      gl.blitFramebuffer(srcX0, srcY0, srcX1, srcY1, dstX0, dstY0, dstX1, dstY1, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
  }
}

AFRAME.registerComponent("camera-tool", {
  schema: {
    captureDuration: { default: DEFAULT_CAPTURE_DURATION },
    captureAudio: { default: false },
    isSnapping: { default: false },
    isRecording: { default: false },
    label: { default: "" }
  },

  init() {
    this.el.object3D.visible = false; // Make invisible until model ready
    this.lastUpdate = performance.now();
    this.localSnapCount = 0; // Counter that is used to arrange photos/videos

    this.showCameraViewfinder = !isMobileVR;

    this.renderTarget = new THREE.WebGLRenderTarget(RENDER_WIDTH, RENDER_HEIGHT, {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      encoding: THREE.GammaEncoding,
      depth: false,
      stencil: false
    });

    this.camera = new THREE.PerspectiveCamera(50, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 30000);
    this.camera.rotation.set(0, Math.PI, 0);
    this.camera.position.set(0, 0, 0.05);
    this.camera.matrixNeedsUpdate = true;
    this.el.setObject3D("camera", this.camera);

    const material = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture
    });

    // Bit of a hack here to only update the renderTarget when the screens are in view
    material.map.isVideoTexture = true;
    material.map.update = () => {
      if (this.showCameraViewfinder) {
        this.viewfinderInViewThisFrame = true;
      }
    };

    this.el.sceneEl.addEventListener("stateadded", () => this.updateUI());
    this.el.sceneEl.addEventListener("stateremoved", () => this.updateUI());

    cameraModelPromise.then(model => {
      const mesh = cloneObject3D(model.scene);
      mesh.scale.set(2, 2, 2);
      mesh.matrixNeedsUpdate = true;
      this.el.setObject3D("mesh", mesh);

      this.el.object3D.visible = true;
      this.el.object3D.scale.set(0.5, 0.5, 0.5);
      this.el.object3D.matrixNeedsUpdate = true;

      const obj = this.el.object3D;

      const step = (function() {
        const lastValue = {};
        return function(anim) {
          const value = anim.animatables[0].target;

          value.x = Math.max(Number.MIN_VALUE, value.x);
          value.y = Math.max(Number.MIN_VALUE, value.y);
          value.z = Math.max(Number.MIN_VALUE, value.z);

          // For animation timeline.
          if (value.x === lastValue.x && value.y === lastValue.y && value.z === lastValue.z) {
            return;
          }

          lastValue.x = value.x;
          lastValue.y = value.y;
          lastValue.z = value.z;

          obj.scale.set(value.x, value.y, value.z);
          obj.matrixNeedsUpdate = true;
        };
      })();

      const config = {
        duration: 200,
        easing: "easeOutQuad",
        elasticity: 400,
        loop: 0,
        round: false,
        x: 1,
        y: 1,
        z: 1,
        targets: [{ x: 0.5, y: 0.5, z: 0.5 }],
        update: anim => step(anim),
        complete: anim => step(anim)
      };

      anime(config);

      const width = 0.28;
      const geometry = new THREE.PlaneBufferGeometry(width, width / this.camera.aspect);

      const environmentMapComponent = this.el.sceneEl.components["environment-map"];
      if (environmentMapComponent) {
        environmentMapComponent.applyEnvironmentMap(this.el.object3D);
      }

      this.screen = new THREE.Mesh(geometry, material);
      this.screen.rotation.set(0, Math.PI, 0);
      this.screen.position.set(0, 0, -0.042);
      this.screen.matrixNeedsUpdate = true;
      this.el.setObject3D("screen", this.screen);

      this.selfieScreen = new THREE.Mesh(geometry, material);
      this.selfieScreen.position.set(0, 0.4, 0);
      this.selfieScreen.scale.set(-2, 2, 2);
      this.selfieScreen.matrixNeedsUpdate = true;
      this.el.setObject3D("selfieScreen", this.selfieScreen);

      this.label = this.el.querySelector(".label");
      this.labelActionBackground = this.el.querySelector(".label-action-background");
      this.labelBackground = this.el.querySelector(".label-background");
      this.durationLabel = this.el.querySelector(".duration");

      this.recordIcon = this.el.querySelector(".record-icon");
      this.recordAlphaIcon = this.el.querySelector(".record-alpha-icon");

      this.label.object3D.visible = false;
      this.durationLabel.object3D.visible = false;

      this.snapMenu = this.el.querySelector(".camera-snap-menu");
      this.snapButton = this.el.querySelector(".snap-button");
      this.recordButton = this.el.querySelector(".record-button");

      this.cancelButton = this.el.querySelector(".cancel-button");
      this.nextDurationButton = this.el.querySelector(".next-duration");
      this.prevDurationButton = this.el.querySelector(".prev-duration");
      this.snapButton.object3D.addEventListener("interact", () => this.snapClicked(true));
      this.recordButton.object3D.addEventListener("interact", () => this.snapClicked(false));
      this.cancelButton.object3D.addEventListener("interact", () => this.cancelSnapping());
      this.nextDurationButton.object3D.addEventListener("interact", () => this.changeDuration(1));
      this.prevDurationButton.object3D.addEventListener("interact", () => this.changeDuration(-1));
      this.stopButton = this.el.querySelector(".stop-button");
      this.stopButton.object3D.addEventListener("interact", () => this.stopRecording());
      this.captureAudioButton = this.el.querySelector(".capture-audio");
      this.captureAudioIcon = this.el.querySelector(".capture-audio-icon");
      this.captureAudioButton.object3D.addEventListener("interact", () =>
        this.el.setAttribute("camera-tool", "captureAudio", !this.data.captureAudio)
      );

      this.updateUI();

      this.updateRenderTargetNextTick = true;

      this.cameraSystem = this.el.sceneEl.systems["camera-tools"];
      this.cameraSystem.register(this.el);

      waitForDOMContentLoaded().then(() => {
        this.playerCamera = document.getElementById("viewing-camera").getObject3D("camera");
      });
    });
  },

  remove() {
    this.cameraSystem.deregister(this.el);
    this.stopRecording();
  },

  updateViewfinder() {
    this.updateRenderTargetNextTick = true;
  },

  changeDuration(delta) {
    const idx = CAPTURE_DURATIONS.findIndex(d => this.data.captureDuration == d);
    const newIdx = idx === 0 && delta === -1 ? CAPTURE_DURATIONS.length - 1 : (idx + delta) % CAPTURE_DURATIONS.length;
    this.el.setAttribute("camera-tool", "captureDuration", CAPTURE_DURATIONS[newIdx]);
  },

  focus(el, track) {
    if (track) {
      this.trackTarget = el;
    } else {
      this.trackTarget = null;
    }

    this.lookAt(el);
  },

  lookAt: (function() {
    const targetPos = new THREE.Vector3();
    return function(el) {
      targetPos.setFromMatrixPosition(el.object3D.matrixWorld);
      this.el.object3D.lookAt(targetPos);
      this.el.object3D.matrixNeedsUpdate = true;
    };
  })(),

  snapClicked(isPhoto) {
    if (this.data.isSnapping) return;
    if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return;

    this.el.setAttribute("camera-tool", "isSnapping", true);
    this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_CAMERA_TOOL_COUNTDOWN);

    this.snapCountdown = COUNTDOWN_DURATION;
    this.el.setAttribute("camera-tool", "label", `${this.snapCountdown}`);

    this.countdownInterval = setInterval(async () => {
      if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        return;
      }

      this.snapCountdown--;

      if (this.snapCountdown === 0) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;

        if (isPhoto) {
          this.el.setAttribute("camera-tool", { label: "", isSnapping: false });
          this.takeSnapshotNextTick = true;
        } else {
          this.beginRecording(this.data.captureDuration);
        }
      } else {
        this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_CAMERA_TOOL_COUNTDOWN);
        this.el.setAttribute("camera-tool", "label", `${this.snapCountdown}`);
      }
    }, 1000);
  },

  cancelSnapping() {
    clearInterval(this.countdownInterval);
    this.stopRecording(true);
    this.updateUI();
  },

  update() {
    this.updateUI();
  },

  updateUI() {
    if (!this.label) return;

    const label = this.data.label;
    const isFrozen = this.el.sceneEl.is("frozen");
    const hasDuration = this.data.captureDuration !== Infinity;

    const isRecordingUnbound = !hasDuration && this.data.isRecording && this.videoRecorder;
    this.label.object3D.visible = !!label && !isRecordingUnbound;
    const showActionLabelBackground = this.label.object3D.visible && this.data.isRecording && !isRecordingUnbound;

    if (label) {
      this.label.setAttribute("text", { value: label, color: showActionLabelBackground ? "#fafafa" : "#ff3464" });
    }

    this.labelActionBackground.object3D.visible = showActionLabelBackground;
    this.labelBackground.object3D.visible = this.label.object3D.visible && !showActionLabelBackground;

    this.stopButton.object3D.visible = isRecordingUnbound;

    if (hasDuration) {
      this.durationLabel.setAttribute("text", "value", `${this.data.captureDuration}`);
    }

    this.durationLabel.object3D.visible = hasDuration && !this.data.isSnapping && !isFrozen && allowVideo;
    this.recordIcon.object3D.visible = !hasDuration && !isFrozen && allowVideo;
    this.recordAlphaIcon.object3D.visible = hasDuration && !isFrozen && allowVideo;
    this.snapButton.object3D.visible = !this.data.isSnapping && !isFrozen;
    this.recordButton.object3D.visible = !this.data.isSnapping && !isFrozen && allowVideo;
    this.cancelButton.object3D.visible = this.data.isSnapping && !isFrozen;
    this.prevDurationButton.object3D.visible = this.nextDurationButton.object3D.visible =
      !this.data.isSnapping && allowVideo && !isFrozen && allowVideo;

    this.captureAudioIcon.setAttribute("icon-button", "active", this.data.captureAudio);
  },

  async beginRecording(duration) {
    if (!this.videoContext) {
      this.videoCanvas = document.createElement("canvas");
      this.videoCanvas.width = CAPTURE_WIDTH;
      this.videoCanvas.height = CAPTURE_HEIGHT;
      this.videoContext = this.videoCanvas.getContext("2d");
      this.videoImageData = this.videoContext.createImageData(CAPTURE_WIDTH, CAPTURE_HEIGHT);
      this.videoPixels = new Uint8Array(CAPTURE_WIDTH * CAPTURE_HEIGHT * 4);
      this.videoImageData.data.set(this.videoPixels);
    }

    const stream = new MediaStream();
    const track = this.videoCanvas.captureStream(VIDEO_FPS).getVideoTracks()[0];

    // HACK: FF 73+ seems to fail to decode videos with no audio track, so we always include a silent track.
    // Note that chrome won't generate the video without some data flowing to the track, hence the oscillator.
    const attachBlankAudio = () => {
      const context = THREE.AudioContext.getContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(destination);
      gain.connect(destination);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    };

    if (this.data.captureAudio) {
      const selfAudio = await NAF.connection.adapter.getMediaStream(NAF.clientId, "audio");

      // NOTE: if we don't have a self audio track, we can end up generating an empty video (browser bug?)
      // if no audio comes through on the listener source. (Eg the room is otherwise silent.)
      // So for now, if we don't have a track, just disable audio capture.
      if (selfAudio && selfAudio.getAudioTracks().length > 0) {
        const context = THREE.AudioContext.getContext();
        const destination = context.createMediaStreamDestination();

        const listener = this.el.sceneEl.audioListener;
        if (listener) {
          // NOTE audio is not captured from camera vantage point for now.
          listener.getInput().connect(destination);
        }
        context.createMediaStreamSource(selfAudio).connect(destination);

        const audio = destination.stream.getAudioTracks()[0];
        stream.addTrack(audio);
      } else {
        attachBlankAudio();
      }
    } else {
      attachBlankAudio();
    }

    stream.addTrack(track);
    this.videoRecorder = new MediaRecorder(stream, { mimeType: videoMimeType });
    const chunks = [];
    const recordingStartTime = performance.now();

    this.videoRecorder.ondataavailable = e => chunks.push(e.data);

    this.updateRenderTargetNextTick = true;

    this.videoRecorder.start();
    this.el.setAttribute("camera-tool", { isRecording: true, label: " " });
    this.el.sceneEl.emit("action_camera_recording_started");

    if (duration !== Infinity) {
      this.videoCountdown = this.data.captureDuration;
      this.el.setAttribute("camera-tool", "label", `${this.videoCountdown}`);

      this.videoCountdownInterval = setInterval(() => {
        this.videoCountdown--;

        if (this.videoCountdown === 0) {
          this.stopRecording();
          this.videoCountdownInterval = null;
        } else {
          this.el.setAttribute("camera-tool", "label", `${this.videoCountdown}`);
        }
      }, 1000);
    }

    this.videoRecorder._free = () => (chunks.length = 0); // Used for cancelling
    this.videoRecorder.onstop = async () => {
      this.el.sceneEl.emit("action_camera_recording_ended");

      if (chunks.length === 0) return;
      const mimeType = chunks[0].type;
      const recordingDuration = performance.now() - recordingStartTime;
      const blob = new Blob(chunks, { type: mimeType });

      chunks.length = 0;

      const { entity, orientation } = addAndArrangeMedia(
        this.el,
        new File([blob], "capture", { type: mimeType.split(";")[0] }), // Drop codec
        "video-camera",
        this.localSnapCount,
        !!this.playerIsBehindCamera
      );

      entity.addEventListener(
        "video-loaded",
        () => {
          // If we were recording audio, then pause the video immediately after starting.
          //
          // Or, to limit the # of concurrent videos playing, if it was a short clip, let it loop
          // a few times and then pause it.
          if (this.data.captureAudio || recordingDuration <= MAX_DURATION_TO_LIMIT_LOOPS * 1000) {
            setTimeout(() => {
              if (!NAF.utils.isMine(entity) && !NAF.utils.takeOwnership(entity)) return;
              entity.components["media-video"].tryUpdateVideoPlaybackState(true);
            }, this.data.captureAudio ? 0 : recordingDuration * VIDEO_LOOPS + 100);
          }
        },
        { once: true }
      );

      this.localSnapCount++;

      orientation.then(() => this.el.sceneEl.emit("object_spawned", { objectType: ObjectTypes.CAMERA }));
    };
  },

  stopRecording(cancel) {
    if (this.videoRecorder) {
      if (cancel) {
        this.videoRecorder.onstop = () => {};
        this.videoRecorder._free();
      }

      this.videoRecorder.stop();
      this.videoRecorder = null;

      if (!cancel) {
        this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_CAMERA_TOOL_TOOK_SNAPSHOT);
      }
    }
    clearInterval(this.videoCountdownInterval);

    this.videoCountdownInterval = null;
    this.el.setAttribute("camera-tool", "label", "");
    this.el.setAttribute("camera-tool", { isRecording: false, isSnapping: false });
  },

  tick() {
    const interaction = AFRAME.scenes[0].systems.interaction;
    const userinput = AFRAME.scenes[0].systems.userinput;
    const heldLeftHand = interaction.state.leftHand.held === this.el;
    const heldRightHand = interaction.state.rightHand.held === this.el;
    const heldRightRemote = interaction.state.rightRemote.held === this.el;

    const heldThisFrame =
      (heldLeftHand && userinput.get(interaction.options.leftHand.grabPath)) ||
      (heldRightHand && userinput.get(interaction.options.rightHand.grabPath)) ||
      (heldRightRemote && userinput.get(interaction.options.rightRemote.grabPath));

    const isHolding = heldLeftHand || heldRightHand || heldRightRemote;

    this.updateSnapMenuOrientation();

    if (heldThisFrame) {
      this.localSnapCount = 0;
    }

    this.showCameraViewfinder = isHolding || !isMobileVR || this.data.isSnapping || this.videoRecorder;

    if (this.screen && this.selfieScreen) {
      this.screen.visible = this.selfieScreen.visible = !!this.showCameraViewfinder;
    }

    // Always draw held, snapping, or recording camera viewfinders with a decent framerate
    if (
      (isHolding || this.data.isSnapping || this.videoRecorder) &&
      performance.now() - this.lastUpdate >= 1000 / (this.videoRecorder ? VIDEO_FPS : VIEWFINDER_FPS)
    ) {
      this.updateRenderTargetNextTick = true;
    }

    const isHoldingTrigger = this.isHoldingSnapshotTrigger();
    const isPermittedToUse = window.APP.hubChannel.can("spawn_camera");

    if (isPermittedToUse) {
      // If the user lets go of the trigger before 500ms, take a picture, otherwise record until they let go.
      if (isHoldingTrigger && !this.data.isSnapping && !this.snapTriggerTimeout) {
        this.snapTriggerTimeout = setTimeout(() => {
          if (this.isHoldingSnapshotTrigger()) {
            this.el.setAttribute("camera-tool", "isSnapping", true);
            this.beginRecording(Infinity);

            const releaseInterval = setInterval(() => {
              if (this.isHoldingSnapshotTrigger()) return;
              this.stopRecording();
              clearInterval(releaseInterval);
            }, 500);
          }

          this.snapTriggerTimeout = null;
        }, 500);
      } else if (!isHoldingTrigger && !this.data.isSnapping && this.snapTriggerTimeout) {
        clearTimeout(this.snapTriggerTimeout);
        this.snapTriggerTimeout = null;
        this.takeSnapshotNextTick = true;
      }
    }
  },

  tock: (function() {
    return function tock() {
      const sceneEl = this.el.sceneEl;
      const renderer = this.renderer || sceneEl.renderer;
      const now = performance.now();
      const playerHead = this.cameraSystem.playerHead;

      // Perform lookAt in tock so it will re-orient after grabs, etc.
      if (this.trackTarget) {
        if (this.trackTarget.parentNode) {
          this.lookAt(this.trackTarget);
        } else {
          this.trackTarget = null; // Target removed
        }
      }

      if (!this.playerHud) {
        const hudEl = document.getElementById("player-hud");
        this.playerHud = hudEl && hudEl.object3D;
      }

      if (
        this.takeSnapshotNextTick ||
        (this.updateRenderTargetNextTick && (this.viewfinderInViewThisFrame || this.videoRecorder))
      ) {
        if (playerHead) {
          // We want to scale our own head in between frames now that we're taking a video/photo.
          let scale = 1;
          // TODO: The local-audio-analyser has the non-networked media stream, which is active
          // even while the user is muted. This should be looking at a different analyser that
          // has the networked media stream instead.
          const analyser = this.el.sceneEl.systems["local-audio-analyser"];

          if (analyser && playerHead.el.components["scale-audio-feedback"]) {
            scale = getAudioFeedbackScale(this.el.object3D, playerHead, 1, 2, analyser.volume);
          }

          playerHead.visible = true;
          playerHead.scale.set(scale, scale, scale);
          playerHead.updateMatrices(true, true);
          playerHead.updateMatrixWorld(true, true);
        }

        let playerHudWasVisible = false;

        if (this.playerHud) {
          playerHudWasVisible = this.playerHud.visible;
          this.playerHud.visible = false;
          if (this.el.sceneEl.systems["hubs-systems"]) {
            for (const mesh of Object.values(this.el.sceneEl.systems["hubs-systems"].spriteSystem.meshes)) {
              mesh.visible = false;
            }
          }
        }

        const bubbleSystem = this.el.sceneEl.systems["personal-space-bubble"];
        const boneVisibilitySystem = this.el.sceneEl.systems["hubs-systems"].boneVisibilitySystem;

        if (bubbleSystem) {
          for (let i = 0, l = bubbleSystem.invaders.length; i < l; i++) {
            bubbleSystem.invaders[i].disable();
          }
          // HACK, bone visibility typically takes a tick to update, but since we want to be able
          // to have enable() and disable() be reflected this frame, we need to do it immediately.
          boneVisibilitySystem.tick();
        }

        const tmpVRFlag = renderer.xr.enabled;
        const tmpOnAfterRender = sceneEl.object3D.onAfterRender;
        delete sceneEl.object3D.onAfterRender;
        renderer.xr.enabled = false;

        if (allowVideo && this.videoRecorder && !this.videoRenderTarget) {
          // Create a separate render target for video becuase we need to flip and (sometimes) downscale it before
          // encoding it to video.
          this.videoRenderTarget = new THREE.WebGLRenderTarget(CAPTURE_WIDTH, CAPTURE_HEIGHT, {
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.NearestFilter,
            encoding: THREE.sRGBEncoding,
            depth: false,
            stencil: false
          });

          // Used to set up framebuffer in three.js as a side effect
          renderer.setRenderTarget(this.videoRenderTarget);
        }

        renderer.setRenderTarget(this.renderTarget);
        renderer.render(sceneEl.object3D, this.camera);
        renderer.setRenderTarget(null);

        renderer.xr.enabled = tmpVRFlag;
        sceneEl.object3D.onAfterRender = tmpOnAfterRender;
        if (playerHead) {
          playerHead.visible = false;
          playerHead.scale.set(0.00000001, 0.00000001, 0.00000001);
          playerHead.updateMatrices(true, true);
          playerHead.updateMatrixWorld(true, true);
        }

        if (this.playerHud) {
          this.playerHud.visible = playerHudWasVisible;
          if (this.el.sceneEl.systems["hubs-systems"]) {
            for (const mesh of Object.values(this.el.sceneEl.systems["hubs-systems"].spriteSystem.meshes)) {
              mesh.visible = true;
            }
          }
        }

        if (bubbleSystem) {
          for (let i = 0, l = bubbleSystem.invaders.length; i < l; i++) {
            bubbleSystem.invaders[i].enable();
          }
          // HACK, bone visibility typically takes a tick to update, but since we want to be able
          // to have enable() and disable() be reflected this frame, we need to do it immediately.
          boneVisibilitySystem.tick();
        }

        this.lastUpdate = now;

        if (this.videoRecorder) {
          // https://chromium.googlesource.com/chromium/src/gpu/+/master/command_buffer/service/gles2_cmd_decoder.cc#8899
          // We avoid using blitting and flip the render target pixels for OB.
          if (!isOculusBrowser) {
            // This blit operation will (if necessary) scale/resample the view finder render target and, importantly,
            // flip the texture on Y
            blitFramebuffer(
              renderer,
              this.renderTarget,
              0,
              0,
              RENDER_WIDTH,
              RENDER_HEIGHT,
              this.videoRenderTarget,
              0,
              CAPTURE_HEIGHT,
              CAPTURE_WIDTH,
              0
            );
          }
          renderer.readRenderTargetPixels(
            !isOculusBrowser ? this.videoRenderTarget : this.renderTarget,
            0,
            0,
            CAPTURE_WIDTH,
            CAPTURE_HEIGHT,
            this.videoPixels
          );
          if (isOculusBrowser) {
            this.flipPixelsY(this.videoPixels, CAPTURE_WIDTH, CAPTURE_HEIGHT);
          }
          this.videoImageData.data.set(this.videoPixels);
          this.videoContext.putImageData(this.videoImageData, 0, 0);
        }

        this.updateRenderTargetNextTick = false;
        this.viewfinderInViewThisFrame = false;
      }

      if (this.takeSnapshotNextTick) {
        if (!this.snapPixels) {
          this.snapPixels = new Uint8Array(RENDER_WIDTH * RENDER_HEIGHT * 4);
        }
        renderer.readRenderTargetPixels(this.renderTarget, 0, 0, RENDER_WIDTH, RENDER_HEIGHT, this.snapPixels);

        pixelsToPNG(this.snapPixels, RENDER_WIDTH, RENDER_HEIGHT).then(file => {
          const { orientation } = addAndArrangeMedia(
            this.el,
            file,
            "photo-camera",
            this.localSnapCount,
            !!this.playerIsBehindCamera
          );

          orientation.then(() => {
            this.el.sceneEl.emit("object_spawned", { objectType: ObjectTypes.CAMERA });
          });
        });
        sceneEl.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_CAMERA_TOOL_TOOK_SNAPSHOT);
        this.takeSnapshotNextTick = false;
        this.localSnapCount++;
      }
    };
  })(),

  flipPixelsY(pixels, width, height) {
    const halfHeight = (height / 2) | 0;
    const bytesPerRow = width * 4;

    const temp = new Uint8Array(width * 4);
    for (let y = 0; y < halfHeight; ++y) {
      const topOffset = y * bytesPerRow;
      const bottomOffset = (height - y - 1) * bytesPerRow;
      temp.set(pixels.subarray(topOffset, topOffset + bytesPerRow));
      pixels.copyWithin(topOffset, bottomOffset, bottomOffset + bytesPerRow);
      pixels.set(temp, bottomOffset);
    }
  },

  isHoldingSnapshotTrigger: function() {
    const interaction = AFRAME.scenes[0].systems.interaction;
    const userinput = AFRAME.scenes[0].systems.userinput;
    const heldLeftHand = interaction.state.leftHand.held === this.el;
    const heldRightHand = interaction.state.rightHand.held === this.el;
    const heldRightRemote = interaction.state.rightRemote.held === this.el;
    const heldLeftRemote = interaction.state.leftRemote.held === this.el;

    let grabberId;
    if (heldRightHand) {
      grabberId = "player-right-controller";
    } else if (heldLeftHand) {
      grabberId = "player-left-controller";
    } else if (heldRightRemote) {
      grabberId = "right-cursor";
    } else if (heldLeftRemote) {
      grabberId = "left-cursor";
    }

    if (grabberId) {
      const grabberPaths = pathsMap[grabberId];
      if (userinput.get(grabberPaths.takeSnapshot)) {
        return true;
      }
    }

    return !!userinput.get(paths.actions.takeSnapshot);
  },

  updateSnapMenuOrientation: (function() {
    const playerWorld = new THREE.Vector3();
    const cameraWorld = new THREE.Vector3();
    const playerToCamera = new THREE.Vector3();
    const cameraForwardPoint = new THREE.Vector3();
    const cameraForwardWorld = new THREE.Vector3();
    return function() {
      if (!this.playerCamera) return;
      this.el.object3D.getWorldPosition(cameraWorld);
      this.playerCamera.getWorldPosition(playerWorld);
      playerToCamera.subVectors(playerWorld, cameraWorld);
      cameraForwardPoint.set(0, 0, 1);
      this.el.object3D.localToWorld(cameraForwardPoint);
      cameraForwardWorld.subVectors(cameraForwardPoint, cameraWorld);
      cameraForwardWorld.normalize();
      playerToCamera.normalize();

      const playerIsBehindCamera = cameraForwardWorld.dot(playerToCamera) < 0;

      if (this.playerIsBehindCamera !== playerIsBehindCamera) {
        this.playerIsBehindCamera = playerIsBehindCamera;
        this.snapMenu.object3D.rotation.set(0, this.playerIsBehindCamera ? Math.PI : 0, 0);
        this.snapMenu.object3D.matrixNeedsUpdate = true;
      }
    };
  })()
});
