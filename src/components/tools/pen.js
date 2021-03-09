import { paths } from "../../systems/userinput/paths";
import { getLastWorldPosition, getLastWorldQuaternion } from "../../utils/three-utils";
import {
  SOUND_PEN_START_DRAW,
  SOUND_PEN_STOP_DRAW,
  SOUND_PEN_UNDO_DRAW,
  SOUND_PEN_CHANGE_COLOR
} from "../../systems/sound-effects-system";
import { waitForDOMContentLoaded } from "../../utils/async-utils";
import { convertStandardMaterial } from "../../utils/material-utils";

const pathsMap = {
  "player-right-controller": {
    startDrawing: paths.actions.rightHand.startDrawing,
    stopDrawing: paths.actions.rightHand.stopDrawing,
    undoDrawing: paths.actions.rightHand.undoDrawing,
    switchDrawMode: paths.actions.rightHand.switchDrawMode,
    penNextColor: paths.actions.rightHand.penNextColor,
    penPrevColor: paths.actions.rightHand.penPrevColor,
    scalePenTip: paths.actions.rightHand.scalePenTip
  },
  "player-left-controller": {
    startDrawing: paths.actions.leftHand.startDrawing,
    stopDrawing: paths.actions.leftHand.stopDrawing,
    undoDrawing: paths.actions.leftHand.undoDrawing,
    switchDrawMode: paths.actions.leftHand.switchDrawMode,
    penNextColor: paths.actions.leftHand.penNextColor,
    penPrevColor: paths.actions.leftHand.penPrevColor,
    scalePenTip: paths.actions.leftHand.scalePenTip
  },
  "right-cursor": {
    pose: paths.actions.cursor.right.pose,
    startDrawing: paths.actions.cursor.right.startDrawing,
    stopDrawing: paths.actions.cursor.right.stopDrawing,
    undoDrawing: paths.actions.cursor.right.undoDrawing,
    penNextColor: paths.actions.cursor.right.penNextColor,
    penPrevColor: paths.actions.cursor.right.penPrevColor,
    scalePenTip: paths.actions.cursor.right.scalePenTip
  },
  "left-cursor": {
    pose: paths.actions.cursor.left.pose,
    startDrawing: paths.actions.cursor.left.startDrawing,
    stopDrawing: paths.actions.cursor.left.stopDrawing,
    undoDrawing: paths.actions.cursor.left.undoDrawing,
    penNextColor: paths.actions.cursor.left.penNextColor,
    penPrevColor: paths.actions.cursor.left.penPrevColor,
    scalePenTip: paths.actions.cursor.left.scalePenTip
  }
};

const DRAW_MODE = {
  DEFAULT_3D: 0,
  PROJECTION: 1
};

const MAX_DISTANCE_BETWEEN_SURFACES = 1;

/**
 * Pen tool
 * A tool that allows drawing on networked-drawing components.
 * @namespace drawing
 * @component pen
 */

function almostEquals(epsilon, u, v) {
  return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
}

