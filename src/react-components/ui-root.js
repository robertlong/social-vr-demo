import React, { Component } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import copy from "copy-to-clipboard";
import { FormattedMessage } from "react-intl";
import { WrappedIntlProvider } from "./wrapped-intl-provider";
import screenfull from "screenfull";

import configs from "../utils/configs";
import IfFeature from "./if-feature";
import UnlessFeature from "./unless-feature";
import { VR_DEVICE_AVAILABILITY } from "../utils/vr-caps-detect";
import { canShare } from "../utils/share";
import maskEmail from "../utils/mask-email";
import styles from "../assets/stylesheets/ui-root.scss";
import entryStyles from "../assets/stylesheets/entry.scss";
import inviteStyles from "../assets/stylesheets/invite-dialog.scss";
import { ReactAudioContext } from "./wrap-with-audio";
import {
  pushHistoryState,
  clearHistoryState,
  popToBeginningOfHubHistory,
  navigateToPriorPage,
  sluglessPath
} from "../utils/history";
import StateRoute from "./state-route.js";
import { getPresenceProfileForSession, discordBridgesForPresences } from "../utils/phoenix-utils";
import { getClientInfoClientId } from "./client-info-dialog";
import { getCurrentStreamer } from "../utils/component-utils";

import { getMessages } from "../utils/i18n";
import Loader from "./loader";
import AutoExitWarning from "./auto-exit-warning";
import { TwoDEntryButton, GenericEntryButton, DaydreamEntryButton } from "./entry-buttons.js";
import ProfileEntryPanel from "./profile-entry-panel";
import MediaBrowser from "./media-browser";

import CreateObjectDialog from "./create-object-dialog.js";
import ChangeSceneDialog from "./change-scene-dialog.js";
import AvatarUrlDialog from "./avatar-url-dialog.js";
import InviteDialog from "./invite-dialog.js";
import InviteTeamDialog from "./invite-team-dialog.js";
import LinkDialog from "./link-dialog.js";
import SignInDialog from "./sign-in-dialog.js";
import RoomSettingsDialog from "./room-settings-dialog.js";
import CloseRoomDialog from "./close-room-dialog.js";
import Tip from "./tip.js";
import WebRTCScreenshareUnsupportedDialog from "./webrtc-screenshare-unsupported-dialog.js";
import WebVRRecommendDialog from "./webvr-recommend-dialog.js";
import FeedbackDialog from "./feedback-dialog.js";
import HelpDialog from "./help-dialog.js";
import SafariMicDialog from "./safari-mic-dialog.js";
import LeaveRoomDialog from "./leave-room-dialog.js";
import RoomInfoDialog from "./room-info-dialog.js";
import ClientInfoDialog from "./client-info-dialog.js";
import ObjectInfoDialog from "./object-info-dialog.js";
import OAuthDialog from "./oauth-dialog.js";
import TweetDialog from "./tweet-dialog.js";
import LobbyChatBox from "./lobby-chat-box.js";
import EntryStartPanel from "./entry-start-panel.js";
import InWorldChatBox from "./in-world-chat-box.js";
import AvatarEditor from "./avatar-editor";
import MicLevelWidget from "./mic-level-widget.js";
import PreferencesScreen from "./preferences-screen.js";
import OutputLevelWidget from "./output-level-widget.js";
import PresenceLog from "./presence-log.js";
import PresenceList from "./presence-list.js";
import ObjectList from "./object-list.js";
import SettingsMenu from "./settings-menu.js";
import PreloadOverlay from "./preload-overlay.js";
import TwoDHUD from "./2d-hud";
import RTCDebugPanel from "./debug-panel/RtcDebugPanel.js";
import { SpectatingLabel } from "./spectating-label";
import { showFullScreenIfAvailable, showFullScreenIfWasFullScreen } from "../utils/fullscreen";
import { exit2DInterstitialAndEnterVR, isIn2DInterstitial } from "../utils/vr-interstitial";

import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { faQuestion } from "@fortawesome/free-solid-svg-icons/faQuestion";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons/faArrowLeft";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import qsTruthy from "../utils/qs_truthy";
import { CAMERA_MODE_INSPECT } from "../systems/camera-system";
const avatarEditorDebug = qsTruthy("avatarEditorDebug");

// This is a list of regexes that match the microphone labels of HMDs.
//
// If entering VR mode, and if any of these regexes match an audio device,
// the user will be prevented from entering VR until one of those devices is
// selected as the microphone.
//
// Note that this doesn't have to be exhaustive: if no devices match any regex
// then we rely upon the user to select the proper mic.
const HMD_MIC_REGEXES = [/\Wvive\W/i, /\Wrift\W/i];

const IN_ROOM_MODAL_ROUTER_PATHS = ["/media"];
const IN_ROOM_MODAL_QUERY_VARS = ["media_source"];

const LOBBY_MODAL_ROUTER_PATHS = ["/media/scenes", "/media/avatars", "/media/favorites"];
const LOBBY_MODAL_QUERY_VARS = ["media_source"];
const LOBBY_MODAL_QUERY_VALUES = ["scenes", "avatars", "favorites"];

async function grantedMicLabels() {
  const mediaDevices = await navigator.mediaDevices.enumerateDevices();
  return mediaDevices.filter(d => d.label && d.kind === "audioinput").map(d => d.label);
}

const isMobile = AFRAME.utils.device.isMobile();
const isMobileVR = AFRAME.utils.device.isMobileVR();
const isMobilePhoneOrVR = isMobile || isMobileVR;
const isFirefoxReality = isMobileVR && navigator.userAgent.match(/Firefox/);

const AUTO_EXIT_TIMER_SECONDS = 10;

class UIRoot extends Component {
  willCompileAndUploadMaterials = false;

  static propTypes = {
    enterScene: PropTypes.func,
    exitScene: PropTypes.func,
    onSendMessage: PropTypes.func,
    disableAutoExitOnIdle: PropTypes.bool,
    forcedVREntryType: PropTypes.string,
    isBotMode: PropTypes.bool,
    store: PropTypes.object,
    mediaSearchStore: PropTypes.object,
    scene: PropTypes.object,
    authChannel: PropTypes.object,
    hubChannel: PropTypes.object,
    linkChannel: PropTypes.object,
    hub: PropTypes.object,
    availableVREntryTypes: PropTypes.object,
    checkingForDeviceAvailability: PropTypes.bool,
    environmentSceneLoaded: PropTypes.bool,
    entryDisallowed: PropTypes.bool,
    roomUnavailableReason: PropTypes.string,
    hubIsBound: PropTypes.bool,
    isSupportAvailable: PropTypes.bool,
    presenceLogEntries: PropTypes.array,
    presences: PropTypes.object,
    sessionId: PropTypes.string,
    subscriptions: PropTypes.object,
    initialIsSubscribed: PropTypes.bool,
    initialIsFavorited: PropTypes.bool,
    showSignInDialog: PropTypes.bool,
    signInMessageId: PropTypes.string,
    signInCompleteMessageId: PropTypes.string,
    signInContinueTextId: PropTypes.string,
    onContinueAfterSignIn: PropTypes.func,
    showSafariMicDialog: PropTypes.bool,
    showOAuthDialog: PropTypes.bool,
    onCloseOAuthDialog: PropTypes.func,
    oauthInfo: PropTypes.array,
    isCursorHoldingPen: PropTypes.bool,
    hasActiveCamera: PropTypes.bool,
    onMediaSearchResultEntrySelected: PropTypes.func,
    onAvatarSaved: PropTypes.func,
    activeTips: PropTypes.object,
    location: PropTypes.object,
    history: PropTypes.object,
    showInterstitialPrompt: PropTypes.bool,
    onInterstitialPromptClicked: PropTypes.func,
    performConditionalSignIn: PropTypes.func,
    hide: PropTypes.bool,
    showPreload: PropTypes.bool,
    onPreloadLoadClicked: PropTypes.func,
    embed: PropTypes.bool,
    embedToken: PropTypes.string,
    onLoaded: PropTypes.func
  };

  state = {
    enterInVR: false,
    entered: false,
    entering: false,
    dialog: null,
    showShareDialog: false,
    broadcastTipDismissed: false,
    linkCode: null,
    linkCodeCancel: null,
    miniInviteActivated: false,

    didConnectToNetworkedScene: false,
    noMoreLoadingUpdates: false,
    hideLoader: false,
    showPrefs: false,
    watching: false,
    isStreaming: false,
    showStreamingTip: false,

    waitingOnAudio: false,
    mediaStream: null,
    audioTrack: null,
    audioTrackClone: null,
    micDevices: [],

    autoExitTimerStartedAt: null,
    autoExitTimerInterval: null,
    autoExitMessage: null,
    secondsRemainingBeforeAutoExit: Infinity,

    muted: false,
    frozen: false,

    exited: false,

    signedIn: false,
    videoShareMediaSource: null,
    showVideoShareFailed: false,

    objectInfo: null,
    objectSrc: "",
    isObjectListExpanded: false,
    isPresenceListExpanded: false
  };

  constructor(props) {
    super(props);

    if (props.showSafariMicDialog) {
      this.state.dialog = <SafariMicDialog closable={false} />;
    }

    props.mediaSearchStore.setHistory(props.history);

    // An exit handler that discards event arguments and can be cleaned up.
    this.exitEventHandler = () => this.exit();
  }

