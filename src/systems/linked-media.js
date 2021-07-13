// Provides the idea of "media linking" -- if two media objects are linked
// then updates to one (src, page, etc) will be reflected on the other, and vice versa.
//
// When you link a media element from A -> B via registerLinkage, a few notes:
// - The media is assumed to be of the same kind, ideally created via media-utils/cloneMedia
// - Sync is bidirectional, however, elB is assumed to be a 'derivate of' elA. this means:
//   - for the video case, elA will have its volume set to zero and restored if elB is removed
//   - when elA is removed, elB will be removed (done in media-loader) but not vice-versa
//
AFRAME.registerSystem("linked-media", {
  init: function() {
    this.handlers = [];
    this.addLinkageHandler = this.addLinkageHandler.bind(this);
    this.syncLinkage = this.syncLinkage.bind(this);
  },

  addLinkageHandler(elA, elB) {
    const handler = () => {
      // Since elB will have its event fired here if we change something, ignore it.
      if (elB._handlingLinkage) return;
      elA._handlingLinkage = true;
      this.syncLinkage(elA, elB);
      elA._handlingLinkage = false;
    };

    if (elA.components["media-loader"].data) {
      elA.addEventListener("componentchanged", handler);
    } else {
      const waitForMediaLoader = evt => {
        if (evt.detail.name === "media-loader") {
          elA.removeEventListener("componentinitialized", waitForMediaLoader);
          elA.addEventListener("componentchanged", handler);
        }
      };

      elA.addEventListener("componentinitialized", waitForMediaLoader);
    }

    return handler;
  },

  registerLinkage: function(elA, elB) {
    this.syncLinkage(elA, elB);

    const handlerA = this.addLinkageHandler(elA, elB);
    const handlerB = this.addLinkageHandler(elB, elA);
    elA.setAttribute("linked-media", "");
    elB.setAttribute("linked-media", "");

    // As a convenience, if elA is a video, we turn its volume off so we don't hear it twice
    if (elA.components["media-video"]) {
      elA.setAttribute("audio-params", "gain", 0);
    }

    this.handlers.push([elA, elB, handlerA, handlerB]);
  },

  deregisterLinkage: function(el) {
    // Deregister elA -> elB, get list of elBs, and remove them
    for (const [elA, elB, handlerA, handlerB] of this.handlers) {
      if (el === elA || el === elB) {
        elA.removeEventListener("componentchanged", handlerA);
        elB.removeEventListener("componentchanged", handlerB);
      }

      // As a convenience, if elA is a video, we restore its volume to 50% since we muted it upon link.
      if (elA.components["audio-params"]) {
        elA.setAttribute("audio-params", "gain", 0.5);
      }
    }

    this.handlers = this.handlers.filter(([elA, elB]) => elA !== el && elB !== el);
  },

  syncLinkage(elA, elB) {
    if (elB.components["networked"]) {
      // Take ownership before updating
      if (!NAF.utils.isMine(elB) && !NAF.utils.takeOwnership(elB)) return;
    }

    const { src, version } = elA.components["media-loader"].data;

    // For now, manually sync linkable properties.
    elB.setAttribute("media-loader", { src, version });

    if (elA.components["media-pdf"]) {
      const { index } = elA.components["media-pdf"].data;
      elB.setAttribute("media-pdf", { index });
    }

    if (elA.components["media-video"]) {
      const { time, videoPaused, loop, hidePlaybackControls } = elA.components["media-video"].data;

      // Sync time, pause state, playback controls, and tighten sync tolerance since its local
      const syncedVideoAttributes = { time, videoPaused, loop, hidePlaybackControls };

      const targetIsNetworked = !elB.components.networked;
      if (targetIsNetworked) {
        syncedVideoAttributes.syncTolerance = 0.25;
      }

      elB.setAttribute("media-video", syncedVideoAttributes);
      elB.components["media-video"].updatePlaybackState(true);
    }
  }
});

AFRAME.registerComponent("linked-media", {
  remove: function() {
    this.system.deregisterLinkage(this.el);
  }
});
