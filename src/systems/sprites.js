/* global AFRAME THREE */

// See doc/spritesheet-generation.md for information about this spritesheet
import spritesheetAction from "../assets/images/spritesheets/sprite-system-action-spritesheet.json";
import spritesheetNotice from "../assets/images/spritesheets/sprite-system-notice-spritesheet.json";
import { createImageTexture } from "../utils/media-utils";
import spritesheetActionPng from "../assets/images/spritesheets/sprite-system-action-spritesheet.png";
import spritesheetNoticePng from "../assets/images/spritesheets/sprite-system-notice-spritesheet.png";
import { waitForDOMContentLoaded } from "../utils/async-utils";
import vert from "./sprites/sprite.vert";
import frag from "./sprites/sprite.frag";
import { getThemeColorShifter } from "../utils/theme-sprites";

const multiviewVertPrefix = [
  // GLSL 3.0 conversion
  "#version 300 es",
  "#define attribute in",
  "#define varying out",
  "#define texture2D texture",
  "#extension GL_OVR_multiview : require",
  "layout(num_views = 2) in;",
  "uniform mat4 modelViewMatrix;",
  "uniform mat4 modelViewMatrix2;",
  "#define modelViewMatrix (gl_ViewID_OVR==0u?modelViewMatrix:modelViewMatrix2)",
  "uniform mat4 projectionMatrix;",
  "uniform mat4 projectionMatrix2;",
  "#define projectionMatrix (gl_ViewID_OVR==0u?projectionMatrix:projectionMatrix2)",
  ""
].join("\n");
const nonmultiviewVertPrefix = ["uniform mat4 modelViewMatrix;", "uniform mat4 projectionMatrix;", ""].join("\n");

const multiviewFragPrefix = [
  "#version 300 es",
  "#define varying in",
  "out highp vec4 pc_fragColor;",
  "#define gl_FragColor pc_fragColor",
  "#define texture2D texture",
  ""
].join("\n");

const nonmultiviewFragPrefix = "";

function isVisible(o) {
  if (!o.visible) return false;
  if (!o.parent) return true;
  return isVisible(o.parent);
}

AFRAME.registerComponent("sprite", {
  schema: { name: { type: "string" } },
  tick() {
    // TODO when we run out of sprites we currently just stop rendering them. We need to do something better.
    if (!(this.didRegisterWithSystem || this.didFailToRegister) && this.el.sceneEl.systems["hubs-systems"]) {
      const registered = this.el.sceneEl.systems["hubs-systems"].spriteSystem.add(this);
      this.didRegisterWithSystem = registered > 0;
      this.didFailToRegister = registered < 0;
    }
  },

  update() {
    if (this.didRegisterWithSystem) {
      this.el.sceneEl.systems["hubs-systems"].spriteSystem.updateUVs(this);
    }
  },

  remove() {
    if (this.didRegisterWithSystem) {
      this.el.sceneEl.systems["hubs-systems"].spriteSystem.remove(this);
    }
  }
});

const normalizedFrame = (function() {
  const memo = new Map();
  return function normalizedFrame(name, spritesheet, missingSprites) {
    let ret = memo.get(name);
    if (ret) {
      return ret;
    } else {
      if (!spritesheet.frames[name]) {
        if (missingSprites.indexOf(name) === -1) {
          missingSprites.push(name);
        }
        ret = { x: 0, y: 0, w: 0, h: 0 };
        memo.set(name, ret);
        return ret;
      }
      const size = spritesheet.meta.size;
      const frame = spritesheet.frames[name].frame;
      ret = {
        x: frame.x / size.w,
        y: frame.y / size.h,
        w: frame.w / size.w,
        h: frame.h / size.h
      };
      memo.set(name, ret);
      return ret;
    }
  };
})();

const getSheetType = sprite => (spritesheetAction.frames[sprite.data.name] ? "action" : "notice");
const SHEET_TYPES = ["action", "notice"];

