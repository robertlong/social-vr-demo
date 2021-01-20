import { Validator } from "jsonschema";
import merge from "deepmerge";
import Cookies from "js-cookie";
import jwtDecode from "jwt-decode";
import { qsGet } from "../utils/qs_truthy.js";

const LOCAL_STORE_KEY = "___hubs_store";
const STORE_STATE_CACHE_KEY = Symbol();
const OAUTH_FLOW_CREDENTIALS_KEY = "ret-oauth-flow-account-credentials";
const validator = new Validator();
import { EventTarget } from "event-target-shim";
import { fetchRandomDefaultAvatarId, generateRandomName } from "../utils/identity.js";

export const defaultMaterialQualitySetting = (function() {
  const MATERIAL_QUALITY_OPTIONS = ["low", "medium", "high"];

  // HACK: AFRAME is not available on all pages, so we catch the ReferenceError.
  // We could move AFRAME's device utils into a separate package (or into this repo)
  // if we wanted to use these checks without having to import all of AFRAME.
  const isMobile = window.AFRAME && (AFRAME.utils.device.isMobile() || AFRAME.utils.device.isMobileVR());
  if (isMobile) {
    const qsMobileDefault = qsGet("default_mobile_material_quality");
    if (qsMobileDefault && MATERIAL_QUALITY_OPTIONS.indexOf(qsMobileDefault) !== -1) {
      return qsMobileDefault;
    }
    return "low";
  }

  const qsDefault = qsGet("default_material_quality");
  if (qsDefault && MATERIAL_QUALITY_OPTIONS.indexOf(qsDefault) !== -1) {
    return qsDefault;
  }

  return "high";
})();

// Durable (via local-storage) schema-enforced state that is meant to be consumed via forward data flow.
// (Think flux but with way less incidental complexity, at least for now :))
export const SCHEMA = {
  id: "/HubsStore",

  definitions: {
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        displayName: { type: "string", pattern: "^[A-Za-z0-9 -]{3,32}$" },
        avatarId: { type: "string" },
        // personalAvatarId is obsolete, but we need it here for backwards compatibility.
        personalAvatarId: { type: "string" }
      }
    },

    credentials: {
      type: "object",
      additionalProperties: false,
      properties: {
        token: { type: ["null", "string"] },
        email: { type: ["null", "string"] },
        displayName: { type: ["null", "string"] }
      }
    },

    activity: {
      type: "object",
      additionalProperties: false,
      properties: {
        hasFoundFreeze: { type: "boolean" },
        hasChangedName: { type: "boolean" },
        hasAcceptedProfile: { type: "boolean" },
        lastEnteredAt: { type: "string" },
        hasPinned: { type: "boolean" },
        hasRotated: { type: "boolean" },
        hasRecentered: { type: "boolean" },
        hasScaled: { type: "boolean" },
        hasHoveredInWorldHud: { type: "boolean" },
        hasOpenedShare: { type: "boolean" },
        entryCount: { type: "number" }
      }
    },

    settings: {
      type: "object",
      additionalProperties: false,
      properties: {
        lastUsedMicDeviceId: { type: "string" }
      }
    },

    preferences: {
      type: "object",
      additionalProperties: false,
      properties: {
        shouldPromptForRefresh: { type: "bool" },
        preferredCamera: { type: "string" },
        muteMicOnEntry: { type: "bool" },
        audioOutputMode: { type: "string" },
        audioNormalization: { type: "bool" },
        invertTouchscreenCameraMove: { type: "bool" },
        enableOnScreenJoystickLeft: { type: "bool" },
        enableOnScreenJoystickRight: { type: "bool" },
        enableGyro: { type: "bool" },
        onlyShowNametagsInFreeze: { type: "bool" },
        animateWaypointTransitions: { type: "bool" },
        allowMultipleHubsInstances: { type: "bool" },
        disableIdleDetection: { type: "bool" },
        preferMobileObjectInfoPanel: { type: "bool" },
        maxResolutionWidth: { type: "number" },
        maxResolutionHeight: { type: "number" },
        globalVoiceVolume: { type: "number" },
        globalMediaVolume: { type: "number" },
        snapRotationDegrees: { type: "number" },
        materialQualitySetting: { type: "string" },
        enableDynamicShadows: { type: "bool" },
        disableSoundEffects: { type: "bool" },
        disableMovement: { type: "bool" },
        disableBackwardsMovement: { type: "bool" },
        disableStrafing: { type: "bool" },
        disableTeleporter: { type: "bool" },
        disableAutoPixelRatio: { type: "bool" },
        movementSpeedModifier: { type: "number" },
        disableEchoCancellation: { type: "bool" },
        disableNoiseSuppression: { type: "bool" },
        disableAutoGainControl: { type: "bool" },
        locale: { type: "string" },
        showRtcDebugPanel: { type: "bool" }
      }
    },

    // Legacy
    confirmedDiscordRooms: {
      type: "array",
      items: { type: "string" }
    },

    confirmedBroadcastedRooms: {
      type: "array",
      items: { type: "string" }
    },

    uploadPromotionTokens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fileId: { type: "string" },
          promotionToken: { type: "string" }
        }
      }
    },

    creatorAssignmentTokens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          hubId: { type: "string" },
          creatorAssignmentToken: { type: "string" }
        }
      }
    },

    embedTokens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          hubId: { type: "string" },
          embedToken: { type: "string" }
        }
      }
    },

    onLoadActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          args: { type: "object" }
        }
      }
    }
  },

  type: "object",

  properties: {
    profile: { $ref: "#/definitions/profile" },
    credentials: { $ref: "#/definitions/credentials" },
    activity: { $ref: "#/definitions/activity" },
    settings: { $ref: "#/definitions/settings" },
    preferences: { $ref: "#/definitions/preferences" },
    confirmedDiscordRooms: { $ref: "#/definitions/confirmedDiscordRooms" }, // Legacy
    confirmedBroadcastedRooms: { $ref: "#/definitions/confirmedBroadcastedRooms" },
    uploadPromotionTokens: { $ref: "#/definitions/uploadPromotionTokens" },
    creatorAssignmentTokens: { $ref: "#/definitions/creatorAssignmentTokens" },
    embedTokens: { $ref: "#/definitions/embedTokens" },
    onLoadActions: { $ref: "#/definitions/onLoadActions" }
  },

  additionalProperties: false
};