  componentDidUpdate(prevProps) {
    const { hubChannel, showSignInDialog } = this.props;
    if (hubChannel) {
      const { signedIn } = hubChannel;
      if (signedIn !== this.state.signedIn) {
        this.setState({ signedIn });
      }
    }
    if (prevProps.showSignInDialog !== showSignInDialog) {
      if (showSignInDialog) {
        this.showContextualSignInDialog();
      } else {
        this.closeDialog();
      }
    }
    if (!this.willCompileAndUploadMaterials && this.state.noMoreLoadingUpdates) {
      this.willCompileAndUploadMaterials = true;
      // We want to ensure that react and the browser have had the chance to render / update.
      // See https://stackoverflow.com/a/34999925 , although our solution flipped setTimeout and requestAnimationFrame
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!this.props.isBotMode) {
            try {
              this.props.scene.renderer.compileAndUploadMaterials(this.props.scene.object3D, this.props.scene.camera);
            } catch {
              this.exit("scene_error"); // https://github.com/mozilla/hubs/issues/1950
            }
          }

          if (!this.state.hideLoader) {
            this.setState({ hideLoader: true });
          }
        }, 0);
      });
    }
  }

  onConcurrentLoad = () => {
    if (qsTruthy("allow_multi") || this.props.store.state.preferences["allowMultipleHubsInstances"]) return;
    this.startAutoExitTimer("autoexit.concurrent_subtitle");
  };

  onIdleDetected = () => {
    if (
      this.props.disableAutoExitOnIdle ||
      this.state.isStreaming ||
      this.props.store.state.preferences["disableIdleDetection"]
    )
      return;
    this.startAutoExitTimer("autoexit.idle_subtitle");
  };

  onActivityDetected = () => {
    if (this.state.autoExitTimerInterval) {
      this.endAutoExitTimer();
    }
  };

  componentDidMount() {
    window.addEventListener("concurrentload", this.onConcurrentLoad);
    window.addEventListener("idle_detected", this.onIdleDetected);
    window.addEventListener("activity_detected", this.onActivityDetected);
    document.querySelector(".a-canvas").addEventListener("mouseup", () => {
      if (this.state.showShareDialog) {
        this.setState({ showShareDialog: false });
      }
    });

    this.props.scene.addEventListener(
      "didConnectToNetworkedScene",
      () => {
        this.setState({ didConnectToNetworkedScene: true });
      },
      { once: true }
    );
    this.props.scene.addEventListener("loaded", this.onSceneLoaded);
    this.props.scene.addEventListener("stateadded", this.onAframeStateChanged);
    this.props.scene.addEventListener("stateremoved", this.onAframeStateChanged);
    this.props.scene.addEventListener("share_video_enabled", this.onShareVideoEnabled);
    this.props.scene.addEventListener("share_video_disabled", this.onShareVideoDisabled);
    this.props.scene.addEventListener("share_video_failed", this.onShareVideoFailed);
    this.props.scene.addEventListener("exit", this.exitEventHandler);
    this.props.scene.addEventListener("action_exit_watch", () => {
      if (this.state.hide) {
        this.setState({ hide: false });
      } else {
        this.setState({ watching: false });
      }
    });
    this.props.scene.addEventListener("action_toggle_ui", () => this.setState({ hide: !this.state.hide }));

    const scene = this.props.scene;

    this.props.store.addEventListener("statechanged", this.onStoreChanged);

    const unsubscribe = this.props.history.listen((location, action) => {
      const state = location.state;

      // If we just hit back into the entry flow, just go back to the page before the room landing page.
      if (action === "POP" && state && state.entry_step && this.state.entered) {
        unsubscribe();
        navigateToPriorPage(this.props.history);
        return;
      }
    });

    // If we refreshed the page with any state history (eg if we were in the entry flow
    // or had a modal/overlay open) just reset everything to the beginning of the flow by
    // erasing all history that was accumulated for this room (including across refreshes.)
    //
    // We don't do this for the media browser case, since we want to be able to share
    // links to the browser pages
    if (this.props.history.location.state && !sluglessPath(this.props.history.location).startsWith("/media")) {
      popToBeginningOfHubHistory(this.props.history);
    }

    this.setState({
      audioContext: {
        playSound: sound => {
          scene.emit(sound);
        },
        onMouseLeave: () => {
          //          scene.emit("play_sound-hud_mouse_leave");
        }
      }
    });

    if (this.props.forcedVREntryType && this.props.forcedVREntryType.endsWith("_now")) {
      this.props.scene.addEventListener(
        "loading_finished",
        () => {
          setTimeout(() => this.handleForceEntry(), 1000);
        },
        { once: true }
      );
    }

    this.playerRig = scene.querySelector("#avatar-rig");
  }

  UNSAFE_componentWillMount() {
    this.props.store.addEventListener("statechanged", this.storeUpdated);
  }

  componentWillUnmount() {
    this.props.scene.removeEventListener("loaded", this.onSceneLoaded);
    this.props.scene.removeEventListener("exit", this.exitEventHandler);
    this.props.scene.removeEventListener("share_video_enabled", this.onShareVideoEnabled);
    this.props.scene.removeEventListener("share_video_disabled", this.onShareVideoDisabled);
    this.props.scene.removeEventListener("share_video_failed", this.onShareVideoFailed);
    this.props.store.removeEventListener("statechanged", this.storeUpdated);
  }

  storeUpdated = () => {
    this.forceUpdate();
  };

  showContextualSignInDialog = () => {
    const {
      signInMessageId,
      authChannel,
      signInCompleteMessageId,
      signInContinueTextId,
      onContinueAfterSignIn
    } = this.props;

    this.showNonHistoriedDialog(SignInDialog, {
      message: getMessages()[signInMessageId],
      onSignIn: async email => {
        const { authComplete } = await authChannel.startAuthentication(email, this.props.hubChannel);

        this.showNonHistoriedDialog(SignInDialog, { authStarted: true, onClose: onContinueAfterSignIn });

        await authComplete;

        this.setState({ signedIn: true });
        this.showNonHistoriedDialog(SignInDialog, {
          authComplete: true,
          message: getMessages()[signInCompleteMessageId],
          continueText: getMessages()[signInContinueTextId],
          onClose: onContinueAfterSignIn,
          onContinue: onContinueAfterSignIn
        });
      },
      onClose: onContinueAfterSignIn
    });
  };

  updateSubscribedState = () => {
    const isSubscribed = this.props.subscriptions && this.props.subscriptions.isSubscribed();
    this.setState({ isSubscribed });
  };

  toggleFavorited = () => {
    this.props.performConditionalSignIn(
      () => this.props.hubChannel.signedIn,
      () => {
        const isFavorited = this.isFavorited();

        this.props.hubChannel[isFavorited ? "unfavorite" : "favorite"]();
        this.setState({ isFavorited: !isFavorited });
      },
      "favorite-room"
    );
  };

  isFavorited = () => {
    return this.state.isFavorited !== undefined ? this.state.isFavorited : this.props.initialIsFavorited;
  };

  onLoadingFinished = () => {
    this.setState({ noMoreLoadingUpdates: true });
    this.props.scene.emit("loading_finished");
    this.props.scene.addState("loaded");

    if (this.props.onLoaded) {
      this.props.onLoaded();
    }
  };

  onSceneLoaded = () => {
    this.setState({ sceneLoaded: true });
  };

  // TODO: we need to come up with a cleaner way to handle the shared state between aframe and react than emmitting events and setting state on the scene
  onAframeStateChanged = e => {
    if (!(e.detail === "muted" || e.detail === "frozen")) return;
    this.setState({
      [e.detail]: this.props.scene.is(e.detail)
    });
  };

  onShareVideoEnabled = e => {
    this.setState({ videoShareMediaSource: e.detail.source });
  };

  onShareVideoDisabled = () => {
    this.setState({ videoShareMediaSource: null });
  };

  onShareVideoFailed = () => {
    this.setState({ showVideoShareFailed: true });
  };

  toggleMute = () => {
    this.props.scene.emit("action_mute");
  };

  shareVideo = mediaSource => {
    this.props.scene.emit(`action_share_${mediaSource}`);
  };

  endShareVideo = () => {
    this.props.scene.emit("action_end_video_sharing");
  };

  spawnPen = () => {
    this.props.scene.emit("penButtonPressed");
  };

  onSubscribeChanged = async () => {
    if (!this.props.subscriptions) return;

    await this.props.subscriptions.toggle();
    this.updateSubscribedState();
  };

  handleForceEntry = () => {
    if (!this.props.forcedVREntryType) return;

    if (this.props.forcedVREntryType.startsWith("daydream")) {
      this.enterDaydream();
    } else if (this.props.forcedVREntryType.startsWith("vr")) {
      this.enterVR();
    } else if (this.props.forcedVREntryType.startsWith("2d")) {
      this.enter2D();
    }
  };

  startAutoExitTimer = autoExitMessage => {
    if (this.state.autoExitTimerInterval) return;

    const autoExitTimerInterval = setInterval(() => {
      let secondsRemainingBeforeAutoExit = Infinity;

      if (this.state.autoExitTimerStartedAt) {
        const secondsSinceStart = (new Date() - this.state.autoExitTimerStartedAt) / 1000;
        secondsRemainingBeforeAutoExit = Math.max(0, Math.floor(AUTO_EXIT_TIMER_SECONDS - secondsSinceStart));
      }

      this.setState({ secondsRemainingBeforeAutoExit });
      this.checkForAutoExit();
    }, 500);

    this.setState({ autoExitTimerStartedAt: new Date(), autoExitTimerInterval, autoExitMessage });
  };

  checkForAutoExit = () => {
    if (this.state.secondsRemainingBeforeAutoExit !== 0) return;
    this.endAutoExitTimer();
    this.exit();
  };

  exit = reason => {
    window.removeEventListener("concurrentload", this.onConcurrentLoad);
    window.removeEventListener("idle_detected", this.onIdleDetected);
    window.removeEventListener("activity_detected", this.onActivityDetected);

    if (this.props.exitScene) {
      this.props.exitScene(reason);
    }

    this.setState({ exited: true });
  };

  isWaitingForAutoExit = () => {
    return this.state.secondsRemainingBeforeAutoExit <= AUTO_EXIT_TIMER_SECONDS;
  };

  endAutoExitTimer = () => {
    clearInterval(this.state.autoExitTimerInterval);
    this.setState({
      autoExitTimerStartedAt: null,
      autoExitTimerInterval: null,
      autoExitMessage: null,
      secondsRemainingBeforeAutoExit: Infinity
    });
  };

  performDirectEntryFlow = async enterInVR => {
    this.setState({ enterInVR, waitingOnAudio: true });

    const hasGrantedMic = (await grantedMicLabels()).length > 0;

    if (hasGrantedMic) {
      await this.setMediaStreamToDefault();
      this.beginOrSkipAudioSetup();
    } else {
      this.pushHistoryState("entry_step", "mic_grant");
    }

    this.setState({ waitingOnAudio: false });
  };

  enter2D = async () => {
    await this.performDirectEntryFlow(false);
  };

  enterVR = async () => {
    if (this.props.forcedVREntryType || this.props.availableVREntryTypes.generic !== VR_DEVICE_AVAILABILITY.maybe) {
      await this.performDirectEntryFlow(true);
    } else {
      this.pushHistoryState("modal", "webvr");
    }
  };

  enterDaydream = async () => {
    await this.performDirectEntryFlow(true);
  };

  micDeviceChanged = async ev => {
    const constraints = { audio: { deviceId: { exact: [ev.target.value] } } };
    await this.fetchAudioTrack(constraints);
    await this.setupNewMediaStream();
  };

  setMediaStreamToDefault = async () => {
    let hasAudio = false;
    const { lastUsedMicDeviceId } = this.props.store.state.settings;

    // Try to fetch last used mic, if there was one.
    if (lastUsedMicDeviceId) {
      hasAudio = await this.fetchAudioTrack({ audio: { deviceId: { ideal: lastUsedMicDeviceId } } });
    } else {
      hasAudio = await this.fetchAudioTrack({ audio: {} });
    }

    await this.setupNewMediaStream();

    return { hasAudio };
  };

  fetchAudioTrack = async constraints => {
    if (this.state.audioTrack) {
      this.state.audioTrack.stop();
    }

    constraints.audio.echoCancellation =
      window.APP.store.state.preferences.disableEchoCancellation === true ? false : true;
    constraints.audio.noiseSuppression =
      window.APP.store.state.preferences.disableNoiseSuppression === true ? false : true;
    constraints.audio.autoGainControl =
      window.APP.store.state.preferences.disableAutoGainControl === true ? false : true;

    if (isFirefoxReality) {
      //workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1626081
      constraints.audio.echoCancellation =
        window.APP.store.state.preferences.disableEchoCancellation === false ? true : false;
      constraints.audio.noiseSuppression =
        window.APP.store.state.preferences.disableNoiseSuppression === false ? true : false;
      constraints.audio.autoGainControl =
        window.APP.store.state.preferences.disableAutoGainControl === false ? true : false;

      window.APP.store.update({
        preferences: {
          disableEchoCancellation: !constraints.audio.echoCancellation,
          disableNoiseSuppression: !constraints.audio.noiseSuppression,
          disableAutoGainControl: !constraints.audio.autoGainControl
        }
      });
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      const audioSystem = this.props.scene.systems["hubs-systems"].audioSystem;
      audioSystem.addStreamToOutboundAudio("microphone", newStream);
      const mediaStream = audioSystem.outboundStream;
      const audioTrack = newStream.getAudioTracks()[0];

      this.setState({ audioTrack, mediaStream });

      if (/Oculus/.test(navigator.userAgent)) {
        // HACK Oculus Browser 6 seems to randomly end the microphone audio stream. This re-creates it.
        // Note the ended event will only fire if some external event ends the stream, not if we call stop().
        const recreateAudioStream = async () => {
          console.warn(
            "Oculus Browser 6 bug hit: Audio stream track ended without calling stop. Recreating audio stream."
          );

          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          const audioTrack = newStream.getAudioTracks()[0];

          audioSystem.addStreamToOutboundAudio("microphone", newStream);

          this.setState({ audioTrack });

          this.props.scene.emit("local-media-stream-created");

          audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
        };

        audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
      }

      return true;
    } catch (e) {
      // Error fetching audio track, most likely a permission denial.
      console.error("Error during getUserMedia: ", e);
      this.setState({ audioTrack: null });
      return false;
    }
  };

  setupNewMediaStream = async () => {
    await this.fetchMicDevices();

    // we should definitely have an audioTrack at this point unless they denied mic access
    if (this.state.audioTrack) {
      const micDeviceId = this.micDeviceIdForMicLabel(this.micLabelForAudioTrack(this.state.audioTrack));
      if (micDeviceId) {
        this.props.store.update({ settings: { lastUsedMicDeviceId: micDeviceId } });
        console.log(`Selected input device: ${this.micLabelForDeviceId(micDeviceId)}`);
      }
      this.props.scene.emit("local-media-stream-created");
    } else {
      console.log("No available audio tracks");
    }
  };

  onMicGrantButton = async () => {
    if (this.props.location.state && this.props.location.state.entry_step === "mic_grant") {
      const { hasAudio } = await this.setMediaStreamToDefault();

      if (hasAudio) {
        this.pushHistoryState("entry_step", "mic_granted");
      } else {
        this.beginOrSkipAudioSetup();
      }
    } else {
      this.beginOrSkipAudioSetup();
    }
  };

  beginOrSkipAudioSetup = () => {
    const skipAudioSetup = this.props.forcedVREntryType && this.props.forcedVREntryType.endsWith("_now");

    if (skipAudioSetup) {
      this.onAudioReadyButton();
    } else {
      this.pushHistoryState("entry_step", "audio");
    }
  };

  fetchMicDevices = () => {
    return new Promise(resolve => {
      navigator.mediaDevices.enumerateDevices().then(mediaDevices => {
        this.setState(
          {
            micDevices: mediaDevices
              .filter(d => d.kind === "audioinput")
              .map(d => ({ deviceId: d.deviceId, label: d.label }))
          },
          resolve
        );
      });
    });
  };

  shouldShowHmdMicWarning = () => {
    if (isMobile || AFRAME.utils.device.isMobileVR()) return false;
    if (!this.state.enterInVR) return false;
    if (!this.hasHmdMicrophone()) return false;

    return !HMD_MIC_REGEXES.find(r => this.selectedMicLabel().match(r));
  };

  hasHmdMicrophone = () => {
    return !!this.state.micDevices.find(d => HMD_MIC_REGEXES.find(r => d.label.match(r)));
  };

  micLabelForAudioTrack = audioTrack => {
    return (audioTrack && audioTrack.label) || "";
  };

  selectedMicLabel = () => {
    return this.micLabelForAudioTrack(this.state.audioTrack);
  };

  micDeviceIdForMicLabel = label => {
    return this.state.micDevices.filter(d => d.label === label).map(d => d.deviceId)[0];
  };

  micLabelForDeviceId = deviceId => {
    return this.state.micDevices.filter(d => d.deviceId === deviceId).map(d => d.label)[0];
  };

  selectedMicDeviceId = () => {
    return this.micDeviceIdForMicLabel(this.selectedMicLabel());
  };

  shouldShowFullScreen = () => {
    // Disable full screen on iOS, since Safari's fullscreen mode does not let you prevent native pinch-to-zoom gestures.
    return (
      (isMobile || AFRAME.utils.device.isMobileVR()) &&
      !AFRAME.utils.device.isIOS() &&
      !this.state.enterInVR &&
      screenfull.enabled
    );
  };

  onAudioReadyButton = async () => {
    if (!this.state.enterInVR) {
      await showFullScreenIfAvailable();
    }

    // Push the new history state before going into VR, otherwise menu button will take us back
    clearHistoryState(this.props.history);

    const muteOnEntry = this.props.store.state.preferences["muteMicOnEntry"] || false;
    await this.props.enterScene(this.state.mediaStream, this.state.enterInVR, muteOnEntry);

    this.setState({ entered: true, entering: false, showShareDialog: false });

    const mediaStream = this.state.mediaStream;

    if (mediaStream) {
      if (this.state.audioTrack) {
        console.log(`Using microphone: ${this.state.audioTrack.label}`);
      }

      if (mediaStream.getVideoTracks().length > 0) {
        console.log("Screen sharing enabled.");
      }
    }
  };

  attemptLink = async () => {
    this.pushHistoryState("overlay", "link");
    const { code, cancel, onFinished } = await this.props.linkChannel.generateCode();
    this.setState({ linkCode: code, linkCodeCancel: cancel });
    onFinished.then(() => {
      this.setState({ log: false, linkCode: null, linkCodeCancel: null });
      this.exit();
    });
  };

  toggleShareDialog = async () => {
    this.props.store.update({ activity: { hasOpenedShare: true } });
    this.setState({ showShareDialog: !this.state.showShareDialog });
  };

  createObject = media => {
    this.props.scene.emit("add_media", media);
  };

  changeScene = url => {
    this.props.hubChannel.updateScene(url);
  };

  setAvatarUrl = url => {
    this.props.store.update({ profile: { ...this.props.store.state.profile, ...{ avatarId: url } } });
    this.props.scene.emit("avatar_updated");
  };

  closeDialog = () => {
    if (this.state.dialog) {
      this.setState({ dialog: null });
    } else {
      this.props.history.goBack();
    }

    if (isIn2DInterstitial()) {
      exit2DInterstitialAndEnterVR();
    } else {
      showFullScreenIfWasFullScreen();
    }
  };

  showNonHistoriedDialog = (DialogClass, props = {}) => {
    this.setState({
      dialog: <DialogClass {...{ onClose: this.closeDialog, ...props }} />
    });
  };

  toggleStreamerMode = enable => {
    this.props.scene.systems["hubs-systems"].characterController.fly = enable;

    if (enable) {
      this.props.hubChannel.beginStreaming();
      this.setState({ isStreaming: true, showStreamingTip: true });
    } else {
      this.props.hubChannel.endStreaming();
      this.setState({ isStreaming: false });
    }
  };

  renderDialog = (DialogClass, props = {}) => <DialogClass {...{ onClose: this.closeDialog, ...props }} />;

  showSignInDialog = () => {
    this.showNonHistoriedDialog(SignInDialog, {
      message: getMessages()["sign-in.prompt"],
      onSignIn: async authPayload => {
        const { authComplete } = await (authPayload == "oidc"
          ? this.props.authChannel.startOIDCAuthentication(this.props.hubChannel)
          : this.props.authChannel.startAuthentication(authPayload, this.props.hubChannel));

        this.showNonHistoriedDialog(SignInDialog, { authStarted: true });

        await authComplete;

        this.setState({ signedIn: true });
        this.closeDialog();
      }
    });
  };

  signOut = async () => {
    await this.props.authChannel.signOut(this.props.hubChannel);
    this.setState({ signedIn: false });
  };

  showWebRTCScreenshareUnsupportedDialog = () => {
    this.pushHistoryState("modal", "webrtc-screenshare");
  };

  onMiniInviteClicked = () => {
    const link = `https://${configs.SHORTLINK_DOMAIN}/${this.props.hub.hub_id}`;

    this.setState({ miniInviteActivated: true });
    setTimeout(() => {
      this.setState({ miniInviteActivated: false });
    }, 5000);

    if (canShare()) {
      navigator.share({ title: document.title, url: link });
    } else {
      copy(link);
    }
  };

  sendMessage = msg => {
    this.props.onSendMessage(msg);
  };

  occupantCount = () => {
    return this.props.presences ? Object.entries(this.props.presences).length : 0;
  };

  onStoreChanged = () => {
    const broadcastedRoomConfirmed = this.props.store.state.confirmedBroadcastedRooms.includes(this.props.hub.hub_id);
    if (broadcastedRoomConfirmed !== this.state.broadcastTipDismissed) {
      this.setState({ broadcastTipDismissed: broadcastedRoomConfirmed });
    }
  };

  confirmBroadcastedRoom = () => {
    this.props.store.update({ confirmedBroadcastedRooms: [this.props.hub.hub_id] });
  };

  discordBridges = () => {
    if (!this.props.presences) {
      return [];
    } else {
      return discordBridgesForPresences(this.props.presences);
    }
  };

  hasEmbedPresence = () => {
    if (!this.props.presences) {
      return false;
    } else {
      for (const p of Object.values(this.props.presences)) {
        for (const m of p.metas) {
          if (m.context && m.context.embed) {
            return true;
          }
        }
      }
    }

    return false;
  };

  pushHistoryState = (k, v) => pushHistoryState(this.props.history, k, v);

  renderInterstitialPrompt = () => {
    return (
      <WrappedIntlProvider>
        <div className={styles.interstitial} onClick={() => this.props.onInterstitialPromptClicked()}>
          <div>
            <FormattedMessage id="interstitial.prompt" />
          </div>
        </div>
      </WrappedIntlProvider>
    );
  };

  renderExitedPane = () => {
    let subtitle = null;
    if (this.props.roomUnavailableReason === "closed") {
      // TODO i18n, due to links and markup
      subtitle = (
        <div>
          Sorry, this room is no longer available.
          <p />
          <IfFeature name="show_terms">
            A room may be closed by the room owner, or if we receive reports that it violates our{" "}
            <a
              target="_blank"
              rel="noreferrer noopener"
              href={configs.link("terms_of_use", "https://github.com/mozilla/hubs/blob/master/TERMS.md")}
            >
              Terms of Use
            </a>
            .<br />
          </IfFeature>
          If you have questions, contact us at{" "}
          <a href={`mailto:${getMessages()["contact-email"]}`}>
            <FormattedMessage id="contact-email" />
          </a>
          .<p />
          <IfFeature name="show_source_link">
            If you&apos;d like to run your own server, Hubs&apos;s source code is available on{" "}
            <a href="https://github.com/mozilla/hubs">GitHub</a>
            .
          </IfFeature>
        </div>
      );
    } else {
      const reason = this.props.roomUnavailableReason;
      const tcpUrl = new URL(document.location.toString());
      const tcpParams = new URLSearchParams(tcpUrl.search);
      tcpParams.set("force_tcp", true);
      tcpUrl.search = tcpParams.toString();

      const exitSubtitleId = `exit.subtitle.${reason || "exited"}`;
      subtitle = (
        <div>
          <FormattedMessage id={exitSubtitleId} />
          <p />
          {this.props.roomUnavailableReason === "connect_error" && (
            <div>
              You can try <a href={tcpUrl.toString()}>connecting via TCP</a>, which may work better on some networks.
            </div>
          )}
          {!["left", "disconnected", "scene_error"].includes(this.props.roomUnavailableReason) && (
            <div>
              You can also <a href="/">create a new room</a>
              .
            </div>
          )}
        </div>
      );
    }

    return (
      <WrappedIntlProvider>
        <div className="exited-panel">
          <img className="exited-panel__logo" src={configs.image("logo")} />
          <div className="exited-panel__subtitle">{subtitle}</div>
        </div>
      </WrappedIntlProvider>
    );
  };

  renderBotMode = () => {
    return (
      <div className="loading-panel">
        <img className="loading-panel__logo" src={configs.image("logo")} />
        <input type="file" id="bot-audio-input" accept="audio/*" />
        <input type="file" id="bot-data-input" accept="application/json" />
      </div>
    );
  };

  onEnteringCanceled = () => {
    this.props.hubChannel.sendEnteringCancelledEvent();
    this.setState({ entering: false });
  };

  renderEntryStartPanel = () => {
    const { hasAcceptedProfile, hasChangedName } = this.props.store.state.activity;
    const promptForNameAndAvatarBeforeEntry = this.props.hubIsBound ? !hasAcceptedProfile : !hasChangedName;

    return (
      <div className={entryStyles.entryPanel}>
        <div className={entryStyles.name}>
          <button
            aria-label="Close room entry panel and spectate from lobby"
            onClick={() => this.setState({ watching: true })}
            className={entryStyles.collapseButton}
          >
            <i>
              <FontAwesomeIcon icon={faTimes} />
            </i>
          </button>

          {this.props.hubChannel.canOrWillIfCreator("update_hub") ? (
            <button
              className={entryStyles.renameButton}
              onClick={() =>
                this.props.performConditionalSignIn(
                  () => this.props.hubChannel.can("update_hub"),
                  () => this.pushHistoryState("modal", "room_settings"),
                  "room-settings"
                )
              }
            >
              {this.props.hub.name}
            </button>
          ) : (
            <span>{this.props.hub.name}</span>
          )}

          <button
            aria-label="Toggle Favorited"
            onClick={() => this.toggleFavorited()}
            className={classNames({
              [entryStyles.entryFavoriteButton]: true,
              [entryStyles.favoriteButton]: true,
              [entryStyles.favorited]: this.isFavorited()
            })}
          >
            <i title="Favorite">
              <FontAwesomeIcon icon={faStar} />
            </i>
          </button>
        </div>

        <div className={entryStyles.roomSubtitle}>
          <FormattedMessage id="entry.lobby" />
        </div>

        <div className={entryStyles.center}>
          <LobbyChatBox
            occupantCount={this.occupantCount()}
            discordBridges={this.discordBridges()}
            onSendMessage={this.sendMessage}
          />
        </div>

        {!this.state.waitingOnAudio &&
          !this.props.entryDisallowed && (
            <div className={entryStyles.buttonContainer}>
              {!isMobileVR && (
                <button
                  onClick={e => {
                    e.preventDefault();
                    this.attemptLink();
                  }}
                  className={classNames([entryStyles.secondaryActionButton, entryStyles.wideButton])}
                >
                  <FormattedMessage id="entry.device-medium" />
                  <div className={entryStyles.buttonSubtitle}>
                    <FormattedMessage
                      id={isMobile ? "entry.device-subtitle-mobile" : "entry.device-subtitle-desktop"}
                    />
                  </div>
                </button>
              )}
              {configs.feature("enable_lobby_ghosts") ? (
                <button
                  onClick={e => {
                    e.preventDefault();
                    this.setState({ watching: true });
                  }}
                  className={classNames([entryStyles.secondaryActionButton, entryStyles.wideButton])}
                >
                  <FormattedMessage id="entry.watch-from-lobby" />
                  <div className={entryStyles.buttonSubtitle}>
                    <FormattedMessage id="entry.watch-from-lobby-subtitle" />
                  </div>
                </button>
              ) : (
                <div />
              )}
              <button
                autoFocus
                onClick={e => {
                  e.preventDefault();

                  if (promptForNameAndAvatarBeforeEntry || !this.props.forcedVREntryType) {
                    this.setState({ entering: true });
                    this.props.hubChannel.sendEnteringEvent();

                    const stateValue = promptForNameAndAvatarBeforeEntry ? "profile" : "device";
                    this.pushHistoryState("entry_step", stateValue);
                  } else {
                    this.handleForceEntry();
                  }
                }}
                className={classNames([entryStyles.actionButton, entryStyles.wideButton])}
              >
                <FormattedMessage id="entry.enter-room" />
              </button>
            </div>
          )}
        {this.props.entryDisallowed &&
          !this.state.waitingOnAudio && (
            <div className={entryStyles.buttonContainer}>
              <a
                onClick={e => {
                  e.preventDefault();
                  this.setState({ watching: true });
                }}
                className={classNames([entryStyles.secondaryActionButton, entryStyles.wideButton])}
              >
                <FormattedMessage id="entry.entry-disallowed" />
                <div className={entryStyles.buttonSubtitle}>
                  <FormattedMessage id="entry.entry-disallowed-subtitle" />
                </div>
              </a>
            </div>
          )}
        {this.state.waitingOnAudio && (
          <div>
            <div className="loader-wrap loader-mid">
              <div className="loader">
                <div className="loader-center" />
              </div>
            </div>
          </div>
        )}

        {!this.state.waitingOnAudio && (
          <EntryStartPanel
            hubChannel={this.props.hubChannel}
            entering={this.state.entering}
            onEnteringCanceled={this.onEnteringCanceled}
          />
        )}
      </div>
    );
  };

  renderDevicePanel = () => {
    return (
      <div className={entryStyles.entryPanel}>
        <div
          onClick={() => {
            this.props.history.goBack();
          }}
          className={entryStyles.back}
        >
          <i>
            <FontAwesomeIcon icon={faArrowLeft} />
          </i>
          <FormattedMessage id="entry.back" />
        </div>

        <div className={entryStyles.title}>
          <FormattedMessage id="entry.choose-device" />
        </div>

        {!this.state.waitingOnAudio ? (
          <div className={entryStyles.buttonContainer}>
            {this.props.checkingForDeviceAvailability && (
              <div>
                <div className="loader-wrap loader-mid">
                  <div className="loader">
                    <div className="loader-center" />
                  </div>
                </div>
                <FormattedMessage id="entry.checkingForDeviceAvailability" />
              </div>
            )}
            {this.props.availableVREntryTypes.cardboard !== VR_DEVICE_AVAILABILITY.no && (
              <div className={entryStyles.secondary} onClick={this.enterVR}>
                <FormattedMessage id="entry.cardboard" />
              </div>
            )}
            {this.props.availableVREntryTypes.generic !== VR_DEVICE_AVAILABILITY.no && (
              <GenericEntryButton secondary={true} onClick={this.enterVR} />
            )}
            {this.props.availableVREntryTypes.daydream === VR_DEVICE_AVAILABILITY.yes && (
              <DaydreamEntryButton secondary={true} onClick={this.enterDaydream} subtitle={null} />
            )}
            {this.props.availableVREntryTypes.screen === VR_DEVICE_AVAILABILITY.yes && (
              <TwoDEntryButton autoFocus={true} onClick={this.enter2D} />
            )}
          </div>
        ) : (
          <div className={entryStyles.audioLoader}>
            <div className="loader-wrap loader-mid">
              <div className="loader">
                <div className="loader-center" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  renderMicPanel = granted => {
    return (
      <div className="mic-grant-panel">
        <div onClick={() => this.props.history.goBack()} className={entryStyles.back}>
          <i>
            <FontAwesomeIcon icon={faArrowLeft} />
          </i>
          <FormattedMessage id="entry.back" />
        </div>

        <div className="mic-grant-panel__grant-container">
          <div className="mic-grant-panel__title">
            <FormattedMessage id={granted ? "audio.granted-title" : "audio.grant-title"} />
          </div>
          <div className="mic-grant-panel__subtitle">
            <FormattedMessage id={granted ? "audio.granted-subtitle" : "audio.grant-subtitle"} />
          </div>
          <div className="mic-grant-panel__button-container">
            {granted ? (
              <button autoFocus className="mic-grant-panel__button" onClick={this.onMicGrantButton}>
                <img src="../assets/images/mic_granted.png" srcSet="../assets/images/mic_granted@2x.png 2x" />
              </button>
            ) : (
              <button autoFocus className="mic-grant-panel__button" onClick={this.onMicGrantButton}>
                <img src="../assets/images/mic_denied.png" srcSet="../assets/images/mic_denied@2x.png 2x" />
              </button>
            )}
          </div>
          <div className="mic-grant-panel__next-container">
            <button autoFocus className={classNames("mic-grant-panel__next")} onClick={this.onMicGrantButton}>
              <FormattedMessage id="audio.granted-next" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  renderAudioSetupPanel = () => {
    const subtitleId = isMobilePhoneOrVR ? "audio.subtitle-mobile" : "audio.subtitle-desktop";
    const muteOnEntry = this.props.store.state.preferences["muteMicOnEntry"] || false;
    return (
      <div className="audio-setup-panel">
        <div
          onClick={() => {
            this.props.history.goBack();
          }}
          className={entryStyles.back}
        >
          <i>
            <FontAwesomeIcon icon={faArrowLeft} />
          </i>
          <FormattedMessage id="entry.back" />
        </div>

        <div>
          <div className="audio-setup-panel__title">
            <FormattedMessage id="audio.title" />
          </div>
          <div className="audio-setup-panel__subtitle">
            {(isMobilePhoneOrVR || this.state.enterInVR) && <FormattedMessage id={subtitleId} />}
          </div>
          <div className="audio-setup-panel__levels">
            <MicLevelWidget
              scene={this.props.scene}
              hasAudioTrack={!!this.state.audioTrack}
              muteOnEntry={muteOnEntry}
            />
            <OutputLevelWidget />
          </div>
          {this.state.audioTrack && this.state.micDevices.length > 1 ? (
            <div className="audio-setup-panel__device-chooser">
              <select
                className="audio-setup-panel__device-chooser__dropdown"
                value={this.selectedMicDeviceId()}
                onChange={this.micDeviceChanged}
              >
                {this.state.micDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    {d.label}
                  </option>
                ))}
              </select>
              <img
                className="audio-setup-panel__device-chooser__mic-icon"
                src="../assets/images/mic_small.png"
                srcSet="../assets/images/mic_small@2x.png 2x"
              />
              <img
                className="audio-setup-panel__device-chooser__dropdown-arrow"
                src="../assets/images/dropdown_arrow.png"
                srcSet="../assets/images/dropdown_arrow@2x.png 2x"
              />
            </div>
          ) : (
            <div />
          )}
          {this.shouldShowHmdMicWarning() && (
            <div className="audio-setup-panel__hmd-mic-warning">
              <img
                src="../assets/images/warning_icon.png"
                srcSet="../assets/images/warning_icon@2x.png 2x"
                className="audio-setup-panel__hmd-mic-warning__icon"
              />
              <span className="audio-setup-panel__hmd-mic-warning__label">
                <FormattedMessage id="audio.hmd-mic-warning" />
              </span>
            </div>
          )}
        </div>
        <div className="audio-setup-panel__mute-container">
          <input
            id="mute-on-entry"
            type="checkbox"
            onChange={() =>
              this.props.store.update({
                preferences: { muteMicOnEntry: !this.props.store.state.preferences["muteMicOnEntry"] }
              })
            }
            checked={this.props.store.state.preferences["muteMicOnEntry"] || false}
          />
          <label htmlFor="mute-on-entry">
            <FormattedMessage id="entry.mute-on-entry" />
          </label>
        </div>
        <div className="audio-setup-panel__enter-button-container">
          <button autoFocus className="audio-setup-panel__enter-button" onClick={this.onAudioReadyButton}>
            <FormattedMessage id="audio.enter-now" />
          </button>
        </div>
      </div>
    );
  };

  isInModalOrOverlay = () => {
    if (
      this.state.entered &&
      (IN_ROOM_MODAL_ROUTER_PATHS.find(x => sluglessPath(this.props.history.location).startsWith(x)) ||
        IN_ROOM_MODAL_QUERY_VARS.find(x => new URLSearchParams(this.props.history.location.search).get(x)))
    ) {
      return true;
    }

    if (
      !this.state.entered &&
      (LOBBY_MODAL_ROUTER_PATHS.find(x => sluglessPath(this.props.history.location).startsWith(x)) ||
        LOBBY_MODAL_QUERY_VARS.find(
          (x, i) => new URLSearchParams(this.props.history.location.search).get(x) === LOBBY_MODAL_QUERY_VALUES[i]
        ))
    ) {
      return true;
    }

    if (this.state.objectInfo && this.state.objectInfo.object3D) {
      return true; // TODO: Get object info dialog to use history
    }
    if (this.state.isObjectListExpanded) {
      return true;
    }

    return !!(
      (this.props.history &&
        this.props.history.location.state &&
        (this.props.history.location.state.modal || this.props.history.location.state.overlay)) ||
      this.state.dialog
    );
  };

  render() {
    const rootStyles = {
      [styles.ui]: true,
      "ui-root": true,
      "in-modal-or-overlay": this.isInModalOrOverlay(),
      isGhost: configs.feature("enable_lobby_ghosts") && (this.state.watching || (this.state.hide || this.props.hide)),
      hide: this.state.hide || this.props.hide
    };
    if (this.props.hide || this.state.hide) return <div className={classNames(rootStyles)} />;

    const isExited = this.state.exited || this.props.roomUnavailableReason;
    const preload = this.props.showPreload;

    const isLoading =
      !preload && (!this.state.hideLoader || !this.state.didConnectToNetworkedScene) && !this.props.showSafariMicDialog;

    const hasPush = navigator.serviceWorker && "PushManager" in window;

    if (this.props.showOAuthDialog && !this.props.showInterstitialPrompt)
      return (
        <WrappedIntlProvider>
          <div className={classNames(rootStyles)}>
            <OAuthDialog onClose={this.props.onCloseOAuthDialog} oauthInfo={this.props.oauthInfo} />
          </div>
        </WrappedIntlProvider>
      );
    if (isExited) return this.renderExitedPane();
    if (isLoading && this.state.showPrefs) {
      return (
        <div>
          <Loader
            scene={this.props.scene}
            finished={this.state.noMoreLoadingUpdates}
            onLoaded={this.onLoadingFinished}
          />
          <PreferencesScreen
            onClose={() => {
              this.setState({ showPrefs: false });
            }}
            store={this.props.store}
          />
        </div>
      );
    }
    if (isLoading) {
      return (
        <Loader scene={this.props.scene} finished={this.state.noMoreLoadingUpdates} onLoaded={this.onLoadingFinished} />
      );
    }
    if (this.state.showPrefs) {
      return (
        <PreferencesScreen
          onClose={() => {
            this.setState({ showPrefs: false });
          }}
          store={this.props.store}
        />
      );
    }

    if (this.props.showInterstitialPrompt) return this.renderInterstitialPrompt();
    if (this.props.isBotMode) return this.renderBotMode();

    const embed = this.props.embed;
    const entered = this.state.entered;
    const watching = this.state.watching;
    const enteredOrWatching = entered || watching;
    const enteredOrWatchingOrPreload = entered || watching || preload;
    const showRtcDebugPanel = this.props.store.state.preferences["showRtcDebugPanel"];
    const baseUrl = `${location.protocol}//${location.host}${location.pathname}`;
    const inEntryFlow = !!(
      this.props.history &&
      this.props.history.location.state &&
      this.props.history.location.state.entry_step
    );

    const entryDialog =
      this.props.availableVREntryTypes &&
      !preload &&
      (this.isWaitingForAutoExit() ? (
        <AutoExitWarning
          message={this.state.autoExitMessage}
          secondsRemaining={this.state.secondsRemainingBeforeAutoExit}
          onCancel={this.endAutoExitTimer}
        />
      ) : (
        <div className={entryStyles.entryDialog}>
          <StateRoute stateKey="entry_step" stateValue="device" history={this.props.history}>
            {this.renderDevicePanel()}
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="mic_grant" history={this.props.history}>
            {this.renderMicPanel(false)}
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="mic_granted" history={this.props.history}>
            {this.renderMicPanel(true)}
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="audio" history={this.props.history}>
            {this.renderAudioSetupPanel()}
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="" history={this.props.history}>
            {this.renderEntryStartPanel()}
          </StateRoute>
        </div>
      ));

    const dialogBoxContentsClassNames = classNames({
      [styles.uiInteractive]: !this.isInModalOrOverlay(),
      [styles.uiDialogBoxContents]: true,
      [styles.backgrounded]: this.isInModalOrOverlay()
    });

    // MobileVR browsers always show settings panel as an overlay when exiting immersive mode.
    const showSettingsAsOverlay = entered && isMobileVR;

    const presenceLogEntries = this.props.presenceLogEntries || [];

    const switchToInspectingObject = el => {
      const src = el.components["media-loader"].data.src;
      this.setState({ objectInfo: el, objectSrc: src });
      const cameraSystem = this.props.scene.systems["hubs-systems"].cameraSystem;
      cameraSystem.uninspect();
      cameraSystem.inspect(el.object3D, el.object3D, 1.5, true);
    };

    const mediaSource = this.props.mediaSearchStore.getUrlMediaSource(this.props.history.location);

    // Allow scene picker pre-entry, otherwise wait until entry
    const showMediaBrowser =
      mediaSource && (["scenes", "avatars", "favorites"].includes(mediaSource) || this.state.entered);
    const hasTopTip = (this.props.activeTips && this.props.activeTips.top) || this.state.showVideoShareFailed;

    const clientInfoClientId = getClientInfoClientId(this.props.history.location);
    const showClientInfo = !!clientInfoClientId;
    const showObjectInfo = !!(this.state.objectInfo && this.state.objectInfo.object3D);

    const discordBridges = this.discordBridges();
    const discordSnippet = discordBridges.map(ch => "#" + ch).join(", ");
    const hasEmbedPresence = this.hasEmbedPresence();
    const hasDiscordBridges = discordBridges.length > 0;
    const showBroadcastTip =
      (hasDiscordBridges || (hasEmbedPresence && !this.props.embed)) && !this.state.broadcastTipDismissed;

    const inviteEntryMode = this.props.hub && this.props.hub.entry_mode === "invite";
    const showInviteButton = !showObjectInfo && !this.state.frozen && !watching && !preload && !inviteEntryMode;

    const showInviteTip =
      !showObjectInfo &&
      !hasTopTip &&
      !entered &&
      !embed &&
      !preload &&
      !watching &&
      !hasTopTip &&
      !inEntryFlow &&
      !this.props.store.state.activity.hasOpenedShare &&
      this.occupantCount() <= 1;

    const showChooseSceneButton =
      !showObjectInfo &&
      !entered &&
      !embed &&
      !preload &&
      !watching &&
      !showInviteTip &&
      !this.state.showShareDialog &&
      this.props.hubChannel &&
      this.props.hubChannel.canOrWillIfCreator("update_hub");

    const streaming = this.state.isStreaming;

    const showTopHud = enteredOrWatching && !showObjectInfo;
    const showSettingsMenu = !streaming && !preload && !showObjectInfo;
    const showObjectList = !showObjectInfo;
    const showPresenceList = !showObjectInfo;

    const displayNameOverride = this.props.hubIsBound
      ? getPresenceProfileForSession(this.props.presences, this.props.sessionId).displayName
      : null;

    const streamingTip = streaming &&
      this.state.showStreamingTip && (
        <div className={classNames([styles.streamingTip])}>
          <div className={classNames([styles.streamingTipAttachPoint])} />
          <button
            title="Dismiss"
            className={styles.streamingTipClose}
            onClick={() => this.setState({ showStreamingTip: false })}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>

          <div className={styles.streamingTipMessage}>
            <FormattedMessage id="tips.streaming" />
          </div>
        </div>
      );

    const streamer = getCurrentStreamer();
    const streamerName = streamer && streamer.displayName;

    return (
      <ReactAudioContext.Provider value={this.state.audioContext}>
        <WrappedIntlProvider>
          <div className={classNames(rootStyles)}>
            {this.state.dialog}
            {preload &&
              this.props.hub && (
                <PreloadOverlay
                  hubName={this.props.hub.name}
                  hubScene={this.props.hub.scene}
                  baseUrl={baseUrl}
                  onLoadClicked={this.props.onPreloadLoadClicked}
                />
              )}
            <StateRoute
              stateKey="overlay"
              stateValue="profile"
              history={this.props.history}
              render={props => (
                <ProfileEntryPanel
                  {...props}
                  displayNameOverride={displayNameOverride}
                  finished={() => this.pushHistoryState()}
                  onClose={() => this.pushHistoryState()}
                  store={this.props.store}
                  mediaSearchStore={this.props.mediaSearchStore}
                  avatarId={props.location.state.detail && props.location.state.detail.avatarId}
                />
              )}
            />
            <StateRoute
              stateKey="overlay"
              stateValue="avatar-editor"
              history={this.props.history}
              render={props => (
                <AvatarEditor
                  className={styles.avatarEditor}
                  signedIn={this.state.signedIn}
                  onSignIn={this.showSignInDialog}
                  onSave={() => {
                    if (props.location.state.detail && props.location.state.detail.returnToProfile) {
                      this.props.history.goBack();
                    } else {
                      this.props.history.goBack();
                      // We are returning to the media browser. Trigger an update so that the filter switches to
                      // my-avatars, now that we've saved an avatar.
                      this.props.mediaSearchStore.sourceNavigateWithNoNav("avatars", "use");
                    }
                    this.props.onAvatarSaved();
                  }}
                  onClose={() => this.props.history.goBack()}
                  store={this.props.store}
                  debug={avatarEditorDebug}
                  avatarId={props.location.state.detail && props.location.state.detail.avatarId}
                  hideDelete={props.location.state.detail && props.location.state.detail.hideDelete}
                />
              )}
            />
            {showMediaBrowser && (
              <MediaBrowser
                history={this.props.history}
                mediaSearchStore={this.props.mediaSearchStore}
                hubChannel={this.props.hubChannel}
                onMediaSearchResultEntrySelected={(entry, selectAction) => {
                  if (entry.type === "room") {
                    this.showNonHistoriedDialog(LeaveRoomDialog, {
                      destinationUrl: entry.url,
                      messageType: "join-room"
                    });
                  } else {
                    this.props.onMediaSearchResultEntrySelected(entry, selectAction);
                  }
                }}
                performConditionalSignIn={this.props.performConditionalSignIn}
              />
            )}
            <StateRoute
              stateKey="entry_step"
              stateValue="profile"
              history={this.props.history}
              render={props => (
                <ProfileEntryPanel
                  {...props}
                  displayNameOverride={displayNameOverride}
                  finished={() => {
                    if (this.props.forcedVREntryType) {
                      this.pushHistoryState();
                      this.handleForceEntry();
                    } else {
                      this.pushHistoryState("entry_step", "device");
                    }
                  }}
                  onClose={() => this.pushHistoryState()}
                  store={this.props.store}
                  mediaSearchStore={this.props.mediaSearchStore}
                  avatarId={props.location.state.detail && props.location.state.detail.avatarId}
                />
              )}
            />
            <StateRoute
              stateKey="modal"
              stateValue="room_settings"
              history={this.props.history}
              render={() =>
                this.renderDialog(RoomSettingsDialog, {
                  showPublicRoomSetting: this.props.hubChannel.can("update_hub_promotion"),
                  initialSettings: {
                    name: this.props.hub.name,
                    description: this.props.hub.description,
                    member_permissions: this.props.hub.member_permissions,
                    room_size: this.props.hub.room_size,
                    allow_promotion: this.props.hub.allow_promotion,
                    entry_mode: this.props.hub.entry_mode
                  },
                  onChange: settings => this.props.hubChannel.updateHub(settings),
                  hubChannel: this.props.hubChannel
                })
              }
            />
            <StateRoute
              stateKey="modal"
              stateValue="close_room"
              history={this.props.history}
              render={() =>
                this.renderDialog(CloseRoomDialog, {
                  roomName: this.props.hub.name,
                  onConfirm: () => this.props.hubChannel.closeHub()
                })
              }
            />
            <StateRoute
              stateKey="modal"
              stateValue="support"
              history={this.props.history}
              render={() => this.renderDialog(InviteTeamDialog, { hubChannel: this.props.hubChannel })}
            />
            <StateRoute
              stateKey="modal"
              stateValue="create"
              history={this.props.history}
              render={() => this.renderDialog(CreateObjectDialog, { onCreate: this.createObject })}
            />
            <StateRoute
              stateKey="modal"
              stateValue="change_scene"
              history={this.props.history}
              render={() => this.renderDialog(ChangeSceneDialog, { onChange: this.changeScene })}
            />
            <StateRoute
              stateKey="modal"
              stateValue="avatar_url"
              history={this.props.history}
              render={() => this.renderDialog(AvatarUrlDialog, { onChange: this.setAvatarUrl })}
            />
            <StateRoute
              stateKey="modal"
              stateValue="webvr"
              history={this.props.history}
              render={() => this.renderDialog(WebVRRecommendDialog)}
            />
            <StateRoute
              stateKey="modal"
              stateValue="webrtc-screenshare"
              history={this.props.history}
              render={() => this.renderDialog(WebRTCScreenshareUnsupportedDialog)}
            />
            <StateRoute
              stateKey="modal"
              stateValue="room_info"
              history={this.props.history}
              render={() => {
                return this.renderDialog(RoomInfoDialog, {
                  store: this.props.store,
                  scene: this.props.hub.scene,
                  hubName: this.props.hub.name,
                  hubDescription: this.props.hub.description
                });
              }}
            />
            <StateRoute
              stateKey="modal"
              stateValue="feedback"
              history={this.props.history}
              render={() =>
                this.renderDialog(FeedbackDialog, {
                  history: this.props.history,
                  onClose: () => this.pushHistoryState("modal", null)
                })
              }
            />
            <StateRoute
              stateKey="modal"
              stateValue="help"
              history={this.props.history}
              render={() =>
                this.renderDialog(HelpDialog, {
                  history: this.props.history,
                  onClose: () => this.pushHistoryState("modal", null)
                })
              }
            />
            <StateRoute
              stateKey="modal"
              stateValue="tweet"
              history={this.props.history}
              render={() => this.renderDialog(TweetDialog, { history: this.props.history, onClose: this.closeDialog })}
            />
            {showClientInfo && (
              <ClientInfoDialog
                clientId={clientInfoClientId}
                onClose={this.closeDialog}
                history={this.props.history}
                presences={this.props.presences}
                hubChannel={this.props.hubChannel}
                showNonHistoriedDialog={this.showNonHistoriedDialog}
                performConditionalSignIn={this.props.performConditionalSignIn}
              />
            )}
            {showObjectInfo && (
              <ObjectInfoDialog
                scene={this.props.scene}
                el={this.state.objectInfo}
                src={this.state.objectSrc}
                pinned={this.state.objectInfo && this.state.objectInfo.components["networked"].data.persistent}
                hubChannel={this.props.hubChannel}
                onPinChanged={() => switchToInspectingObject(this.state.objectInfo)}
                onNavigated={el => switchToInspectingObject(el)}
                onClose={() => {
                  if (this.props.scene.systems["hubs-systems"].cameraSystem.mode === CAMERA_MODE_INSPECT) {
                    this.props.scene.systems["hubs-systems"].cameraSystem.uninspect();
                  }
                  this.setState({ isObjectListExpanded: false, objectInfo: null });
                }}
              />
            )}
            {((!enteredOrWatching && !this.state.isObjectListExpanded && !showObjectInfo && this.props.hub) ||
              this.isWaitingForAutoExit()) && (
              <div className={styles.uiDialog}>
                <PresenceLog
                  entries={presenceLogEntries}
                  presences={this.props.presences}
                  hubId={this.props.hub.hub_id}
                  history={this.props.history}
                />
                <div className={dialogBoxContentsClassNames}>{entryDialog}</div>
              </div>
            )}
            {enteredOrWatchingOrPreload &&
              this.props.hub && (
                <PresenceLog
                  inRoom={true}
                  presences={this.props.presences}
                  entries={presenceLogEntries}
                  hubId={this.props.hub.hub_id}
                  history={this.props.history}
                />
              )}
            {entered &&
              this.props.activeTips &&
              this.props.activeTips.bottom &&
              (!presenceLogEntries || presenceLogEntries.length === 0) &&
              !showBroadcastTip && (
                <Tip tip={this.props.activeTips.bottom} tipRegion="bottom" pushHistoryState={this.pushHistoryState} />
              )}
            {enteredOrWatchingOrPreload &&
              showBroadcastTip && (
                <Tip
                  tip={hasDiscordBridges ? "discord" : "embed"}
                  broadcastTarget={discordSnippet}
                  onClose={() => this.confirmBroadcastedRoom()}
                />
              )}
            {enteredOrWatchingOrPreload &&
              !this.state.objectInfo &&
              !this.state.frozen && (
                <InWorldChatBox
                  discordBridges={discordBridges}
                  onSendMessage={this.sendMessage}
                  onObjectCreated={this.createObject}
                  enableSpawning={entered}
                  history={this.props.history}
                />
              )}
            {showRtcDebugPanel && (
              <RTCDebugPanel
                history={this.props.history}
                store={window.APP.store}
                scene={this.props.scene}
                presences={this.props.presences}
                sessionId={this.props.sessionId}
              />
            )}
            {this.state.frozen && (
              <button className={styles.leaveButton} onClick={() => this.exit("left")}>
                <FormattedMessage id="entry.leave-room" />
              </button>
            )}
            {showInviteButton && (
              <div
                className={classNames({
                  [inviteStyles.inviteContainer]: true,
                  [inviteStyles.inviteContainerBelowHud]: entered,
                  [inviteStyles.inviteContainerInverted]: this.state.showShareDialog
                })}
              >
                {!embed &&
                  !streaming && (
                    <button
                      className={classNames({
                        [inviteStyles.inviteButton]: true,
                        [inviteStyles.hideSmallScreens]: this.occupantCount() > 1 && entered,
                        [inviteStyles.inviteButtonLowered]: hasTopTip
                      })}
                      onClick={() => this.toggleShareDialog()}
                    >
                      <FormattedMessage id="entry.share-button" />
                    </button>
                  )}
                {showChooseSceneButton && (
                  <button
                    className={classNames([styles.chooseSceneButton])}
                    onClick={() => {
                      this.props.performConditionalSignIn(
                        () => this.props.hubChannel.can("update_hub"),
                        () => {
                          showFullScreenIfAvailable();
                          this.props.mediaSearchStore.sourceNavigateWithNoNav("scenes", "use");
                        },
                        "change-scene"
                      );
                    }}
                  >
                    <FormattedMessage id="entry.change-scene" />
                  </button>
                )}

                {showInviteTip && (
                  <div className={styles.inviteTip}>
                    <div className={styles.inviteTipAttachPoint} />
                    <FormattedMessage id={`entry.${isMobile ? "mobile" : "desktop"}.invite-tip`} />
                  </div>
                )}
                {!embed &&
                  this.occupantCount() > 1 &&
                  !hasTopTip &&
                  entered &&
                  !streaming && (
                    <button onClick={this.onMiniInviteClicked} className={inviteStyles.inviteMiniButton}>
                      <span>
                        {this.state.miniInviteActivated
                          ? navigator.share
                            ? "sharing..."
                            : "copied!"
                          : `${configs.SHORTLINK_DOMAIN}/` + this.props.hub.hub_id}
                      </span>
                    </button>
                  )}
                {embed && (
                  <a href={baseUrl} className={inviteStyles.enterButton} target="_blank" rel="noopener noreferrer">
                    <FormattedMessage id="entry.open-in-window" />
                  </a>
                )}
                {this.state.showShareDialog && (
                  <InviteDialog
                    allowShare={!isMobileVR}
                    entryCode={this.props.hub.entry_code}
                    embedUrl={
                      this.props.embedToken && !isMobilePhoneOrVR
                        ? `${baseUrl}?embed_token=${this.props.embedToken}`
                        : null
                    }
                    hasPush={hasPush}
                    isSubscribed={
                      this.state.isSubscribed === undefined ? this.props.initialIsSubscribed : this.state.isSubscribed
                    }
                    onSubscribeChanged={() => this.onSubscribeChanged()}
                    hubId={this.props.hub.hub_id}
                    onClose={() => this.setState({ showShareDialog: false })}
                  />
                )}
              </div>
            )}
            <StateRoute
              stateKey="overlay"
              stateValue="invite"
              history={this.props.history}
              render={() => (
                <InviteDialog
                  allowShare={!!navigator.share}
                  entryCode={this.props.hub.entry_code}
                  hubId={this.props.hub.hub_id}
                  isModal={true}
                  onClose={() => {
                    this.props.history.goBack();
                    exit2DInterstitialAndEnterVR();
                  }}
                />
              )}
            />
            <StateRoute
              stateKey="overlay"
              stateValue="link"
              history={this.props.history}
              render={() => (
                <LinkDialog
                  linkCode={this.state.linkCode}
                  onClose={() => {
                    this.state.linkCodeCancel();
                    this.setState({ linkCode: null, linkCodeCancel: null });
                    this.props.history.goBack();
                  }}
                />
              )}
            />
            {streaming && (
              <button
                title="Exit Camera Mode"
                onClick={() => this.toggleStreamerMode(false)}
                className={classNames([styles.cornerButton, styles.cameraModeExitButton])}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
            {streamingTip}

            {showObjectList && (
              <ObjectList
                scene={this.props.scene}
                onExpand={(expand, uninspect) => {
                  if (expand) {
                    this.setState({ isPresenceListExpanded: false, isObjectListExpanded: expand });
                  } else {
                    this.setState({ isObjectListExpanded: expand });
                  }

                  if (uninspect) {
                    this.setState({ objectInfo: null });
                    if (this.props.scene.systems["hubs-systems"].cameraSystem.mode === CAMERA_MODE_INSPECT) {
                      this.props.scene.systems["hubs-systems"].cameraSystem.uninspect();
                    }
                  }
                }}
                expanded={this.state.isObjectListExpanded && !this.state.isPresenceListExpanded}
                onInspectObject={el => switchToInspectingObject(el)}
              />
            )}

            {showPresenceList && (
              <PresenceList
                hubChannel={this.props.hubChannel}
                history={this.props.history}
                presences={this.props.presences}
                sessionId={this.props.sessionId}
                signedIn={this.state.signedIn}
                displayName={
                  this.props.store.state.credentials.displayName || maskEmail(this.props.store.state.credentials.email)
                }
                onSignIn={this.showSignInDialog}
                onSignOut={this.signOut}
                expanded={!this.state.isObjectListExpanded && this.state.isPresenceListExpanded}
                onExpand={expand => {
                  if (expand) {
                    this.setState({ isPresenceListExpanded: expand, isObjectListExpanded: false });
                  } else {
                    this.setState({ isPresenceListExpanded: expand });
                  }
                }}
              />
            )}

            {showSettingsMenu && (
              <SettingsMenu
                history={this.props.history}
                mediaSearchStore={this.props.mediaSearchStore}
                isStreaming={streaming}
                toggleStreamerMode={this.toggleStreamerMode}
                hubChannel={this.props.hubChannel}
                hubScene={this.props.hub && this.props.hub.scene}
                scene={this.props.scene}
                showAsOverlay={showSettingsAsOverlay}
                onCloseOverlay={() => exit2DInterstitialAndEnterVR(true)}
                performConditionalSignIn={this.props.performConditionalSignIn}
                showNonHistoriedDialog={this.showNonHistoriedDialog}
                showPreferencesScreen={() => {
                  this.setState({ showPrefs: true });
                }}
                pushHistoryState={this.pushHistoryState}
              />
            )}
            {!entered && !streaming && !isMobile && streamerName && <SpectatingLabel name={streamerName} />}
            {showTopHud && (
              <div className={styles.topHud}>
                <TwoDHUD.TopHUD
                  scene={this.props.scene}
                  history={this.props.history}
                  mediaSearchStore={this.props.mediaSearchStore}
                  muted={this.state.muted}
                  frozen={this.state.frozen}
                  watching={this.state.watching}
                  onWatchEnded={() => this.setState({ watching: false })}
                  videoShareMediaSource={this.state.videoShareMediaSource}
                  showVideoShareFailed={this.state.showVideoShareFailed}
                  hideVideoShareFailedTip={() => this.setState({ showVideoShareFailed: false })}
                  activeTip={this.props.activeTips && this.props.activeTips.top}
                  isCursorHoldingPen={this.props.isCursorHoldingPen}
                  hasActiveCamera={this.props.hasActiveCamera}
                  onToggleMute={this.toggleMute}
                  onSpawnPen={this.spawnPen}
                  onSpawnCamera={() => this.props.scene.emit("action_toggle_camera")}
                  onShareVideo={this.shareVideo}
                  onEndShareVideo={this.endShareVideo}
                  onShareVideoNotCapable={() => this.showWebRTCScreenshareUnsupportedDialog()}
                  isStreaming={streaming}
                  showStreamingTip={this.state.showStreamingTip}
                  hideStreamingTip={() => {
                    this.setState({ showStreamingTip: false });
                  }}
                />
                {!watching && !streaming ? (
                  <UnlessFeature name="show_feedback_ui">
                    <div className={styles.nagCornerButton}>
                      <button onClick={() => this.pushHistoryState("modal", "help")} className={styles.helpButton}>
                        <i>
                          <FontAwesomeIcon icon={faQuestion} />
                        </i>
                      </button>
                    </div>
                  </UnlessFeature>
                ) : (
                  <div className={styles.nagCornerButton}>
                    <button onClick={() => this.setState({ hide: true })}>
                      <FormattedMessage id="hide-ui.prompt" />
                    </button>
                  </div>
                )}
                {!watching &&
                  !streaming && (
                    <IfFeature name="show_feedback_ui">
                      <div className={styles.nagCornerButton}>
                        <button onClick={() => this.pushHistoryState("modal", "feedback")}>
                          <FormattedMessage id="feedback.prompt" />
                        </button>
                      </div>
                    </IfFeature>
                  )}

                {!streaming && (
                  <button
                    aria-label="Toggle Favorited"
                    onClick={() => this.toggleFavorited()}
                    className={classNames({
                      [entryStyles.favorited]: this.isFavorited(),
                      [styles.inRoomFavoriteButton]: true
                    })}
                  >
                    <i title="Favorite">
                      <FontAwesomeIcon icon={faStar} />
                    </i>
                  </button>
                )}
              </div>
            )}
          </div>
        </WrappedIntlProvider>
      </ReactAudioContext.Provider>
    );
  }
}

export default UIRoot;