const raycastOnSprite = (function() {
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const vD = new THREE.Vector3();
  const point = new THREE.Vector3();
  const intersectionInfo = { distance: 0, point, object: null };

  return function raycast(raycaster, intersects) {
    this.updateMatrices();
    vA.set(-0.5, 0.5, 0).applyMatrix4(this.matrixWorld);
    vB.set(0.5, 0.5, 0).applyMatrix4(this.matrixWorld);
    vC.set(-0.5, -0.5, 0).applyMatrix4(this.matrixWorld);
    let intersect = raycaster.ray.intersectTriangle(vA, vC, vB, false, point);
    if (intersect === null) {
      vD.set(0.5, -0.5, 0).applyMatrix4(this.matrixWorld);
      intersect = raycaster.ray.intersectTriangle(vB, vC, vD, false, point);
      if (intersect === null) {
        return;
      }
    }

    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance < raycaster.near || distance > raycaster.far) return;

    intersectionInfo.distance = distance;
    intersectionInfo.point = point;
    intersectionInfo.object = this;
    intersects.push(intersectionInfo);
  };
})();

function getHoverableVisuals(el) {
  if (!el || !el.components) return null;
  if (el.components["hoverable-visuals"]) {
    return el.components["hoverable-visuals"];
  }
  return getHoverableVisuals(el.parentEl);
}

function enableSweepingEffect(comp) {
  const hoverableVisuals = getHoverableVisuals(comp.el);
  if (!hoverableVisuals) {
    return false;
  }

  const isPinned = hoverableVisuals.el.components.pinnable && hoverableVisuals.el.components.pinnable.data.pinned;
  const isSpawner = !!hoverableVisuals.el.components["super-spawner"];
  const isFrozen = hoverableVisuals.el.sceneEl.is("frozen");
  const hideDueToPinning = !isSpawner && isPinned && !isFrozen;
  return hoverableVisuals.data.enableSweepingEffect && !hideDueToPinning;
}

function createGeometry(maxSprites) {
  const geometry = new THREE.BufferGeometry();
  // We need to use "position" as the attribute name here. It was previously "a_vertices". It seems three.js
  // might assume that geometries have a "position" attribute in some cases,
  // like in https://github.com/mrdoob/three.js/pull/18044
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxSprites * 3 * 4), 3, false));
  geometry.setAttribute(
    "a_hubs_EnableSweepingEffect",
    new THREE.BufferAttribute(new Float32Array(maxSprites * 4), 1, false)
  );
  geometry.setAttribute(
    "a_hubs_SweepParams",
    new THREE.BufferAttribute(new Float32Array(maxSprites * 4 * 2), 2, false)
  );
  geometry.setAttribute("a_uvs", new THREE.BufferAttribute(new Float32Array(maxSprites * 2 * 4), 2, false));
  const mvCols = new THREE.InterleavedBuffer(new Float32Array(maxSprites * 16 * 4), 16);
  geometry.setAttribute("mvCol0", new THREE.InterleavedBufferAttribute(mvCols, 4, 0, false));
  geometry.setAttribute("mvCol1", new THREE.InterleavedBufferAttribute(mvCols, 4, 4, false));
  geometry.setAttribute("mvCol2", new THREE.InterleavedBufferAttribute(mvCols, 4, 8, false));
  geometry.setAttribute("mvCol3", new THREE.InterleavedBufferAttribute(mvCols, 4, 12, false));
  const indices = new Array(3 * 2 * maxSprites);
  for (let i = 0; i < maxSprites; i++) {
    indices[i * 3 * 2 + 0] = i * 4 + 0;
    indices[i * 3 * 2 + 1] = i * 4 + 2;
    indices[i * 3 * 2 + 2] = i * 4 + 1;
    indices[i * 3 * 2 + 3] = i * 4 + 1;
    indices[i * 3 * 2 + 4] = i * 4 + 2;
    indices[i * 3 * 2 + 5] = i * 4 + 3;
  }
  geometry.setIndex(indices);
  return geometry;
}

