import { sets } from "./sets";
import { paths } from "./paths";

import { MouseDevice } from "./devices/mouse";
import { KeyboardDevice } from "./devices/keyboard";
import { HudDevice } from "./devices/hud";
import { XboxControllerDevice } from "./devices/xbox-controller";
import { OculusGoControllerDevice } from "./devices/oculus-go-controller";
import { GearVRControllerDevice } from "./devices/gear-vr-controller";
import { OculusTouchControllerDevice } from "./devices/oculus-touch-controller";
import { DaydreamControllerDevice } from "./devices/daydream-controller";
import { ViveControllerDevice } from "./devices/vive-controller";
import { WindowsMixedRealityControllerDevice } from "./devices/windows-mixed-reality-controller";
import { WebXRControllerDevice } from "./devices/webxr-controller";
import { GyroDevice } from "./devices/gyro";

import { AppAwareMouseDevice } from "./devices/app-aware-mouse";
import { AppAwareTouchscreenDevice } from "./devices/app-aware-touchscreen";

import { keyboardMouseUserBindings } from "./bindings/keyboard-mouse-user";
import { touchscreenUserBindings } from "./bindings/touchscreen-user";
import { keyboardDebuggingBindings } from "./bindings/keyboard-debugging";
import { oculusTouchUserBindings } from "./bindings/oculus-touch-user";
import { webXRUserBindings } from "./bindings/webxr-user";
import {
  viveUserBindings,
  viveWandUserBindings,
  indexUserBindings,
  viveFocusPlusUserBindings,
  viveCosmosUserBindings
} from "./bindings/vive-user";
import { wmrUserBindings } from "./bindings/windows-mixed-reality-user";
import { xboxControllerUserBindings } from "./bindings/xbox-controller-user";
import { daydreamUserBindings } from "./bindings/daydream-user";
import { cardboardUserBindings } from "./bindings/cardboard-user";

import generate3DOFTriggerBindings from "./bindings/oculus-go-user";
const oculusGoUserBindings = generate3DOFTriggerBindings(paths.device.oculusgo);
const gearVRControllerUserBindings = generate3DOFTriggerBindings(paths.device.gearVRController);

import { resolveActionSets } from "./resolve-action-sets";
import { GamepadDevice } from "./devices/gamepad";
import { gamepadBindings } from "./bindings/generic-gamepad";
import { getAvailableVREntryTypes, VR_DEVICE_AVAILABILITY } from "../../utils/vr-caps-detect";
import { hackyMobileSafariTest } from "../../utils/detect-touchscreen";
import { ArrayBackedSet } from "./array-backed-set";

function arrayContentsDiffer(a, b) {
  if (a.length !== b.length) return true;

  for (let i = 0, il = a.length; i < il; i++) {
    const elem = a[i];
    let found = false;

    for (let j = 0, jl = b.length; j < jl; j++) {
      if (elem === b[j]) {
        found = true;
        break;
      }
    }

    if (!found) return true;
  }

  return false;
}

const satisfiesPath = (binding, path) => {
  for (const key in binding.dest) {
    if (binding.dest[key].indexOf(path) !== -1) {
      return true;
    }
  }
  return false;
};

const satisfyPath = (bindings, path) => {
  for (const binding of bindings) {
    if (satisfiesPath(binding, path)) {
      return true;
    }
  }
  return false;
};

const satisfiedBy = (binding, bindings) => {
  for (const path of Object.values(binding.src)) {
    if (path.startsWith("/device/")) continue;
    if (!satisfyPath(bindings, path)) return false;
  }
  return true;
};

function dependencySort(mappings) {
  const unsorted = [];
  for (const mapping of mappings) {
    for (const setName in mapping) {
      for (const binding of mapping[setName]) {
        unsorted.push(binding);
      }
    }
  }

  const sorted = [];
  while (unsorted.length > 0) {
    const binding = unsorted.shift();
    if (satisfiedBy(binding, sorted)) {
      sorted.push(binding);
    } else {
      unsorted.push(binding);
    }
  }

  return sorted;
}

function notEmpty(s) {
  return s !== "";
}

