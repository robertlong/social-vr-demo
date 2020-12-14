import { paths } from "../paths";
import { sets } from "../sets";
import { xforms } from "./xforms";
import { addSetsToBindings } from "./utils";

// import { Pose } from "../pose";

const wasd_vec2 = "/var/mouse-and-keyboard/wasd_vec2";
const keyboardCharacterAcceleration = "/var/mouse-and-keyboard/keyboardCharacterAcceleration";
const arrows_vec2 = "/var/mouse-and-keyboard/arrows_vec2";
const togglePenWithRMB = "/vars/mouse-and-keyboard/drop_pen_with_RMB";
const togglePenWithEsc = "/vars/mouse-and-keyboard/drop_pen_with_esc";
const togglePenWithP = "/vars/mouse-and-keyboard/drop_pen_with_p";
const togglePenWithHud = "/vars/mouse-and-keyboard/drop_pen_with_hud";
const togglePen = "/vars/mouse-and-keyboard/togglePen";
const startInspectingViaMouse = "/vars/mouse-and-keyboard/startInspectingViaMouse";
const startInspectingViaKeyboard = "/vars/mouse-and-keyboard/startInspectingViaKeyboard";
const stopInspectingViaMouse = "/vars/mouse-and-keyboard/stopInspectingViaMouse";
const stopInspectingViaKeyboardEscape = "/vars/mouse-and-keyboard/stopInspectingViaKeyboardEscape";
const stopInspectingViaKeyboardFocusRelease = "/vars/mouse-and-keyboard/stopInspectingViaKeyboardFocusRelease";
const stopInspectingSelf = "/vars/mouse-and-keyboard/stopInspectingSelf";

const qs = new URLSearchParams(location.search);
const inspectZoomSpeed = parseFloat(qs.get("izs")) || -10.0;

const k = name => {
  return `/keyboard-mouse-user/keyboard-var/${name}`;
};