const ZEROS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export class SpriteSystem {
  raycast(raycaster, intersects) {
    for (let i = 0; i < SHEET_TYPES.length; i++) {
      const sheetType = SHEET_TYPES[i];
      const slots = this.slots[sheetType];

      for (let i = 0, l = slots.length; i < l; i++) {
        if (!slots[i]) continue;

        const o = this.indexWithSprite[sheetType].get(i).el.object3D;
        if (isVisible(o)) {
          raycastOnSprite.call(o, raycaster, intersects);
        }
      }
    }

    return intersects;
  }
  constructor(scene) {
    this.missingSprites = [];
    this.maxSprites = 1024;
    this.slots = { action: new Array(this.maxSprites), notice: new Array(this.maxSprites) };
    this.spriteWithIndex = { action: new Map(), notice: new Map() };
    this.indexWithSprite = { action: new Map(), notice: new Map() };
    this.stack = { action: new Array(this.maxSprites), notice: new Array(this.maxSprites) };
    this.meshes = {};

    for (const stack of Object.values(this.stack)) {
      for (let i = 0; i < this.maxSprites; i++) {
        stack[i] = this.maxSprites - 1 - i;
      }
    }

    const vertexShader = String.prototype.concat(
      scene.renderer.xr.multiview ? multiviewVertPrefix : nonmultiviewVertPrefix,
      vert
    );
    const fragmentShader = String.prototype.concat(
      scene.renderer.xr.multiview ? multiviewFragPrefix : nonmultiviewFragPrefix,
      frag
    );

    const domReady = waitForDOMContentLoaded();

    Promise.all([domReady]).then(() => {
      for (const [spritesheetPng, type] of [[spritesheetActionPng, "action"], [spritesheetNoticePng, "notice"]]) {
        Promise.all([createImageTexture(spritesheetPng, getThemeColorShifter(type)), waitForDOMContentLoaded()]).then(
          ([spritesheetTexture]) => {
            const material = new THREE.RawShaderMaterial({
              uniforms: {
                u_spritesheet: { value: spritesheetTexture },
                hubs_Time: { value: 0 }
              },
              vertexShader,
              fragmentShader,
              side: THREE.DoubleSide,
              transparent: true
            });
            const mesh = (this.meshes[type] = new THREE.Mesh(createGeometry(this.maxSprites), material));
            const el = document.createElement("a-entity");
            el.classList.add("ui");
            scene.appendChild(el);
            el.setObject3D("mesh", mesh);
            mesh.frustumCulled = false;
            mesh.renderOrder = window.APP.RENDER_ORDER.HUD_ICONS;
            mesh.raycast = this.raycast.bind(this);
          }
        );
      }
    });
  }

  tick(t) {
    if (!this.meshes.action || !this.meshes.notice) return;

    for (let i = 0; i < SHEET_TYPES.length; i++) {
      const sheetType = SHEET_TYPES[i];
      const mesh = this.meshes[sheetType];
      mesh.material.uniforms.hubs_Time.value = t;
      mesh.material.uniformsNeedUpdate = true;

      const mvCols = mesh.geometry.attributes["mvCol0"].data; // interleaved
      const aEnableSweepingEffect = mesh.geometry.attributes["a_hubs_EnableSweepingEffect"];
      const aSweepParams = mesh.geometry.attributes["a_hubs_SweepParams"];
      for (let i = 0, l = this.slots[sheetType].length; i < l; i++) {
        const slots = this.slots[sheetType];
        if (!slots[i]) continue;

        const indexWithSprite = this.indexWithSprite[sheetType];

        const sprite = indexWithSprite.get(i);

        if (isVisible(sprite.el.object3D)) {
          const enableSweepingEffectValue = enableSweepingEffect(sprite) ? 1 : 0;
          aEnableSweepingEffect.array[i * 4 + 0] = enableSweepingEffectValue;
          aEnableSweepingEffect.array[i * 4 + 1] = enableSweepingEffectValue;
          aEnableSweepingEffect.array[i * 4 + 2] = enableSweepingEffectValue;
          aEnableSweepingEffect.array[i * 4 + 3] = enableSweepingEffectValue;
          aEnableSweepingEffect.needsUpdate = true;
          if (enableSweepingEffectValue) {
            const hoverableVisuals = getHoverableVisuals(sprite.el);
            const s = hoverableVisuals.sweepParams[0];
            const t = hoverableVisuals.sweepParams[1];
            aSweepParams.setXY(4 * i + 0, s, t);
            aSweepParams.setXY(4 * i + 1, s, t);
            aSweepParams.setXY(4 * i + 2, s, t);
            aSweepParams.setXY(4 * i + 3, s, t);
            aSweepParams.needsUpdate = true;
          }

          sprite.el.object3D.updateMatrices();
          const mat4 = sprite.el.object3D.matrixWorld;
          mvCols.array.set(mat4.elements, i * 4 * 16 + 0);
          mvCols.array.set(mat4.elements, i * 4 * 16 + 1 * 16);
          mvCols.array.set(mat4.elements, i * 4 * 16 + 2 * 16);
          mvCols.array.set(mat4.elements, i * 4 * 16 + 3 * 16);
          mvCols.needsUpdate = true;
        } else {
          mvCols.array.set(ZEROS, i * 4 * 16 + 0);
          mvCols.array.set(ZEROS, i * 4 * 16 + 1 * 16);
          mvCols.array.set(ZEROS, i * 4 * 16 + 2 * 16);
          mvCols.array.set(ZEROS, i * 4 * 16 + 3 * 16);
          mvCols.needsUpdate = true;
        }
      }
    }
  }

  updateUVs(sprite) {
    const sheetType = getSheetType(sprite);
    const mesh = this.meshes[sheetType];
    const spriteWithIndex = this.spriteWithIndex[sheetType];

    const flipY = mesh.material.uniforms.u_spritesheet.value.flipY;
    const i = spriteWithIndex.get(sprite);
    const frame = normalizedFrame(
      sprite.data.name,
      sheetType === "action" ? spritesheetAction : spritesheetNotice,
      this.missingSprites
    );
    const aUvs = mesh.geometry.attributes["a_uvs"];

    aUvs.setXY(i * 4 + 0, frame.x, flipY ? 1 - frame.y : frame.y);
    aUvs.setXY(i * 4 + 1, frame.x + frame.w, flipY ? 1 - frame.y : frame.y);
    aUvs.setXY(i * 4 + 2, frame.x, flipY ? 1 - frame.y - frame.h : frame.y + frame.h);
    aUvs.setXY(i * 4 + 3, frame.x + frame.w, flipY ? 1 - frame.y - frame.h : frame.y + frame.h);
    aUvs.needsUpdate = true;
  }

  add(sprite) {
    if (!this.meshes.action || !this.meshes.notice) {
      return 0;
    }
    const sheetType = getSheetType(sprite);
    const stack = this.stack[sheetType];
    const i = stack.pop();
    if (i === undefined) {
      console.error("Too many sprites");
      return -1;
    }
    const slots = this.slots[sheetType];
    const spriteWithIndex = this.spriteWithIndex[sheetType];
    const indexWithSprite = this.indexWithSprite[sheetType];
    const mesh = this.meshes[sheetType];
    slots[i] = true;
    spriteWithIndex.set(sprite, i);
    indexWithSprite.set(i, sprite);

    this.updateUVs(sprite);

    const aVertices = mesh.geometry.attributes["position"];
    aVertices.setXYZ(i * 4 + 0, -0.5, 0.5, 0);
    aVertices.setXYZ(i * 4 + 1, 0.5, 0.5, 0);
    aVertices.setXYZ(i * 4 + 2, -0.5, -0.5, 0);
    aVertices.setXYZ(i * 4 + 3, 0.5, -0.5, 0);
    aVertices.needsUpdate = true;
    return 1;
  }

  remove(sprite) {
    const sheetType = getSheetType(sprite);
    const slots = this.slots[sheetType];
    const spriteWithIndex = this.spriteWithIndex[sheetType];
    const indexWithSprite = this.indexWithSprite[sheetType];
    const stack = this.stack[sheetType];
    const mesh = this.meshes[sheetType];

    const i = spriteWithIndex.get(sprite);
    spriteWithIndex.delete(sprite);
    indexWithSprite.delete(i);
    slots[i] = false;
    stack.push(i);

    const mvCols = mesh.geometry.attributes["mvCol0"].data; // interleaved
    mvCols.array.set(ZEROS, i * 4 * 16 + 0);
    mvCols.array.set(ZEROS, i * 4 * 16 + 1 * 16);
    mvCols.array.set(ZEROS, i * 4 * 16 + 2 * 16);
    mvCols.array.set(ZEROS, i * 4 * 16 + 3 * 16);
    mvCols.needsUpdate = true;
  }
}
