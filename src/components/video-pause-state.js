// HACK: Setting videoPaused on media-video doesn't work if you are the owner.
// This component gets around that by calling .togglePlaying() to play/pause the video based on a property change.
AFRAME.registerComponent("video-pause-state", {
  schema: {
    paused: { default: false }
  },

  init() {
    this.onPauseStateChange = this.onPauseStateChange.bind(this);
    this.videoComponent = this.el.components["media-video"];

    if (this.videoComponent?.video) {
      this.onVideoLoaded();
    } else {
      this.onVideoLoaded = this.onVideoLoaded.bind(this);
      this.el.addEventListener("video-loaded", this.onVideoLoaded);
    }
  },

  onVideoLoaded() {
    this.videoComponent = this.el.components["media-video"];
    this.video = this.videoComponent.video;
    this.video.addEventListener("pause", this.onPauseStateChange);
  },

  onPauseStateChange() {
    this.el.setAttribute("paused", this.video.paused);
  },

  update() {
    if (this.video && this.data.paused !== this.video.paused) {
      this.videoComponent.togglePlaying();
    }
  },

  remove() {
    if (this.video) {
      this.video.removeEventListener("pause", this.onPauseStateChange);
    }
    this.el.removeEventListener("video-loaded", this.onVideoLoaded);
  }
});