export default class Store extends EventTarget {
  constructor() {
    super();

    if (localStorage.getItem(LOCAL_STORE_KEY) === null) {
      localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify({}));
    }

    // When storage is updated in another window
    window.addEventListener("storage", e => {
      if (e.key !== LOCAL_STORE_KEY) return;
      delete this[STORE_STATE_CACHE_KEY];
      this.dispatchEvent(new CustomEvent("statechanged"));
    });

    this.update({
      activity: {},
      settings: {},
      credentials: {},
      profile: {},
      confirmedDiscordRooms: [],
      confirmedBroadcastedRooms: [],
      uploadPromotionTokens: [],
      creatorAssignmentTokens: [],
      embedTokens: [],
      onLoadActions: [],
      preferences: {}
    });

    this._shouldResetAvatarOnInit = false;

    const oauthFlowCredentials = Cookies.getJSON(OAUTH_FLOW_CREDENTIALS_KEY);
    if (oauthFlowCredentials) {
      this.update({ credentials: oauthFlowCredentials });
      this._shouldResetAvatarOnInit = true;
      Cookies.remove(OAUTH_FLOW_CREDENTIALS_KEY);
    }

    this._signOutOnExpiredAuthToken();
  }

  _signOutOnExpiredAuthToken = () => {
    if (!this.state.credentials.token) return;

    const expiry = jwtDecode(this.state.credentials.token).exp * 1000;
    if (expiry <= Date.now()) {
      this.update({ credentials: { token: null, email: null, displayName: null } });
    }
  };

  initProfile = async () => {
    if (this._shouldResetAvatarOnInit) {
      await this.resetToRandomDefaultAvatar();
    } else {
      this.update({
        profile: { avatarId: await fetchRandomDefaultAvatarId(), ...(this.state.profile || {}) }
      });
    }

    // Regenerate name to encourage users to change it.
    if (!this.state.activity.hasChangedName) {
      this.update({ profile: { displayName: generateRandomName() } });
    }
  };

  resetToRandomDefaultAvatar = async () => {
    this.update({
      profile: { ...(this.state.profile || {}), avatarId: await fetchRandomDefaultAvatarId() }
    });
  };

  get state() {
    if (!this.hasOwnProperty(STORE_STATE_CACHE_KEY)) {
      this[STORE_STATE_CACHE_KEY] = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY));
    }

    return this[STORE_STATE_CACHE_KEY];
  }

  get credentialsAccountId() {
    if (this.state.credentials.token) {
      return jwtDecode(this.state.credentials.token).sub;
    } else {
      return null;
    }
  }

  resetConfirmedBroadcastedRooms() {
    this.clearStoredArray("confirmedBroadcastedRooms");
  }

  resetTipActivityFlags() {
    this.update({
      activity: { hasRotated: false, hasPinned: false, hasRecentered: false, hasScaled: false, entryCount: 0 }
    });
  }

  bumpEntryCount() {
    const currentEntryCount = this.state.activity.entryCount || 0;
    this.update({ activity: { entryCount: currentEntryCount + 1 } });
  }

  // Sets a one-time action to perform the next time the page loads
  enqueueOnLoadAction(action, args) {
    this.update({ onLoadActions: [{ action, args }] });
  }

  executeOnLoadActions(sceneEl) {
    for (let i = 0; i < this.state.onLoadActions.length; i++) {
      const { action, args } = this.state.onLoadActions[i];

      if (action === "emit_scene_event") {
        sceneEl.emit(args.event, args.detail);
      }
    }

    this.clearOnLoadActions();
  }

  clearOnLoadActions() {
    this.clearStoredArray("onLoadActions");
  }

  clearStoredArray(key) {
    const overwriteMerge = (destinationArray, sourceArray) => sourceArray;
    const update = {};
    update[key] = [];

    this.update(update, { arrayMerge: overwriteMerge });
  }

  update(newState, mergeOpts) {
    const finalState = merge(this.state, newState, mergeOpts);
    const { valid } = validator.validate(finalState, SCHEMA);

    if (!valid) {
      // Intentionally not including details about the state or validation result here, since we don't want to leak
      // sensitive data in the error message.
      throw new Error(`Write to store failed schema validation.`);
    }

    localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(finalState));
    delete this[STORE_STATE_CACHE_KEY];

    if (newState.profile !== undefined) {
      this.dispatchEvent(new CustomEvent("profilechanged"));
    }
    this.dispatchEvent(new CustomEvent("statechanged"));

    return finalState;
  }

  get materialQualitySetting() {
    if (this.state.preferences.materialQualitySetting) {
      return this.state.preferences.materialQualitySetting;
    }

    return defaultMaterialQualitySetting;
  }
}