AFRAME.registerComponent("pen", {
  schema: {
    drawFrequency: { default: 5 }, //frequency of polling for drawing points
    minDistanceBetweenPoints: { default: 0.01 }, //minimum distance to register new drawing point
    camera: { type: "selector" },
    drawingManager: { type: "string" },
    color: { type: "color", default: "#FF0033" },
    availableColors: {
      default: [
        "#FF0033",
        "#FFFF00",
        "#0099FF",
        "#00FF33",
        "#9900FF",
        "#FF6600",
        "#8D5524",
        "#C68642",
        "#E0AC69",
        "#F1C27D",
        "#FFDBAC",
        "#FFFFFF",
        "#222222",
        "#111111",
        "#000000"
      ]
    },
    radius: { default: 0.01 }, //drawing geometry radius
    minRadius: { default: 0.005 },
    maxRadius: { default: 0.2 },
    far: { default: 100 },
    near: { default: 0.01 },
    drawMode: { default: DRAW_MODE.DEFAULT_3D, oneOf: [DRAW_MODE.DEFAULT_3D, DRAW_MODE.PROJECTION] },
    penVisible: { default: true },
    penTipPosition: { default: { x: 0, y: 0, z: 0 } }
  },

  init() {
    this.timeSinceLastDraw = 0;

    this.lastPosition = new THREE.Vector3();
    this.lastPosition.copy(this.el.object3D.position);

    this.direction = new THREE.Vector3(1, 0, 0);

    this.currentDrawing = null;

    this.normal = new THREE.Vector3();

    this.worldPosition = new THREE.Vector3();

    this.colorIndex = 0;

    this.grabbed = false;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true; // flag specific to three-mesh-bvh

    this.originalPosition = this.el.object3D.position.clone();
    this.lastIntersectionDistance = 0;

    this.targets = [];
    this.setDirty = this.setDirty.bind(this);
    this.dirty = true;

    let material = new THREE.MeshStandardMaterial();
    const quality = window.APP.store.materialQualitySetting;
    material = convertStandardMaterial(material, quality);

    this.penTip = new THREE.Mesh(new THREE.SphereBufferGeometry(1, 16, 12), material);
    this.penTip.scale.setScalar(this.data.radius / this.el.parentEl.object3D.scale.x);
    this.penTip.matrixNeedsUpdate = true;

    this.el.setObject3D("mesh", this.penTip);

    const environmentMapComponent = this.el.sceneEl.components["environment-map"];
    if (environmentMapComponent) {
      environmentMapComponent.applyEnvironmentMap(this.el.parentEl.object3D);
    }

    this.penLaserAttributesUpdated = false;
    this.penLaserAttributes = {
      color: "#FF0033",
      laserVisible: false,
      laserInHand: false,
      laserOrigin: { x: 0, y: 0, z: 0 },
      remoteLaserOrigin: { x: 0, y: 0, z: 0 },
      laserTarget: { x: 0, y: 0, z: 0 }
    };

    // TODO: Use the MutationRecords passed into the callback function to determine added/removed nodes!
    this.observer = new MutationObserver(this.setDirty);

    waitForDOMContentLoaded().then(() => {
      const scene = document.querySelector("a-scene");
      this.observer.observe(scene, { childList: true, attributes: true, subtree: true });
      scene.addEventListener("object3dset", this.setDirty);
      scene.addEventListener("object3dremove", this.setDirty);
    });

    this.penSystem = this.el.sceneEl.systems["pen-tools"];
    this.penSystem.register(this.el);
  },

  play() {
    this.drawingManager = document.querySelector(this.data.drawingManager).components["drawing-manager"];
  },

  update(prevData) {
    if (prevData.color != this.data.color) {
      this.penTip.material.color.set(this.data.color);
      this.penLaserAttributes.color = this.data.color;
      this.el.setAttribute("pen-laser", { color: this.data.color });
    }
    if (prevData.radius != this.data.radius) {
      this.el.setAttribute("radius", this.data.radius);
    }

    this.raycaster.far = this.data.far;
    this.raycaster.near = this.data.near;
  },

  tick(t, dt) {
    const isMine = this.el.parentEl.components.networked.initialized && this.el.parentEl.components.networked.isMine();

    if (this.penTip.material.visible !== isMine) {
      this.penTip.material.visible = isMine;
    }

    if (isMine) {
      this._handleInput();

      const cursorPose =
        this.data.drawMode === DRAW_MODE.PROJECTION &&
        (this.grabberId === "right-cursor" || this.grabberId === "left-cursor")
          ? AFRAME.scenes[0].systems.userinput.get(pathsMap[this.grabberId].pose)
          : null;

      const intersection = this._getIntersection(cursorPose);

      this._updatePenTip(intersection);

      const laserVisible = this.data.drawMode === DRAW_MODE.PROJECTION && !!intersection;
      const laserInHand = this.el.sceneEl.is("vr-mode") && laserVisible;

      if (this.penLaserAttributes.laserVisible !== laserVisible) {
        this.penLaserAttributes.laserVisible = laserVisible;
        this.penLaserAttributesUpdated = true;
      }

      if (this.penLaserAttributes.laserInHand !== laserInHand) {
        this.penLaserAttributes.laserInHand = laserInHand;
        this.penLaserAttributesUpdated = true;
      }

      if (laserVisible) {
        this._updateLaser(cursorPose, intersection);
      }

      const penVisible = (this.grabberId !== "left-cursor" && this.grabberId !== "right-cursor") || !intersection;
      this._setPenVisible(penVisible);
      this.el.setAttribute("pen", { penVisible: penVisible });

      this._doDraw(intersection, dt);

      if (this.penLaserAttributesUpdated) {
        this.penLaserAttributesUpdated = false;
        this.el.setAttribute("pen-laser", this.penLaserAttributes, true);
      }
    } else {
      this._setPenVisible(this.data.penVisible);
    }
  },

  _handleInput() {
    const userinput = AFRAME.scenes[0].systems.userinput;
    const interaction = AFRAME.scenes[0].systems.interaction;

    if (interaction.state.rightHand.held === this.el.parentNode) {
      this.grabberId = "player-right-controller";
    } else if (interaction.state.leftHand.held === this.el.parentNode) {
      this.grabberId = "player-left-controller";
    } else if (interaction.state.rightRemote.held === this.el.parentNode) {
      this.grabberId = "right-cursor";
      this.data.drawMode = DRAW_MODE.PROJECTION;
    } else if (interaction.state.leftRemote.held === this.el.parentNode) {
      this.grabberId = "left-cursor";
      this.data.drawMode = DRAW_MODE.PROJECTION;
    } else {
      this.grabberId = null;
    }

    if (this.grabberId && pathsMap[this.grabberId]) {
      const sfx = this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem;
      const paths = pathsMap[this.grabberId];
      if (userinput.get(paths.startDrawing)) {
        this._startDraw();
        sfx.playSoundOneShot(SOUND_PEN_START_DRAW);
      }
      if (userinput.get(paths.stopDrawing)) {
        this._endDraw();
        sfx.playSoundOneShot(SOUND_PEN_STOP_DRAW);
      }
      const penScaleMod = userinput.get(paths.scalePenTip);
      if (penScaleMod) {
        this._changeRadius(penScaleMod);
      }
      if (userinput.get(paths.penNextColor)) {
        this._changeColor(1);
        sfx.playSoundOneShot(SOUND_PEN_CHANGE_COLOR);
      }
      if (userinput.get(paths.penPrevColor)) {
        this._changeColor(-1);
        sfx.playSoundOneShot(SOUND_PEN_CHANGE_COLOR);
      }
      if (userinput.get(paths.undoDrawing)) {
        this._undoDraw();
        sfx.playSoundOneShot(SOUND_PEN_UNDO_DRAW);
      }
      if (paths.switchDrawMode && userinput.get(paths.switchDrawMode)) {
        this.data.drawMode = this.data.drawMode === DRAW_MODE.DEFAULT_3D ? DRAW_MODE.PROJECTION : DRAW_MODE.DEFAULT_3D;
      }
    }
  },

  _getIntersection: (() => {
    const rawIntersections = [];
    const worldQuaternion = new THREE.Quaternion();
    return function(cursorPose) {
      rawIntersections.length = 0;

      if (this.data.drawMode === DRAW_MODE.PROJECTION) {
        if (cursorPose) {
          this.raycaster.ray.origin.copy(cursorPose.position);
          this.raycaster.ray.direction.copy(cursorPose.direction);
        } else if (this.grabberId !== null) {
          getLastWorldPosition(this.el.parentEl.object3D, this.raycaster.ray.origin);
          getLastWorldQuaternion(this.el.parentEl.object3D, worldQuaternion);
          this.raycaster.ray.direction.set(0, -1, 0);
          this.raycaster.ray.direction.applyQuaternion(worldQuaternion);
        }

        if (this.grabberId !== null) {
          this.raycaster.intersectObjects(this.targets, true, rawIntersections);
          return rawIntersections[0];
        }
      }

      return null;
    };
  })(),

  _updatePenTip(intersection) {
    if (this.data.drawMode === DRAW_MODE.PROJECTION) {
      if (intersection) {
        this.el.object3D.position.copy(intersection.point);

        this.el.parentEl.object3D.worldToLocal(this.el.object3D.position);

        this.el.object3D.matrixNeedsUpdate = true;
        this.worldPosition.copy(intersection.point);
      } else {
        this.el.object3D.position.copy(this.originalPosition);
        this.el.object3D.matrixNeedsUpdate = true;
        getLastWorldPosition(this.el.object3D, this.worldPosition);
      }
    } else {
      this.el.object3D.position.copy(this.originalPosition);
      this.el.object3D.matrixNeedsUpdate = true;
      getLastWorldPosition(this.el.object3D, this.worldPosition);
    }
  },

  _updateLaser: (() => {
    const laserStartPosition = new THREE.Vector3();
    const laserEndPosition = new THREE.Vector3();
    const camerWorldPosition = new THREE.Vector3();
    const remoteLaserOrigin = new THREE.Vector3();
    return function(cursorPose, intersection) {
      if (cursorPose) {
        laserStartPosition.copy(cursorPose.position);
      } else {
        this.el.parentEl.object3D.getWorldPosition(laserStartPosition);
      }

      laserEndPosition.copy(intersection.point);

      if (this.el.sceneEl.is("vr-mode")) {
        remoteLaserOrigin.copy(laserStartPosition);
      } else {
        this.data.camera.object3D.getWorldPosition(camerWorldPosition);
        remoteLaserOrigin
          .subVectors(laserEndPosition, camerWorldPosition)
          .normalize()
          .multiplyScalar(0.5);
        remoteLaserOrigin.add(camerWorldPosition);
      }

      if (!almostEquals(0.001, this.penLaserAttributes.laserOrigin, laserStartPosition)) {
        this.penLaserAttributes.laserOrigin.x = laserStartPosition.x;
        this.penLaserAttributes.laserOrigin.y = laserStartPosition.y;
        this.penLaserAttributes.laserOrigin.z = laserStartPosition.z;
        this.penLaserAttributesUpdated = true;
      }

      if (!almostEquals(0.001, this.penLaserAttributes.remoteLaserOrigin, remoteLaserOrigin)) {
        this.penLaserAttributes.remoteLaserOrigin.x = remoteLaserOrigin.x;
        this.penLaserAttributes.remoteLaserOrigin.y = remoteLaserOrigin.y;
        this.penLaserAttributes.remoteLaserOrigin.z = remoteLaserOrigin.z;
        this.penLaserAttributesUpdated = true;
      }

      if (!almostEquals(0.001, this.penLaserAttributes.laserTarget, laserEndPosition)) {
        this.penLaserAttributes.laserTarget.x = laserEndPosition.x;
        this.penLaserAttributes.laserTarget.y = laserEndPosition.y;
        this.penLaserAttributes.laserTarget.z = laserEndPosition.z;
        this.penLaserAttributesUpdated = true;
      }
    };
  })(),

  _doDraw(intersection, dt) {
    //Prevent drawings from "jumping" large distances
    if (
      this.currentDrawing &&
      (this.lastIntersectedObject !== (intersection ? intersection.object : null) &&
        (!intersection ||
          Math.abs(intersection.distance - this.lastIntersectionDistance) > MAX_DISTANCE_BETWEEN_SURFACES))
    ) {
      this.worldPosition.copy(this.lastPosition);
      this._endDraw();
    }
    this.lastIntersectionDistance = intersection ? intersection.distance : 0;
    this.lastIntersectedObject = intersection ? intersection.object : null;

    if (!almostEquals(0.005, this.worldPosition, this.lastPosition)) {
      this.direction.subVectors(this.worldPosition, this.lastPosition).normalize();
      this.lastPosition.copy(this.worldPosition);
    }

    if (this.currentDrawing) {
      const time = this.timeSinceLastDraw + dt;
      if (
        time >= this.data.drawFrequency &&
        this.currentDrawing.getLastPoint().distanceTo(this.worldPosition) >= this.data.minDistanceBetweenPoints
      ) {
        this._getNormal(this.normal, this.worldPosition, this.direction);
        this.currentDrawing.draw(this.worldPosition, this.direction, this.normal, this.data.color, this.data.radius);
      }

      this.timeSinceLastDraw = time % this.data.drawFrequency;
    }

    if (this.currentDrawing && !this.grabberId) {
      this._endDraw();
    }

    if (this.dirty) {
      this.populateEntities(this.targets);
      this.dirty = false;
    }
  },

  _setPenVisible(visible) {
    if (this.el.parentEl.object3DMap.mesh && this.el.parentEl.object3DMap.mesh.visible !== visible) {
      this.el.parentEl.object3DMap.mesh.visible = visible;
    }
  },

  //helper function to get normal of direction of drawing cross direction to camera
  _getNormal: (() => {
    const directionToCamera = new THREE.Vector3();
    return function(normal, position, direction) {
      directionToCamera.subVectors(position, this.data.camera.object3D.position).normalize();
      normal.crossVectors(direction, directionToCamera);
    };
  })(),

  _startDraw() {
    this.drawingManager.getDrawing(this).then(drawing => {
      this.currentDrawing = drawing;
      this._getNormal(this.normal, this.worldPosition, this.direction);
      this.currentDrawing.startDraw(this.worldPosition, this.direction, this.normal, this.data.color, this.data.radius);
    });
  },

  _endDraw() {
    if (this.currentDrawing) {
      this.timeSinceLastDraw = 0;
      this._getNormal(this.normal, this.worldPosition, this.direction);
      this.currentDrawing.endDraw(this.worldPosition, this.direction, this.normal);
      this.drawingManager.returnDrawing(this);
      this.currentDrawing = null;
    }
  },

  _undoDraw() {
    this.drawingManager.getDrawing(this).then(drawing => {
      drawing.undoDraw();
      this.drawingManager.returnDrawing(this);
    });
  },

  _changeColor(mod) {
    this.colorIndex = (this.colorIndex + mod + this.data.availableColors.length) % this.data.availableColors.length;
    this.data.color = this.data.availableColors[this.colorIndex];
    this.penTip.material.color.set(this.data.color);
    this.penLaserAttributes.color = this.data.color;
    this.penLaserAttributesUpdated = true;
  },

  _changeRadius(mod) {
    this.data.radius = Math.max(this.data.minRadius, Math.min(this.data.radius + mod, this.data.maxRadius));
    this.penTip.scale.setScalar(this.data.radius / this.el.parentEl.object3D.scale.x);
    this.penTip.matrixNeedsUpdate = true;
  },

  setDirty() {
    this.dirty = true;
  },

  populateEntities(targets) {
    targets.length = 0;
    // TODO: Do not querySelectorAll on the entire scene every time anything changes!
    const els = AFRAME.scenes[0].querySelectorAll(".collidable, .interactable, #environment-root");
    for (let i = 0; i < els.length; i++) {
      if (!els[i].classList.contains("pen") && els[i].object3D) {
        targets.push(els[i].object3D);
      }
    }
  },

  remove() {
    this.observer.disconnect();
    this.el.sceneEl.removeEventListener("object3dset", this.setDirty);
    this.el.sceneEl.removeEventListener("object3dremove", this.setDirty);
    this.penSystem.deregister(this.el);
  }
});