function isSubpath(subpath, path) {
  const a = subpath.split("/").filter(notEmpty);
  const b = path.split("/").filter(notEmpty);
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function canMask(masker, masked) {
  if (masker.priority === undefined) {
    masker.priority = 0;
  }
  if (masked.priority === undefined) {
    masked.priority = 0;
  }
  if (masked.priority >= masker.priority) return false;
  for (const maskerKey in masker.src) {
    const maskerPath = masker.src[maskerKey];
    for (const maskedKey in masked.src) {
      const maskedPath = masked.src[maskedKey];
      if (maskedPath.indexOf(maskerPath) !== -1 && isSubpath(maskerPath, maskedPath)) {
        return true;
      }
    }
  }
  return false;
}

function computeMasks(bindings) {
  const masks = new Array(bindings.length);
  for (let row = 0; row < bindings.length; row++) {
    const masksRow = (masks[row] = []);
    const bindingsRow = bindings[row];
    for (let col = 0; col < bindings.length; col++) {
      if (canMask(bindings[col], bindingsRow)) {
        masksRow.push(col);
      }
    }
  }
  return masks;
}

function isActive(binding, sets) {
  for (let i = 0; i < binding.sets.length; i++) {
    if (sets.includes(binding.sets[i])) {
      return true;
    }
  }
  return false;
}

function computeExecutionStrategy(sortedBindings, masks, activeSets) {
  const actives = new Array(sortedBindings.length);
  for (let row = 0; row < sortedBindings.length; row++) {
    actives[row] = isActive(sortedBindings[row], activeSets);
  }

  const masked = new Array(sortedBindings.length);
  for (let row = 0; row < sortedBindings.length; row++) {
    const maskedRow = (masked[row] = []);
    const masksRow = masks[row];
    for (let col = 0; col < sortedBindings.length; col++) {
      if (actives[col] && masksRow.indexOf(col) !== -1) {
        maskedRow.push(col);
      }
    }
  }

  return { actives, masked };
}

AFRAME.registerSystem("userinput", {
  get(path) {
    if (!this.frame) return;
    return this.frame.get(path);
  },

  toggleSet(set, value) {
    this.pendingSetChanges.push(set);
    this.pendingSetChanges.push(!!value);
  },

  init() {
    this.frame = {
      generation: 0,
      values: {},
      generations: {},
      get: function(path) {
        if (this.generations[path] !== this.generation) return undefined;
        return this.values[path];
      },
      setValueType: function(path, value) {
        this.values[path] = value;
        this.generations[path] = this.generation;
      },
      setVector2: function(path, a, b) {
        const value = this.values[path] || [];
        value[0] = a;
        value[1] = b;
        this.values[path] = value;
        this.generations[path] = this.generation;
      },
      setPose: function(path, pose) {
        this.setValueType(path, pose);
      },
      setMatrix4: function(path, mat4) {
        // Should we assume the incoming mat4 is safe to store instead of copying values?
        const value = this.values[path] || new THREE.Matrix4();
        value.copy(mat4);
        this.values[path] = value;
        this.generations[path] = this.generation;
      }
    };

    this.prevActiveSets = [];
    this.activeSets = [sets.global];
    this.pendingSetChanges = [];
    this.xformStates = new Map();
    this.activeDevices = new ArrayBackedSet([new HudDevice()]);

    const isMobile = AFRAME.utils.device.isMobile();
    const isMobileVR = AFRAME.utils.device.isMobileVR();
    const forceEnableTouchscreen = hackyMobileSafariTest();

    if (!(isMobile || isMobileVR || forceEnableTouchscreen)) {
      this.activeDevices.add(new MouseDevice());
      this.activeDevices.add(new AppAwareMouseDevice());
      this.activeDevices.add(new KeyboardDevice());
    } else if (!isMobileVR || forceEnableTouchscreen) {
      this.activeDevices.add(new AppAwareTouchscreenDevice());
      this.activeDevices.add(new KeyboardDevice());
      this.activeDevices.add(new GyroDevice());
    }

    this.isMobile = isMobile;
    this.isMobileVR = isMobileVR;

    this.registeredMappings = new Set([keyboardDebuggingBindings]);
    this.registeredMappingsChanged = true;

    const vrGamepadMappings = new Map();
    vrGamepadMappings.set(WindowsMixedRealityControllerDevice, wmrUserBindings);
    vrGamepadMappings.set(ViveControllerDevice, viveUserBindings);
    vrGamepadMappings.set(OculusTouchControllerDevice, oculusTouchUserBindings);
    vrGamepadMappings.set(OculusGoControllerDevice, oculusGoUserBindings);
    vrGamepadMappings.set(GearVRControllerDevice, gearVRControllerUserBindings);
    vrGamepadMappings.set(DaydreamControllerDevice, daydreamUserBindings);
    vrGamepadMappings.set(WebXRControllerDevice, webXRUserBindings);

    const nonVRGamepadMappings = new Map();
    nonVRGamepadMappings.set(XboxControllerDevice, xboxControllerUserBindings);
    nonVRGamepadMappings.set(GamepadDevice, gamepadBindings);

    const addExtraMappings = activeDevice => {
      if (activeDevice instanceof ViveControllerDevice && activeDevice.gamepad) {
        if (activeDevice.gamepad.id === "OpenVR Cosmos") {
          //HTC Vive Cosmos Controller
          this.registeredMappings.add(viveCosmosUserBindings);
        } else if (activeDevice.gamepad.id === "HTC Vive Focus Plus Controller") {
          //HTC Vive Focus Plus Controller
          this.registeredMappings.add(viveFocusPlusUserBindings);
        } else if (activeDevice.gamepad.axes.length === 4) {
          //Valve Index Controller
          this.registeredMappings.add(indexUserBindings);
        } else {
          //HTC Vive Controller (wands)
          this.registeredMappings.add(viveWandUserBindings);
        }
      }
    };

    const deleteExtraMappings = activeDevice => {
      if (activeDevice instanceof ViveControllerDevice && activeDevice.gamepad) {
        this.registeredMappings.delete(viveCosmosUserBindings);
        this.registeredMappings.delete(viveFocusPlusUserBindings);
        this.registeredMappings.delete(indexUserBindings);
        this.registeredMappings.delete(viveWandUserBindings);
      }
    };

    const updateBindingsForVRMode = () => {
      const inVRMode = this.el.sceneEl.is("vr-mode");
      const isMobile = AFRAME.utils.device.isMobile();
      const forceEnableTouchscreen = hackyMobileSafariTest();

      if (inVRMode) {
        console.log("Using VR bindings.");
        this.registeredMappings.delete(
          isMobile || forceEnableTouchscreen ? touchscreenUserBindings : keyboardMouseUserBindings
        );
        // add mappings for all active VR input devices
        for (let i = 0; i < this.activeDevices.items.length; i++) {
          const activeDevice = this.activeDevices.items[i];
          const mapping = vrGamepadMappings.get(activeDevice.constructor);
          mapping && this.registeredMappings.add(mapping);
          addExtraMappings(activeDevice);
        }

        // Handle cardboard by looking of VR device caps
        if (isMobile) {
          getAvailableVREntryTypes().then(availableVREntryTypes => {
            if (availableVREntryTypes.cardboard === VR_DEVICE_AVAILABILITY.yes) {
              this.registeredMappings.add(cardboardUserBindings);
              this.registeredMappingsChanged = true;
            }
          });
        }
      } else {
        console.log("Using Non-VR bindings.");
        // remove mappings for all active VR input devices
        for (let i = 0; i < this.activeDevices.items.length; i++) {
          const activeDevice = this.activeDevices.items[i];
          deleteExtraMappings(activeDevice);
          this.registeredMappings.delete(vrGamepadMappings.get(activeDevice.constructor));
        }
        this.registeredMappings.add(
          isMobile || forceEnableTouchscreen ? touchscreenUserBindings : keyboardMouseUserBindings
        );
      }

      for (let i = 0; i < this.activeDevices.items.length; i++) {
        const activeDevice = this.activeDevices.items[i];
        const mapping = nonVRGamepadMappings.get(activeDevice.constructor);
        mapping && this.registeredMappings.add(mapping);
      }

      this.registeredMappingsChanged = true;
    };

    const gamepadConnected = e => {
      let gamepadDevice;
      for (let i = 0; i < this.activeDevices.items.length; i++) {
        const activeDevice = this.activeDevices.items[i];
        if (!e.gamepad.isWebXRGamepad && activeDevice.gamepad && activeDevice.gamepad.index === e.gamepad.index) {
          console.warn("connected already fired for gamepad", e.gamepad);
          return; // multiple connect events without a disconnect event
        }
      }
      if (e.gamepad.isWebXRGamepad) {
        gamepadDevice = new WebXRControllerDevice(e.gamepad);
      } else if (
        // HACK Firefox Nightly bug causes corrupt gamepad names for OpenVR, so do startsWith
        e.gamepad.id.startsWith("OpenVR Gamepad") ||
        e.gamepad.id.startsWith("OpenVR Knuckles") ||
        e.gamepad.id === "HTC Vive Focus Plus Controller" ||
        e.gamepad.id === "OpenVR Cosmos"
      ) {
        gamepadDevice = new ViveControllerDevice(e.gamepad);
      } else if (e.gamepad.id.startsWith("Oculus Touch") || e.gamepad.id.startsWith("Pico Neo 2")) {
        gamepadDevice = new OculusTouchControllerDevice(e.gamepad);
      } else if (e.gamepad.id.startsWith("Spatial Controller")) {
        gamepadDevice = new WindowsMixedRealityControllerDevice(e.gamepad);
      } else if (e.gamepad.id === "Oculus Go Controller" || e.gamepad.id === "Pico G2 Controller") {
        gamepadDevice = new OculusGoControllerDevice(e.gamepad);
      } else if (e.gamepad.id === "Gear VR Controller" || e.gamepad.id === "HTC Vive Focus Controller") {
        gamepadDevice = new GearVRControllerDevice(e.gamepad);
      } else if (e.gamepad.id === "Daydream Controller") {
        gamepadDevice = new DaydreamControllerDevice(e.gamepad);
      } else if (e.gamepad.mapping === "standard") {
        // Our XboxController device and bindings should be generic enough for most gamepads.
        gamepadDevice = new XboxControllerDevice(e.gamepad);
      } else {
        // This device doesn't actually have any bindings, but we need to fallback to something.
        gamepadDevice = new GamepadDevice(e.gamepad);
      }

      this.activeDevices.add(gamepadDevice);

      updateBindingsForVRMode();
    };

    const gamepadDisconnected = e => {
      for (let i = 0; i < this.activeDevices.items.length; i++) {
        const device = this.activeDevices.items[i];
        if (device.gamepad && device.gamepad.index === e.gamepad.index) {
          this.registeredMappings.delete(
            vrGamepadMappings.get(device.constructor) || nonVRGamepadMappings.get(device.constructor)
          );
          this.activeDevices.delete(device);
          return;
        }
      }

      updateBindingsForVRMode();
    };

    window.addEventListener("gamepadconnected", gamepadConnected, false);
    window.addEventListener("gamepaddisconnected", gamepadDisconnected, false);
    for (const gamepad of navigator.getGamepads()) {
      gamepad && gamepadConnected({ gamepad });
    }

    const retrieveXRGamepads = ({ added, removed }) => {
      for (const inputSource of removed) {
        gamepadDisconnected(inputSource);
      }
      for (const inputSource of added) {
        inputSource.gamepad.isWebXRGamepad = true;
        inputSource.gamepad.targetRaySpace = inputSource.targetRaySpace;
        inputSource.gamepad.primaryProfile = inputSource.profiles[0];
        // inputSource.gamepad.hand is a read-only property and still an experimental property.
        // We read this property elsewhere. Only Firefox supports this property now.
        // So we set this property if it's undefined.
        if (inputSource.gamepad.hand === undefined) {
          inputSource.gamepad.hand = inputSource.handedness;
        }
        gamepadConnected(inputSource);
      }
    };

    this.el.sceneEl.addEventListener("enter-vr", () => {
      const { xrSession } = this.el.sceneEl;
      if (xrSession) {
        xrSession.addEventListener("inputsourceschange", retrieveXRGamepads);
        xrSession.requestReferenceSpace("local-floor").then(referenceSpace => {
          this.xrReferenceSpace = referenceSpace;
        });
        xrSession.addEventListener("end", () => {
          this.activeDevices.items.filter(d => d.gamepad && d.gamepad.isWebXRGamepad).forEach(gamepadDisconnected);
        });
      }
      updateBindingsForVRMode();
    });
    this.el.sceneEl.addEventListener("exit-vr", updateBindingsForVRMode);

    updateBindingsForVRMode();
  },

  maybeToggleXboxMapping() {
    if (hackyMobileSafariTest() || this.isMobile || this.isMobileVR) return;

    const vrAxesSum =
      (this.get(paths.device.vive.left.axesSum) || 0) +
      (this.get(paths.device.vive.right.axesSum) || 0) +
      (this.get(paths.device.leftOculusTouch.axesSum) || 0) +
      (this.get(paths.device.rightOculusTouch.axesSum) || 0);
    const mouseMovement = this.get(paths.device.mouse.movementXY);
    const nonXboxActivity = (mouseMovement && (mouseMovement[0] || mouseMovement[1])) > 2 || vrAxesSum > 0.5;

    const hasXboxMapping = this.registeredMappings.has(xboxControllerUserBindings);

    if (nonXboxActivity && hasXboxMapping) {
      this.registeredMappings.delete(xboxControllerUserBindings);
      this.registeredMappingsChanged = true;
    } else if (this.get(paths.device.xbox.axesSum) > 0.5 && !hasXboxMapping) {
      this.registeredMappings.add(xboxControllerUserBindings);
      this.registeredMappingsChanged = true;
    }
  },

  tick2() {
    this.frame.generation += 1;
    const registeredMappingsChanged = this.registeredMappingsChanged;
    if (registeredMappingsChanged) {
      this.registeredMappingsChanged = false;
      this.prevSortedBindings = this.sortedBindings;
      this.sortedBindings = dependencySort(this.registeredMappings);
      if (!this.prevSortedBindings) {
        this.prevSortedBindings = this.sortedBindings;
      }
      this.masks = computeMasks(this.sortedBindings);
    }

    this.prevActiveSets.length = 0;
    for (let i = 0; i < this.activeSets.length; i++) {
      const item = this.activeSets[i];
      this.prevActiveSets.push(item);
    }
    resolveActionSets();
    for (let i = 0, l = this.pendingSetChanges.length; i < l; i += 2) {
      const set = this.pendingSetChanges[i];
      const value = this.pendingSetChanges[i + 1];

      if (value) {
        if (!this.activeSets.includes(set)) {
          this.activeSets.push(set);
        }
      } else {
        const idx = this.activeSets.indexOf(set);

        if (idx > -1) {
          this.activeSets.splice(idx, 1);
        }
      }
    }
    const activeSetsChanged = arrayContentsDiffer(this.prevActiveSets, this.activeSets);
    this.pendingSetChanges.length = 0;
    if (registeredMappingsChanged || activeSetsChanged || (!this.actives && !this.masked)) {
      this.prevActives = this.actives;
      this.prevMasked = this.masked;
      const { actives, masked } = computeExecutionStrategy(this.sortedBindings, this.masks, this.activeSets);
      this.actives = actives;
      this.masked = masked;
    }

    for (let i = 0; i < this.activeDevices.items.length; i++) {
      this.activeDevices.items[i].write(this.frame, this.el.sceneEl, this.xrReferenceSpace);
    }

    for (let i = 0; i < this.sortedBindings.length; i++) {
      if (!this.actives[i] || this.masked[i].length > 0) continue;

      const binding = this.sortedBindings[i];

      let bindingExistedLastFrame = true;
      if (!registeredMappingsChanged && activeSetsChanged && this.prevSortedBindings) {
        const j = this.prevSortedBindings.indexOf(binding);
        bindingExistedLastFrame = j > -1 && this.prevActives[j] && this.prevMasked[j].length === 0;
      }
      if (!bindingExistedLastFrame) {
        this.xformStates.delete(binding);
      }

      const { src, dest, xform, debug } = binding;

      let oldValue;

      if (debug) {
        oldValue = this.frame.get(dest.value);
      }

      const newState = xform(this.frame, src, dest, this.xformStates.get(binding));

      if (debug) {
        // Note for now this only works with bindings that have { value: } sources and dests
        console.log(
          `${JSON.stringify(src.value)} (${src.value && JSON.stringify(this.frame.get(src.value))}) to ${JSON.stringify(
            dest
          )}: ${oldValue} -> ${this.frame.get(dest.value)}`
        );
      }

      if (newState !== undefined) {
        this.xformStates.set(binding, newState);
      }
    }

    this.prevSortedBindings = this.sortedBindings;

    this.maybeToggleXboxMapping();
  }
});
