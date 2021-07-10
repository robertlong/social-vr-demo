import { paths } from "../paths";
import { Pose } from "../pose";
import { touchIsAssigned, jobIsAssigned, assign, unassign, findByJob, findByTouch } from "./touchscreen/assignments";
import { findRemoteHoverTarget } from "../../interactions";
import { canMove } from "../../../utils/permissions-utils";
import ResizeObserver from "resize-observer-polyfill";

const MOVE_CURSOR_JOB = "MOVE CURSOR";
const MOVE_CAMERA_JOB = "MOVE CAMERA";
const FIRST_PINCHER_JOB = "FIRST PINCHER";
const SECOND_PINCHER_JOB = "SECOND PINCHER";

const TAP_PATHS = [
  paths.device.touchscreen.tap1,
  paths.device.touchscreen.tap2,
  paths.device.touchscreen.tap3,
  paths.device.touchscreen.tap4,
  paths.device.touchscreen.tap5
];

function distance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

const getPlayerCamera = (() => {
  let playerCamera;

  return function() {
    if (!playerCamera) {
      playerCamera = document.getElementById("viewing-camera").components.camera.camera;
    }

    return playerCamera;
  };
})();

function shouldMoveCursor(touch, rect, raycaster) {
  const isCursorGrabbing = !!AFRAME.scenes[0].systems.interaction.state.rightRemote.held;
  if (isCursorGrabbing) {
    return true;
  }
  const rawIntersections = [];
  raycaster.setFromCamera(
    {
      x: ((touch.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((touch.clientY - rect.top) / rect.height) * 2 + 1
    },
    getPlayerCamera()
  );
  raycaster.intersectObjects(
    AFRAME.scenes[0].systems["hubs-systems"].cursorTargettingSystem.targets,
    true,
    rawIntersections
  );
  const intersection = rawIntersections.find(x => x.object.el);
  const isInteractable =
    intersection &&
    intersection.object.el.matches(
      ".interactable, .interactable *, .occupiable-waypoint-icon, .teleport-waypoint-icon"
    );
  const remoteHoverTarget = intersection && findRemoteHoverTarget(intersection.object);
  const isPinned =
    remoteHoverTarget && remoteHoverTarget.components.pinnable && remoteHoverTarget.components.pinnable.data.pinned;
  const isFrozen = AFRAME.scenes[0].is("frozen");

  const template =
    remoteHoverTarget && remoteHoverTarget.components.networked && remoteHoverTarget.components.networked.data.template;
  const isStaticControlledMedia = template && template === "#static-controlled-media";
  const isStaticMedia = template && template === "#static-media";
  return (
    isInteractable &&
    (isFrozen || !isPinned) &&
    !isStaticControlledMedia &&
    !isStaticMedia &&
    (remoteHoverTarget && canMove(remoteHoverTarget))
  );
}

export class AppAwareTouchscreenDevice {
  constructor() {
    this.raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(), 0, 100);
    this.assignments = [];
    this.pinch = { initialDistance: 0, currentDistance: 0, delta: 0 };

    // When touches appear, this timestamps and then watches for the high water mark of # of touches
    this.pendingTap = { maxTouchCount: 0, startedAt: 0 };
    this.tapIndexToWriteNextFrame = 0;

    this.canvas = document.querySelector("canvas");

    this.events = [];
    ["touchstart", "touchend", "touchmove", "touchcancel"].map(x =>
      this.canvas.addEventListener(x, this.events.push.bind(this.events))
    );
    this.canvasRect = this.canvas.getBoundingClientRect();
    new ResizeObserver(() => (this.canvasRect = this.canvas.getBoundingClientRect())).observe(this.canvas);
  }

  end(touch) {
    if (!touchIsAssigned(touch, this.assignments)) {
      console.warn("touch does not have a job", touch);
    } else {
      const assignment = findByTouch(touch, this.assignments);
      switch (assignment.job) {
        case MOVE_CURSOR_JOB:
        case MOVE_CAMERA_JOB:
          // If grab was being delayed, we should fire the initial grab and also delay the unassignment
          // to ensure we write at least two frames with the grab down (since the action set will change)
          // and otherwise we'd not see the falling xform.
          if (assignment.framesUntilGrab >= 0) {
            assignment.framesUntilUnassign = assignment.framesUntilGrab + 2;
          } else {
            unassign(assignment.touch, assignment.job, this.assignments);
          }

          break;
        case FIRST_PINCHER_JOB:
          unassign(assignment.touch, assignment.job, this.assignments);
          this.pinch = { initialDistance: 0, currentDistance: 0, delta: 0 };

          if (jobIsAssigned(SECOND_PINCHER_JOB, this.assignments)) {
            const second = findByJob(SECOND_PINCHER_JOB, this.assignments);
            unassign(second.touch, second.job, this.assignments);
            if (jobIsAssigned(MOVE_CAMERA_JOB, this.assignments)) {
              // reassign secondPincher to firstPincher
              const first = assign(second.touch, FIRST_PINCHER_JOB, this.assignments);
              first.clientX = second.clientX;
              first.clientY = second.clientY;
            } else {
              // reassign secondPincher to moveCamera
              const cameraMover = assign(second.touch, MOVE_CAMERA_JOB, this.assignments);
              cameraMover.clientX = second.clientX;
              cameraMover.clientY = second.clientY;
              cameraMover.delta = [0, 0];
            }
          }
          break;
        case SECOND_PINCHER_JOB:
          unassign(assignment.touch, assignment.job, this.assignments);
          this.pinch = { initialDistance: 0, currentDistance: 0, delta: 0 };
          if (jobIsAssigned(FIRST_PINCHER_JOB, this.assignments) && !jobIsAssigned(MOVE_CAMERA_JOB, this.assignments)) {
            //reassign firstPincher to moveCamera
            const first = findByJob(FIRST_PINCHER_JOB, this.assignments);
            unassign(first.touch, first.job, this.assignments);
            const cameraMover = assign(first.touch, MOVE_CAMERA_JOB, this.assignments);
            cameraMover.clientX = first.clientX;
            cameraMover.clientY = first.clientY;
            cameraMover.delta = [0, 0];
          }
          break;
      }
    }

    // Touches cleared, determine what to do with pending tap
    if (this.assignments.length === 0) {
      if (this.pendingTap.maxTouchCount > 0 && performance.now() - this.pendingTap.startedAt <= 125) {
        this.tapIndexToWriteNextFrame = this.pendingTap.maxTouchCount;
      }

      this.pendingTap = { maxTouchCount: 0 };
    }
  }

  move(touch) {
    if (!touchIsAssigned(touch, this.assignments)) {
      if (!touch.target.classList[0] || !touch.target.classList[0].startsWith("virtual-gamepad-controls")) {
        console.warn("touch does not have job", touch);
      }
      return;
    }

    const assignment = findByTouch(touch, this.assignments);
    switch (assignment.job) {
      case MOVE_CURSOR_JOB:
        assignment.cursorPose.fromCameraProjection(
          getPlayerCamera(),
          ((touch.clientX - this.canvasRect.left) / this.canvasRect.width) * 2 - 1,
          -((touch.clientY - this.canvasRect.top) / this.canvasRect.height) * 2 + 1
        );
        break;
      case MOVE_CAMERA_JOB:
        assignment.delta[0] += touch.clientX - assignment.clientX;
        assignment.delta[1] += touch.clientY - assignment.clientY;
        assignment.clientX = touch.clientX;
        assignment.clientY = touch.clientY;
        break;
      case FIRST_PINCHER_JOB:
      case SECOND_PINCHER_JOB:
        assignment.clientX = touch.clientX;
        assignment.clientY = touch.clientY;
        if (jobIsAssigned(FIRST_PINCHER_JOB, this.assignments) && jobIsAssigned(SECOND_PINCHER_JOB, this.assignments)) {
          const first = findByJob(FIRST_PINCHER_JOB, this.assignments);
          const second = findByJob(SECOND_PINCHER_JOB, this.assignments);
          const currentDistance = distance(first.clientX, first.clientY, second.clientX, second.clientY);
          this.pinch.delta += currentDistance - this.pinch.currentDistance;
          this.pinch.currentDistance = currentDistance;
        }
        break;
    }
  }

  start(touch) {
    if (touchIsAssigned(touch, this.assignments)) {
      console.error("touch already has a job");
      return;
    }

    const isFirstTouch = this.assignments.length === 0;
    const isSecondTouch = this.assignments.length === 1;
    const isThirdTouch = this.assignments.length === 2;

    const hasSecondPinch = !!findByJob(SECOND_PINCHER_JOB, this.assignments);

    if (isFirstTouch || (isThirdTouch && hasSecondPinch)) {
      let assignment;

      // First touch or third touch and other two fingers were pinching
      if (shouldMoveCursor(touch, this.canvasRect, this.raycaster)) {
        assignment = assign(touch, MOVE_CURSOR_JOB, this.assignments);

        // Grabbing objects is delayed by several frames:
        // - We don't want the physics constraint to be applied too early, which results in crazy velocities
        // - We don't want to mis-trigger grabs if the user is about to put down a second finger.
        assignment.framesUntilGrab = 2;
      } else {
        assignment = assign(touch, MOVE_CAMERA_JOB, this.assignments);
        assignment.delta = [0, 0];
      }

      assignment.clientX = touch.clientX;
      assignment.clientY = touch.clientY;

      // On touch down, we always move the cursor on the first frame, but the MOVE_CURSOR_JOB indicates
      // the touch will then track the cursor (instead of the camera)
      assignment.cursorPose = new Pose().fromCameraProjection(
        getPlayerCamera(),
        ((touch.clientX - this.canvasRect.left) / this.canvasRect.width) * 2 - 1,
        -((touch.clientY - this.canvasRect.top) / this.canvasRect.height) * 2 + 1
      );
    } else if (isSecondTouch || isThirdTouch) {
      const cursorJob = findByJob(MOVE_CURSOR_JOB, this.assignments);

      if (isSecondTouch && cursorJob && cursorJob.framesUntilGrab < 0) {
        // The second touch is happening after grab activated, so assign this touch to first pinch.
        const first = assign(touch, FIRST_PINCHER_JOB, this.assignments);
        first.clientX = touch.clientX;
        first.clientY = touch.clientY;
      } else {
        // Second or third touch, but third touch only if not pinching
        if (isSecondTouch) {
          // The second touch is happening before the grab activated, so re-assign the first
          // to the first pinch, and effectively cancel the grab.
          const previousAssignment = this.assignments[0];
          unassign(previousAssignment.touch, previousAssignment.job, this.assignments);
          const first = assign(previousAssignment.touch, FIRST_PINCHER_JOB, this.assignments);
          first.clientX = previousAssignment.clientX;
          first.clientY = previousAssignment.clientY;
        }

        const first = findByJob(FIRST_PINCHER_JOB, this.assignments);

        if (!first) {
          const first = assign(touch, FIRST_PINCHER_JOB, this.assignments);
          first.clientX = touch.clientX;
          first.clientY = touch.clientY;
          return;
        } else {
          const second = assign(touch, SECOND_PINCHER_JOB, this.assignments);
          second.clientX = touch.clientX;
          second.clientY = touch.clientY;

          const initialDistance = distance(first.clientX, first.clientY, second.clientX, second.clientY);

          this.pinch = {
            initialDistance,
            currentDistance: initialDistance,
            delta: 0
          };
        }
      }
    }

    if (this.pendingTap.maxTouchCount === 0 && this.assignments.length > 0) {
      this.pendingTap.startedAt = performance.now();
    }

    this.pendingTap.maxTouchCount = Math.max(this.pendingTap.maxTouchCount, this.assignments.length);
  }

  process(event) {
    switch (event.type) {
      case "touchstart":
        for (const touch of event.changedTouches) {
          this.start(touch);
        }
        break;
      case "touchmove":
        for (const touch of event.touches) {
          this.move(touch);
        }
        break;
      case "touchend":
      case "touchcancel":
        for (const touch of event.changedTouches) {
          this.end(touch);
        }
        break;
    }
  }

  write(frame) {
    if (this.pinch) {
      this.pinch.delta = 0;
    }
    const cameraMover =
      jobIsAssigned(MOVE_CAMERA_JOB, this.assignments) && findByJob(MOVE_CAMERA_JOB, this.assignments);
    if (cameraMover) {
      cameraMover.delta[0] = 0;
      cameraMover.delta[1] = 0;
    }

    this.events.forEach(event => {
      this.process(event);
    });
    while (this.events.length) {
      this.events.pop();
    }

    const path = paths.device.touchscreen;
    const hasCursorJob = jobIsAssigned(MOVE_CURSOR_JOB, this.assignments);
    const hasCameraJob = jobIsAssigned(MOVE_CAMERA_JOB, this.assignments);

    if (hasCursorJob || hasCameraJob) {
      frame.setValueType(path.isTouching, true);

      const assignment = findByJob(MOVE_CURSOR_JOB, this.assignments) || findByJob(MOVE_CAMERA_JOB, this.assignments);
      frame.setPose(path.cursorPose, assignment.cursorPose);
    }

    frame.setValueType(path.isTouchingGrabbable, false);

    if (hasCursorJob) {
      const assignment = findByJob(MOVE_CURSOR_JOB, this.assignments);
      frame.setValueType(path.isTouchingGrabbable, assignment.framesUntilGrab <= 0);
      assignment.framesUntilGrab--;

      if (assignment.framesUntilUnassign >= 0) {
        if (assignment.framesUntilUnassign === 0) {
          unassign(assignment.touch, assignment.job, this.assignments);
        }

        assignment.framesUntilUnassign--;
      }
    }

    if (hasCameraJob) {
      const delta = findByJob(MOVE_CAMERA_JOB, this.assignments).delta;
      frame.setVector2(path.touchCameraDelta, delta[0] / this.canvas.clientWidth, delta[1] / this.canvas.clientHeight);
    }

    frame.setValueType(path.pinch.delta, this.pinch.delta);
    frame.setValueType(path.pinch.initialDistance, this.pinch.initialDistance);
    frame.setValueType(path.pinch.currentDistance, this.pinch.currentDistance);

    if (this.tapIndexToWriteNextFrame && this.tapIndexToWriteNextFrame < TAP_PATHS.length) {
      // write to tap-X path if we had an X-fingered tap
      frame.setValueType(TAP_PATHS[this.tapIndexToWriteNextFrame - 1], true);
    }

    this.tapIndexToWriteNextFrame = 0;

    frame.setValueType(path.anything, this.assignments.length !== 0);
  }
}
