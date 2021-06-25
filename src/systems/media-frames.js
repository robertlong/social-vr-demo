import { MediaType } from "../utils/media-utils";
import { computeObjectAABB } from "../utils/auto-box-collider";
import { TEXTURES_FLIP_Y } from "../loaders/HubsTextureLoader";
import { applyPersistentSync } from "../utils/permissions-utils";
import { THREE } from "aframe";

function scaleForAspectFit(containerSize, itemSize) {
  return Math.min(containerSize.x / itemSize.x, Math.min(containerSize.y / itemSize.y, containerSize.z / itemSize.z));
}

const isCapturableByType = {
  [MediaType.ALL]: function(el) {
    // Media can either come from media-loader or be explictly designated 'moveable'
    return !!(el && (el.components["media-loader"] || el.components["moveable"]));
  },
  [MediaType.ALL_2D]: function(el) {
    return !!(el && (el.components["media-image"] || el.components["media-video"] || el.components["media-pdf"]));
  },
  [MediaType.MODEL]: function(el) {
    // Interactable models were either loaded with gltf-model-plus or explictly designated 'moveable'
    return !!(el && (el.components["gltf-model-plus"] || el.components["moveable"]));
  },
  [MediaType.IMAGE]: function(el) {
    return !!(el && el.components["media-image"]);
  },
  [MediaType.VIDEO]: function(el) {
    return !!(el && el.components["media-video"]);
  },
  [MediaType.PDF]: function(el) {
    return !!(el && el.components["media-pdf"]);
  }
};

const EMPTY_COLOR = 0x6fc0fd;
const HOVER_COLOR = 0x2f80ed;
const FULL_COLOR = 0x808080;

const components = [];
export class MediaFramesSystem {
  constructor(physicsSystem, interactionSystem) {
    this.physicsSystem = physicsSystem;
    this.interactionSystem = interactionSystem;
  }

  tick() {
    // Has a frame captured anything so far?
    let captureIsActive = false;
    // Which element has been captured?
    let activeCapturedElement;
    for (let i = 0; i < components.length; i++) {
      const frame = components[i];

      const bodyUUID = frame.el.components["body-helper"].uuid;
      // TODO would be nice to fix the timing so we don't need to check this
      if (!this.physicsSystem.bodyInitialized(bodyUUID)) continue;

      const holdingSomethingCapturable = this.interactionSystem.isHoldingAnything(
        isCapturableByType[frame.data.mediaType]
      );

      const guideMesh = frame.el.getObject3D("guide");
      guideMesh.visible = holdingSomethingCapturable;

      if (frame.data.targetId === "empty") {
        // frame empty
        guideMesh.material.uniforms.color.value.set(EMPTY_COLOR);
        if(!captureIsActive) {
          const capturableEl = this.getCapturableEntityCollidingWithBody(frame.data.mediaType, bodyUUID);
          if (capturableEl && NAF.utils.isMine(capturableEl)) {
            // capturable object I own is colliding with an empty frame
            if (this.interactionSystem.isHeld(capturableEl)) {
              // held object I own colliding with an empty frame, show preview
              guideMesh.material.uniforms.color.value.set(HOVER_COLOR);
              frame.showPreview(capturableEl);
              captureIsActive = true;
              activeCapturedElement = capturableEl;
            } else {
              // non-held object I own colliding with an empty frame, capture
              frame.capture(capturableEl);
              captureIsActive = true;
              activeCapturedElement = capturableEl;
            }
          } else {
            // no capturable object I own is colliding with this empty frame, hide preview
            frame.hidePreview();
          }
        } else {
            // a potential capture is already being shown for another frame, so hide preview for this one
            frame.hidePreview();
        }
      } else {
        // frame full
        guideMesh.material.uniforms.color.value.set(FULL_COLOR);
        frame.hidePreview();
        const capturedEl = document.getElementById(frame.data.targetId);
        if (capturedEl) {
          if (NAF.utils.isMine(capturedEl)) {
            if (this.interactionSystem.isHeld(capturedEl)) {
              // Has this specific element been captured by another frame?
              if(captureIsActive && activeCapturedElement == capturedEl) {
                frame.release();
              } else {
                if (!this.isColliding(frame.el, capturedEl)) {
                  // holding the captured object and its no longer colliding, release it
                  frame.release();
                } else {
                  // holding within bounds
                  guideMesh.material.uniforms.color.value.set(HOVER_COLOR);
                  captureIsActive = true;
                }
              }
            } else if (frame.data.snapToCenter && this.interactionSystem.wasReleasedThisFrame(capturedEl)) {
              // released in bounds, re-snap
              frame.snapObject(capturedEl);
            }
          }
        } else {
          // captured object was removed
          frame.release();
        }
      }
    }
  }