export const keyboardMouseUserBindings = addSetsToBindings({
  [sets.global]: [
    {
      src: {},
      dest: { value: paths.actions.cursor.right.hideLine },
      xform: xforms.always(true)
    },
    {
      src: {},
      dest: { value: paths.actions.cursor.right.wake },
      xform: xforms.always(true)
    },
    {
      src: {},
      dest: { value: paths.actions.cursor.left.wake },
      xform: xforms.always(false)
    },
    {
      src: {
        w: paths.device.keyboard.key("arrowup"),
        a: paths.device.keyboard.key("arrowleft"),
        s: paths.device.keyboard.key("arrowdown"),
        d: paths.device.keyboard.key("arrowright")
      },
      dest: { vec2: arrows_vec2 },
      xform: xforms.wasd_to_vec2
    },
    {
      src: {
        w: paths.device.keyboard.key("w"),
        a: paths.device.keyboard.key("a"),
        s: paths.device.keyboard.key("s"),
        d: paths.device.keyboard.key("d")
      },
      dest: { vec2: wasd_vec2 },
      xform: xforms.wasd_to_vec2
    },
    {
      src: {
        first: wasd_vec2,
        second: arrows_vec2
      },
      dest: { value: keyboardCharacterAcceleration },
      xform: xforms.max_vec2
    },
    {
      src: { value: keyboardCharacterAcceleration },
      dest: { value: paths.actions.characterAcceleration },
      xform: xforms.normalize_vec2
    },
    {
      src: { value: paths.device.mouse.wheel },
      dest: { value: paths.actions.dCharSpeed },
      xform: xforms.scale(-0.3)
    },
    {
      src: { value: paths.device.keyboard.key("shift") },
      dest: { value: paths.actions.boost },
      xform: xforms.copy,
      priority: 1
    },
    {
      src: { value: paths.device.keyboard.key("Escape") },
      dest: { value: paths.actions.focusUI },
      xform: xforms.falling
    },
    {
      src: { value: paths.device.keyboard.key("q") },
      dest: { value: paths.actions.snapRotateLeft },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("g") },
      dest: { value: paths.actions.toggleFly },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("`") },
      dest: { value: paths.actions.toggleUI },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("e") },
      dest: { value: paths.actions.snapRotateRight },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("Tab") },
      dest: { value: paths.actions.toggleFreeze },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key(" ") },
      dest: { value: paths.actions.ensureFrozen },
      xform: xforms.copy
    },
    {
      src: { value: paths.device.keyboard.key(" ") },
      dest: { value: paths.actions.thaw },
      xform: xforms.falling
    },
    {
      src: { value: paths.device.keyboard.key("p") },
      dest: { value: togglePenWithP },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.hud.penButton },
      dest: { value: togglePenWithHud },
      xform: xforms.rising
    },
    {
      src: [togglePenWithHud, togglePenWithP],
      dest: { value: togglePen },
      xform: xforms.any
    },
    {
      src: { value: togglePen },
      dest: { value: paths.actions.spawnPen },
      xform: xforms.rising,
      priority: 100
    },
    {
      src: { value: paths.device.keyboard.key("c") },
      dest: { value: paths.actions.toggleCamera },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("x") },
      dest: { value: paths.actions.takeSnapshot },
      xform: xforms.copy
    },
    {
      src: { value: paths.device.smartMouse.cursorPose },
      dest: { value: paths.actions.cursor.right.pose },
      xform: xforms.copy
    },
    {
      src: { value: paths.device.mouse.coords },
      dest: { value: "/var/mouseCoordsDelta" },
      xform: xforms.diff_vec2
    },
    {
      src: { value: "/var/mouseCoordsDelta" },
      dest: { x: "/var/mouseCoordsX", y: "/var/mouseCoordsY" },
      xform: xforms.split_vec2
    },
    {
      src: { value: "/var/mouseCoordsX" },
      dest: { value: "/var/mouseCoordsXScaled" },
      xform: xforms.scale(-Math.PI)
    },
    {
      src: { value: "/var/mouseCoordsY" },
      dest: { value: "/var/mouseCoordsYScaled" },
      xform: xforms.scale((2 * Math.PI) / 3)
    },
    {
      src: { x: "/var/mouseCoordsXScaled", y: "/var/mouseCoordsYScaled" },
      dest: { value: "/var/actions/cameraDelta" },
      xform: xforms.compose_vec2
    },
    {
      src: {
        value: "/var/actions/cameraDelta",
        bool: paths.device.smartMouse.shouldMoveCamera
      },
      dest: { value: paths.actions.cameraDelta },
      xform: xforms.copyVec2IfTrue
    },
    {
      src: { value: paths.actions.cameraDelta },
      dest: { value: paths.actions.lobbyCameraDelta },
      xform: xforms.copy
    },
    {
      src: {
        value: paths.device.keyboard.key("m")
      },
      dest: {
        value: paths.actions.muteMic
      },
      xform: xforms.rising
    },
    {
      src: {
        value: paths.device.keyboard.key("t")
      },
      dest: {
        value: paths.actions.focusChat
      },
      xform: xforms.rising
    },
    {
      src: {
        value: paths.device.keyboard.key("/")
      },
      dest: {
        value: paths.actions.focusChatCommand
      },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("Escape") },
      dest: { value: paths.actions.mediaExit },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("1")
      },
      dest: { value: "/var/control+1" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+1" },
      dest: { value: paths.actions.mediaSearch1 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("2")
      },
      dest: { value: "/var/control+2" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+2" },
      dest: { value: paths.actions.mediaSearch2 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("3")
      },
      dest: { value: "/var/control+3" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+3" },
      dest: { value: paths.actions.mediaSearch3 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("4")
      },
      dest: { value: "/var/control+4" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+4" },
      dest: { value: paths.actions.mediaSearch4 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("5")
      },
      dest: { value: "/var/control+5" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+5" },
      dest: { value: paths.actions.mediaSearch5 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("6")
      },
      dest: { value: "/var/control+6" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+6" },
      dest: { value: paths.actions.mediaSearch6 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("7")
      },
      dest: { value: "/var/control+7" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+7" },
      dest: { value: paths.actions.mediaSearch7 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("8")
      },
      dest: { value: "/var/control+8" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+8" },
      dest: { value: paths.actions.mediaSearch8 },
      xform: xforms.rising
    },
    {
      src: {
        value: paths.device.keyboard.key("l")
      },
      dest: {
        value: paths.actions.logDebugFrame
      },
      xform: xforms.rising
    },
    {
      src: {
        value: paths.device.keyboard.key("k")
      },
      dest: {
        value: paths.actions.logInteractionState
      },
      xform: xforms.rising
    },
    {
      src: {
        value: paths.device.mouse.buttonRight
      },
      dest: {
        value: paths.actions.startGazeTeleport
      },
      xform: xforms.rising,
      priority: 100
    },
    {
      src: {
        value: paths.device.mouse.buttonRight
      },
      dest: {
        value: paths.actions.stopGazeTeleport
      },
      xform: xforms.falling,
      priority: 100
    },
    {
      src: { value: paths.device.keyboard.key("o") },
      dest: { value: paths.actions.nextCameraMode },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("1")
      },
      dest: { value: "/var/notcontrol+1" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+1" },
      dest: { value: paths.actions.spawnEmoji0 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("2")
      },
      dest: { value: "/var/notcontrol+2" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+2" },
      dest: { value: paths.actions.spawnEmoji1 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("3")
      },
      dest: { value: "/var/notcontrol+3" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+3" },
      dest: { value: paths.actions.spawnEmoji2 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("4")
      },
      dest: { value: "/var/notcontrol+4" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+4" },
      dest: { value: paths.actions.spawnEmoji3 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("5")
      },
      dest: { value: "/var/notcontrol+5" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+5" },
      dest: { value: paths.actions.spawnEmoji4 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("6")
      },
      dest: { value: "/var/notcontrol+6" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+6" },
      dest: { value: paths.actions.spawnEmoji5 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("7")
      },
      dest: { value: "/var/notcontrol+7" },
      xform: xforms.copyIfFalse
    },
    {
      src: { value: "/var/notcontrol+7" },
      dest: { value: paths.actions.spawnEmoji6 },
      xform: xforms.rising
    },
    {
      src: { value: paths.device.keyboard.key("i") },
      dest: { value: paths.actions.startInspectingSelf },
      xform: xforms.rising
    }

    // Helpful bindings for debugging hands in 2D
    // {
    //   src: {},
    //   dest: { value: paths.actions.rightHand.matrix },
    //   xform: xforms.always(
    //     new THREE.Matrix4().compose(
    //       new THREE.Vector3(0.2, 1.3, -0.8),
    //       new THREE.Quaternion(0, 0, 0, 0),
    //       new THREE.Vector3(1, 1, 1)
    //     )
    //   )
    // },
    // {
    //   src: {},
    //   dest: { value: paths.actions.leftHand.matrix },
    //   xform: xforms.always(
    //     new THREE.Matrix4().compose(
    //       new THREE.Vector3(-0.2, 1.4, -0.8),
    //       new THREE.Quaternion(0, 0, 0, 0),
    //       new THREE.Vector3(1, 1, 1)
    //     )
    //   )
    // }
  ],

  [sets.rightCursorHoldingPen]: [
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.keyboard.key("q")
      },
      dest: { value: "/var/shift+q" },
      xform: xforms.copyIfTrue,
      priority: 1
    },
    {
      src: { value: "/var/shift+q" },
      dest: { value: paths.actions.cursor.right.penPrevColor },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.keyboard.key("e")
      },
      dest: { value: "/var/shift+e" },
      xform: xforms.copyIfTrue,
      priority: 1
    },
    {
      src: { value: "/var/shift+e" },
      dest: { value: paths.actions.cursor.right.penNextColor },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.keyboard.key("q")
      },
      dest: { value: "/var/notshift+q" },
      xform: xforms.copyIfFalse,
      priority: 1
    },
    {
      src: { value: "/var/notshift+q" },
      dest: { value: paths.actions.snapRotateLeft },
      xform: xforms.rising,
      priority: 200
    },
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.keyboard.key("e")
      },
      dest: { value: "/var/notshift+e" },
      xform: xforms.copyIfFalse,
      priority: 1
    },
    {
      src: { value: "/var/notshift+e" },
      dest: { value: paths.actions.snapRotateRight },
      xform: xforms.rising,
      priority: 200
    },
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.startDrawing },
      xform: xforms.rising,
      priority: 3
    },
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.stopDrawing },
      xform: xforms.falling,
      priority: 3
    },
    {
      src: {
        value: k("wheelWithShift")
      },
      dest: { value: "/var/cursorScalePenTipWheel" },
      xform: xforms.copy,
      priority: 200
    },
    {
      src: { value: "/var/cursorScalePenTipWheel" },
      dest: { value: paths.actions.cursor.right.scalePenTip },
      xform: xforms.scale(0.03)
    },
    {
      src: { value: paths.device.mouse.buttonRight },
      dest: { value: togglePenWithRMB },
      xform: xforms.falling,
      priority: 200
    },
    {
      src: { value: paths.device.keyboard.key("Escape") },
      dest: { value: togglePenWithEsc },
      xform: xforms.rising
    },
    {
      src: [togglePenWithRMB, togglePenWithEsc, togglePenWithP, togglePenWithHud],
      dest: { value: togglePen },
      xform: xforms.any
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("z")
      },
      dest: { value: paths.actions.cursor.right.undoDrawing },
      priority: 1001,
      xform: xforms.rising
    },
    {
      src: { value: togglePen },
      dest: { value: paths.actions.cursor.right.drop },
      xform: xforms.rising,
      priority: 200
    },
    {
      src: { value: togglePen },
      dest: { value: paths.actions.pen.remove },
      xform: xforms.rising,
      priority: 200
    }
  ],

  [sets.rightCursorHoldingCamera]: [
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.drop },
      xform: xforms.falling,
      priority: 2
    },
    {
      src: {
        value: k("wheelWithShift")
      },
      dest: { value: paths.actions.cursor.right.scaleGrabbedGrabbable },
      xform: xforms.noop,
      priority: 2
    }
  ],

  [sets.rightCursorHoldingInteractable]: [
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.mouse.wheel
      },
      dest: {
        value: k("wheelWithShift")
      },
      xform: xforms.copyIfTrue,
      priority: 1
    },
    {
      src: {
        bool: paths.device.keyboard.key("shift"),
        value: paths.device.mouse.wheel
      },
      dest: {
        value: k("wheelWithoutShift")
      },
      xform: xforms.copyIfFalse,
      priority: 1
    },
    {
      src: {
        value: k("wheelWithoutShift")
      },
      dest: { value: paths.actions.cursor.right.modDelta },
      xform: xforms.copy
    },
    {
      src: {
        value: k("wheelWithShift")
      },
      dest: { value: paths.actions.cursor.right.scaleGrabbedGrabbable },
      xform: xforms.copy
    },
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.drop },
      xform: xforms.falling,
      priority: 2
    }
  ],
  [sets.rightCursorHoldingUI]: [
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.drop },
      xform: xforms.falling,
      priority: 3
    },
    {
      src: { value: paths.device.keyboard.key("shift") },
      dest: { value: paths.actions.transformModifier },
      xform: xforms.copy,
      priority: 1
    }
  ],
  [sets.rightCursorHoveringOnInteractable]: [
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.grab },
      xform: xforms.rising,
      priority: 1
    },
    {
      src: { value: paths.device.mouse.buttonRight },
      dest: { value: startInspectingViaMouse },
      xform: xforms.rising,
      priority: 200
    },
    {
      src: { value: paths.device.keyboard.key("f") },
      dest: { value: startInspectingViaKeyboard },
      xform: xforms.rising,
      priority: 200
    },
    {
      src: [startInspectingViaMouse, startInspectingViaKeyboard],
      dest: { value: paths.actions.startInspecting },
      xform: xforms.any,
      priority: 201
    }
  ],
  [sets.rightCursorHoveringOnVideo]: [
    {
      src: { value: paths.device.mouse.wheel },
      dest: { value: paths.actions.cursor.right.mediaVolumeMod },
      xform: xforms.scale(-0.3),
      priority: 1
    }
  ],
  [sets.inputFocused]: [
    {
      src: { value: "/device/keyboard" },
      dest: { value: paths.noop },
      xform: xforms.noop,
      priority: 1000
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("1")
      },
      dest: { value: "/var/control+1" },
      xform: xforms.copyIfTrue,
      priority: 1001
    },
    {
      src: { value: "/var/control+1" },
      dest: { value: paths.actions.mediaSearch1 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("2")
      },
      dest: { value: "/var/control+2" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+2" },
      dest: { value: paths.actions.mediaSearch2 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("3")
      },
      dest: { value: "/var/control+3" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+3" },
      dest: { value: paths.actions.mediaSearch3 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("4")
      },
      dest: { value: "/var/control+4" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+4" },
      dest: { value: paths.actions.mediaSearch4 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("5")
      },
      dest: { value: "/var/control+5" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+5" },
      dest: { value: paths.actions.mediaSearch5 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("6")
      },
      dest: { value: "/var/control+6" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+6" },
      dest: { value: paths.actions.mediaSearch6 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("7")
      },
      dest: { value: "/var/control+7" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+7" },
      dest: { value: paths.actions.mediaSearch7 },
      xform: xforms.rising
    },
    {
      src: {
        bool: paths.device.keyboard.key("control"),
        value: paths.device.keyboard.key("8")
      },
      dest: { value: "/var/control+8" },
      priority: 1001,
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/control+8" },
      dest: { value: paths.actions.mediaSearch8 },
      xform: xforms.rising
    }
  ],

  [sets.rightCursorHoveringOnUI]: [
    {
      src: { value: paths.device.mouse.buttonLeft },
      dest: { value: paths.actions.cursor.right.grab },
      xform: xforms.rising
    }
  ],
  [sets.inspecting]: [
    {
      src: { value: paths.device.keyboard.key("space") },
      dest: { value: k("space-rising") },
      xform: xforms.rising
    },
    {
      src: [
        paths.device.keyboard.key("w"),
        paths.device.keyboard.key("a"),
        paths.device.keyboard.key("s"),
        paths.device.keyboard.key("d"),
        paths.device.keyboard.key("q"),
        paths.device.keyboard.key("e"),
        k("space-rising")
      ],
      dest: { value: stopInspectingViaKeyboardEscape },
      xform: xforms.any
    },
    {
      src: { value: paths.device.mouse.wheel },
      dest: { value: paths.actions.inspectZoom },
      xform: xforms.scale(inspectZoomSpeed),
      priority: 1
    },
    {
      src: { value: paths.device.mouse.movementXY },
      dest: { x: "/var/movementX", y: "/var/movementY" },
      xform: xforms.split_vec2
    },
    {
      src: { bool: paths.device.mouse.buttonMiddle, value: "/var/movementY" },
      dest: { value: "/var/middle-mouse-move-y" },
      xform: xforms.copyIfTrue
    },
    {
      src: { value: "/var/middle-mouse-move-y" },
      dest: { value: paths.actions.inspectPanY },
      xform: xforms.scale(0.001)
    },
    {
      src: { value: paths.device.keyboard.key("f") },
      dest: { value: stopInspectingViaKeyboardFocusRelease },
      xform: xforms.falling
    },
    {
      src: { value: paths.device.mouse.buttonRight },
      dest: { value: stopInspectingViaMouse },
      xform: xforms.falling,
      priority: 101
    },
    {
      src: { value: paths.device.keyboard.key("i") },
      dest: { value: stopInspectingSelf },
      xform: xforms.rising
    },
    {
      src: [
        stopInspectingViaMouse,
        stopInspectingViaKeyboardEscape,
        stopInspectingViaKeyboardFocusRelease,
        stopInspectingSelf
      ],
      dest: { value: paths.actions.stopInspecting },
      xform: xforms.any
    }
  ],
  [sets.debugUserInput]: [
    {
      src: { value: paths.device.keyboard.key("m") },
      dest: { value: paths.actions.debugUserInput.describeCurrentMasks },
      xform: xforms.rising,
      priority: 10
    }
  ]
});
