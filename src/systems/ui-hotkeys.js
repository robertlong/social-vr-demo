import { paths } from "./userinput/paths";
import { SOURCES } from "../storage/media-search-store";

const MEDIA_SEARCH_PATHS = [
  paths.actions.mediaSearch1,
  paths.actions.mediaSearch2,
  paths.actions.mediaSearch3,
  paths.actions.mediaSearch4,
  paths.actions.mediaSearch5,
  paths.actions.mediaSearch6,
  paths.actions.mediaSearch7,
  paths.actions.mediaSearch8
];

// Every frame, looks for input paths that trigger UI-relevant events and handles them.
AFRAME.registerSystem("ui-hotkeys", {
  init() {
    this.mediaSearchStore = window.APP.mediaSearchStore;
  },

  tick: function() {
    if (!this.userinput) {
      this.userinput = this.el.systems.userinput;
    }

    if (this.userinput.get(paths.actions.focusUI)) {
      this.el.emit("action_focus_ui");
      return;
    }

    if (this.userinput.get(paths.actions.focusChat)) {
      this.focusChat();
    }

    if (this.userinput.get(paths.actions.focusChatCommand)) {
      this.focusChat("/");
    }

    if (this.userinput.get(paths.actions.mediaExit)) {
      if (
        window.APP.history.location.state &&
        window.APP.history.location.state.value !== "avatar-editor" &&
        window.APP.history.location.state.value !== "link"
      ) {
        this.mediaSearchStore.pushExitMediaBrowserHistory();
      }

      this.el.emit("action_exit_watch");
    }

    for (let i = 0; i < MEDIA_SEARCH_PATHS.length; i++) {
      if (this.userinput.get(MEDIA_SEARCH_PATHS[i]) && window.APP.hubChannel.can("spawn_and_move_media")) {
        this.mediaSearchStore.sourceNavigate(SOURCES[i]);
      }
    }

    if (this.userinput.get(paths.actions.toggleCamera)) {
      this.el.emit("action_toggle_camera");
    }

    if (this.userinput.get(paths.actions.toggleUI)) {
      if (this.el.sceneEl.is("entered")) {
        this.el.emit("action_toggle_ui");
      }
    }
  },

  focusChat: function(prefix) {
    const target = document.querySelector(".chat-focus-target");
    if (!target) return;

    target.focus();

    if (prefix) {
      target.value = prefix;
    }
  }
});