  getCapturableEntityCollidingWithBody(mediaType, bodyUUID) {
    const collisions = this.physicsSystem.getCollisions(bodyUUID);
    for (let i = 0; i < collisions.length; i++) {
      const bodyData = this.physicsSystem.bodyUuidToData.get(collisions[i]);
      const mediaObjectEl = bodyData && bodyData.object3D && bodyData.object3D.el;
      // Is this the type of media that can be captured and is it not already captured by another frame?
      if (isCapturableByType[mediaType](mediaObjectEl) && !mediaObjectEl.components["floaty-object"]?.locked) {
        return mediaObjectEl;
      }
    }
    return null;
  }

  isColliding(entityA, entityB) {
    const bodyAUUID = entityA.components["body-helper"].uuid;
    const bodyBUUID = entityB.components["body-helper"].uuid;
    return (
      this.physicsSystem.bodyInitialized(bodyAUUID) &&
      this.physicsSystem.bodyInitialized(bodyBUUID) &&
      this.physicsSystem.getCollisions(bodyAUUID).indexOf(bodyBUUID) !== -1
    );
  }
}

AFRAME.registerComponent("media-frame", {
  schema: {
    bounds: { default: new THREE.Vector3(1, 1, 1) },
    mediaType: { default: MediaType.ALL_2D, oneOf: Object.values(MediaType) },
    snapToCenter: { default: true },
    debug: { default: false },

    targetId: { default: "empty" },
    originalTargetScale: { default: new THREE.Vector3(1, 1, 1) }
  },

  init() {
    this.tmpWorldPosition = new THREE.Vector3();
    //TODO these visuals need work
    this.el.setObject3D(
      "guide",
      new THREE.Mesh(
        new THREE.BoxGeometry(this.data.bounds.x, this.data.bounds.y, this.data.bounds.z),
        new THREE.ShaderMaterial({
          uniforms: {
            color: { value: new THREE.Color(0x2f80ed) }
          },
          vertexShader: `
            varying vec2 vUv;
            void main()
            {
              gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
              vUv = uv;
            }
          `,
          fragmentShader: `
            // adapted from https://www.shadertoy.com/view/Mlt3z8
            float bayerDither2x2( vec2 v ) {
              return mod( 3.0 * v.y + 2.0 * v.x, 4.0 );
            }
            float bayerDither4x4( vec2 v ) {
              vec2 P1 = mod( v, 2.0 );
              vec2 P2 = mod( floor( 0.5  * v ), 2.0 );
              return 4.0 * bayerDither2x2( P1 ) + bayerDither2x2( P2 );
            }

            varying vec2 vUv;
            uniform vec3 color;
            void main() {
              float alpha = max(step(0.45, abs(vUv.x - 0.5)), step(0.45, abs(vUv.y - 0.5))) - 0.5;
              if( ( bayerDither4x4( floor( mod( gl_FragCoord.xy, 4.0 ) ) ) ) / 16.0 >= alpha ) discard;
              gl_FragColor = vec4(color, 1.0);
            }
          `,
          side: THREE.DoubleSide
        })
      )
    );

    const previewMaterial = new THREE.MeshBasicMaterial();
    previewMaterial.side = THREE.DoubleSide;
    previewMaterial.transparent = true;
    previewMaterial.opacity = 0.5;

    const geometry = new THREE.PlaneBufferGeometry(1, 1, 1, 1, TEXTURES_FLIP_Y);
    const previewMesh = new THREE.Mesh(geometry, previewMaterial);
    previewMesh.visible = false;
    this.el.setObject3D("preview", previewMesh);
  },

  update(oldData) {
    // TODO we may want to support dynamic bounds updates, but its currently
    // a pain since runtime shape modifications have lots of issues

    if (this.data.debug) {
      console.log(
        `${this.el.id}: ${oldData.targetId}(${JSON.stringify(oldData.originalTargetScale)}) -> ${
          this.data.targetId
        }(${JSON.stringify(this.data.originalTargetScale)})`
      );
    }

    // Ownership race, whoever owns the old object needs to take care of "ejecting" it
    if (oldData.targetId !== "empty" && oldData.targetId !== this.data.targetId) {
      const capturedEl = document.getElementById(oldData.targetId);
      if (capturedEl && NAF.utils.isMine(capturedEl)) {
        capturedEl.object3D.translateZ(this.data.bounds.z);
        capturedEl.object3D.scale.copy(oldData.originalTargetScale);
        capturedEl.object3D.matrixNeedsUpdate = true;
        capturedEl.components["floaty-object"].setLocked(false);
      }
    }
  },

  play() {
    components.push(this);
    if (this.el.components.networked) {
      applyPersistentSync(this.el.components.networked.data.networkId);
    }
  },

  pause() {
    components.splice(components.indexOf(this), 1);
  },

  // TODO this "preview" feels a bit hacky and error prone, also needs support for previewing 3D objects
  showPreview(capturableEntity) {
    const srcMesh = capturableEntity.getObject3D("mesh");

    if (!isCapturableByType[MediaType.ALL_2D](capturableEntity) || !(srcMesh && srcMesh.material)) return;
    const previewMesh = this.el.getObject3D("preview");

    previewMesh.material.map = srcMesh.material.map;
    previewMesh.material.needsUpdate = true;

    previewMesh.scale.copy(srcMesh.scale);
    previewMesh.scale.multiplyScalar(scaleForAspectFit(this.data.bounds, srcMesh.scale));
    // Preview mesh UVs are set to accomidate textureLoader default, but video textures don't match this
    previewMesh.scale.y *= TEXTURES_FLIP_Y !== previewMesh.material.map.flipY ? -1 : 1;

    previewMesh.matrixNeedsUpdate = true;
    previewMesh.visible = true;
  },

  hidePreview() {
    const previewMesh = this.el.getObject3D("preview");
    previewMesh.material.map = null;
    previewMesh.material.needsUpdate = true;
    previewMesh.visible = false;
  },

  snapObject(capturedEl) {
    this.el.object3D.getWorldPosition(this.tmpWorldPosition);
    capturedEl.object3D.position.copy(this.tmpWorldPosition);
    const worldQuat = new THREE.Quaternion();
    this.el.object3D.getWorldQuaternion(worldQuat);
    capturedEl.object3D.setRotationFromQuaternion(worldQuat);
    capturedEl.object3D.matrixNeedsUpdate = true;
    capturedEl.components["floaty-object"].setLocked(true);
  },

  capture(capturableEntity) {
    if (NAF.utils.isMine(this.el) || NAF.utils.takeOwnership(this.el)) {
      this.el.setAttribute("media-frame", {
        targetId: capturableEntity.id,
        originalTargetScale: new THREE.Vector3().copy(capturableEntity.object3D.scale)
      });
      const worldPosition = new THREE.Vector3();
      this.el.object3D.getWorldPosition(worldPosition);
      capturableEntity.object3D.position.copy(worldPosition);
      const worldQuat = new THREE.Quaternion();
      this.el.object3D.updateWorldMatrix(true);
      this.el.object3D.getWorldQuaternion(worldQuat);
      capturableEntity.object3D.setRotationFromQuaternion(worldQuat);

      // Find exact size of object for a tight fit within the frame
      const boundingBox = new THREE.Box3();
      const boxSize = new THREE.Vector3();
      // Using local AABB to ignore the impact of any local or parental rotations
      computeObjectAABB(capturableEntity.getObject3D("mesh"), boundingBox);
      boundingBox.getSize(boxSize);
      capturableEntity.object3D.scale.setScalar(scaleForAspectFit(this.data.bounds, boxSize));

      capturableEntity.object3D.matrixNeedsUpdate = true;
      capturableEntity.components["floaty-object"].setLocked(true);
      this.hidePreview();
    } else {
      // TODO what do we do about this state? should eventually resolve itself as it will try again next frame...
      console.error("failed to take ownership of media frame");
    }
  },

  release() {
    if (NAF.utils.isMine(this.el) || NAF.utils.takeOwnership(this.el)) {
      const capturedEl = document.getElementById(this.data.targetId);

      this.el.setAttribute("media-frame", {
        targetId: "empty"
      });

      if (capturedEl) {
        capturedEl.object3D.scale.copy(this.data.originalTargetScale);
        capturedEl.object3D.matrixNeedsUpdate = true;
        capturedEl.components["floaty-object"].setLocked(false);
      }
    } else {
      console.error("failed to take ownership of media frame");
    }
  }
});
