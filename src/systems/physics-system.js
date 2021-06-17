import { AmmoWorker, WorkerHelpers, CONSTANTS } from "three-ammo";
import { AmmoDebugConstants, DefaultBufferSize } from "ammo-debug-drawer";
import configs from "../utils/configs";
import * as ammoWasmUrl from "ammo.js/builds/ammo.wasm.wasm";

const MESSAGE_TYPES = CONSTANTS.MESSAGE_TYPES,
  TYPE = CONSTANTS.TYPE,
  BUFFER_CONFIG = CONSTANTS.BUFFER_CONFIG;

const WORLD_CONFIG = {
  debugDrawMode: AmmoDebugConstants.DrawWireframe,
  gravity: { x: 0, y: -9.8, z: 0 }
};

const MAX_BODIES = 512;

export class PhysicsSystem {
  constructor(scene) {
    this.ammoWorker = new AmmoWorker();
    this.workerHelpers = new WorkerHelpers(this.ammoWorker);

    this.bodyHelpers = [];
    this.shapeHelpers = [];
    this.bodyUuids = [];
    this.indexToUuid = {};
    this.bodyUuidToData = new Map();

    this.debugRequested = false;
    this.debugEnabled = false;
    this.scene = scene;
    this.stepDuration = 0;

    this.ready = false;
    this.nextBodyUuid = 0;
    this.nextShapeUuid = 0;

    const arrayBuffer = new ArrayBuffer(4 * BUFFER_CONFIG.BODY_DATA_SIZE * MAX_BODIES);
    this.objectMatricesFloatArray = new Float32Array(arrayBuffer);
    this.objectMatricesIntArray = new Int32Array(arrayBuffer);

    this.ammoWorker.postMessage(
      {
        type: MESSAGE_TYPES.INIT,
        worldConfig: WORLD_CONFIG,
        arrayBuffer,
        maxBodies: MAX_BODIES,
        wasmUrl: new URL(ammoWasmUrl, configs.BASE_ASSETS_PATH || window.location).href
      },
      [arrayBuffer]
    );

    this.ammoWorker.onmessage = async event => {
      if (event.data.type === MESSAGE_TYPES.READY) {
        this.ready = true;
        for (const bodyHelper of this.bodyHelpers) {
          if (bodyHelper.alive) bodyHelper.init2();
        }
        for (const shapeHelper of this.shapeHelpers) {
          if (shapeHelper.alive) shapeHelper.init2();
        }
        this.shapeHelpers.length = 0;
        this.bodyHelpers.length = 0;
      } else if (event.data.type === MESSAGE_TYPES.BODY_READY) {
        const uuid = event.data.uuid;
        const index = event.data.index;
        if (this.bodyUuidToData.has(uuid)) {
          this.bodyUuids.push(uuid);
          this.bodyUuidToData.get(uuid).index = index;
          this.indexToUuid[index] = uuid;
        } else {
          console.warn(`Body initialized for uuid: ${uuid} but body missing.`);
        }
      } else if (event.data.type === MESSAGE_TYPES.SHAPES_READY) {
        const bodyUuid = event.data.bodyUuid;
        const shapesUuid = event.data.shapesUuid;
        if (this.bodyUuidToData.has(bodyUuid)) {
          this.bodyUuidToData.get(bodyUuid).shapes.push(shapesUuid);
        } else {
          console.warn(`Shape initialized but body with uuid: ${bodyUuid} missing.`);
        }
      } else if (event.data.type === MESSAGE_TYPES.TRANSFER_DATA) {
        this.objectMatricesFloatArray = event.data.objectMatricesFloatArray;
        this.objectMatricesIntArray = new Int32Array(this.objectMatricesFloatArray.buffer);
        this.stepDuration = event.data.stepDuration;
      }
    };
  }

  setDebug(debug) {
    this.debugRequested = debug;
  }

  enableDebug() {
    if (!window.SharedArrayBuffer) {
      console.warn("Physics debug rendering only available in browsers that support SharedArrayBuffers.");
      this.debugRequested = false;
      return;
    }

    this.debugEnabled = true;

    if (!this.debugMesh) {
      this.debugSharedArrayBuffer = new window.SharedArrayBuffer(4 + 2 * DefaultBufferSize * 4);
      this.debugIndex = new Uint32Array(this.debugSharedArrayBuffer, 0, 4);
      const debugVertices = new Float32Array(this.debugSharedArrayBuffer, 4, DefaultBufferSize);
      const debugColors = new Float32Array(this.debugSharedArrayBuffer, 4 + DefaultBufferSize, DefaultBufferSize);
      this.debugGeometry = new THREE.BufferGeometry();
      this.debugGeometry.addAttribute("position", new THREE.BufferAttribute(debugVertices, 3));
      this.debugGeometry.addAttribute("color", new THREE.BufferAttribute(debugColors, 3));
      const debugMaterial = new THREE.LineBasicMaterial({
        vertexColors: THREE.VertexColors,
        depthTest: true
      });
      this.debugMesh = new THREE.LineSegments(this.debugGeometry, debugMaterial);
      this.debugMesh.frustumCulled = false;
      this.debugMesh.renderOrder = 999;
    }

    if (!this.debugMesh.parent) {
      this.scene.add(this.debugMesh);
      this.workerHelpers.enableDebug(true, this.debugSharedArrayBuffer);
    }
  }

  disableDebug() {
    this.debugEnabled = false;
    if (this.debugMesh) {
      this.scene.remove(this.debugMesh);
      this.workerHelpers.enableDebug(false);
    }
  }

  tick = (() => {
    const transform = new THREE.Matrix4();
    const inverse = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    return function() {
      if (this.ready) {
        if (this.debugRequested !== this.debugEnabled) {
          if (this.debugRequested) {
            this.enableDebug();
          } else {
            this.disableDebug();
          }
        }

        /** Buffer Schema
         * Every physics body has 26 * 4 bytes (64bit float/int) assigned in the buffer
         * 0-15   Matrix4 elements (floats)
         * 16     Linear Velocity (float)
         * 17     Angular Velocity (float)
         * 18-25  first 8 Collisions (ints)
         */

        if (this.objectMatricesFloatArray.buffer.byteLength !== 0) {
          for (let i = 0; i < this.bodyUuids.length; i++) {
            const uuid = this.bodyUuids[i];
            const body = this.bodyUuidToData.get(uuid);
            const index = body.index;
            const type = body.options.type ? body.options.type : TYPE.DYNAMIC;
            const object3D = body.object3D;
            if (type === TYPE.DYNAMIC) {
              matrix.fromArray(
                this.objectMatricesFloatArray,
                index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.MATRIX_OFFSET
              );
              object3D.parent.updateMatrices();
              inverse.copy(object3D.parent.matrixWorld).invert();
              transform.multiplyMatrices(inverse, matrix);
              transform.decompose(object3D.position, object3D.quaternion, scale);
              object3D.matrixNeedsUpdate = true;
            }

            object3D.updateMatrices();
            this.objectMatricesFloatArray.set(
              object3D.matrixWorld.elements,
              index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.MATRIX_OFFSET
            );

            body.linearVelocity = this.objectMatricesFloatArray[
              index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.LINEAR_VELOCITY_OFFSET
            ];

            body.angularVelocity = this.objectMatricesFloatArray[
              index * BUFFER_CONFIG.BODY_DATA_SIZE + BUFFER_CONFIG.ANGULAR_VELOCITY_OFFSET
            ];

            body.collisions.length = 0;

            for (let j = BUFFER_CONFIG.COLLISIONS_OFFSET; j < BUFFER_CONFIG.BODY_DATA_SIZE; j++) {
              const collidingIndex = this.objectMatricesIntArray[index * BUFFER_CONFIG.BODY_DATA_SIZE + j];
              if (collidingIndex !== -1) {
                body.collisions.push(this.indexToUuid[collidingIndex]);
              }
            }
          }

          this.ammoWorker.postMessage(
            { type: MESSAGE_TYPES.TRANSFER_DATA, objectMatricesFloatArray: this.objectMatricesFloatArray },
            [this.objectMatricesFloatArray.buffer]
          );
        }

        /* DEBUG RENDERING */
        if (this.debugEnabled) {
          const index = window.Atomics.load(this.debugIndex, 0);
          if (index !== 0) {
            this.debugGeometry.attributes.position.needsUpdate = true;
            this.debugGeometry.attributes.color.needsUpdate = true;
          }
          this.debugGeometry.setDrawRange(0, index);
          window.Atomics.store(this.debugIndex, 0, 0);
        }
      }
    };
  })();

  addBody(object3D, options) {
    this.workerHelpers.addBody(this.nextBodyUuid, object3D, options);

    this.bodyUuidToData.set(this.nextBodyUuid, {
      object3D: object3D,
      options: options,
      collisions: [],
      linearVelocity: 0,
      angularVelocity: 0,
      index: -1,
      shapes: []
    });

    return this.nextBodyUuid++;
  }

  updateBody(uuid, options) {
    if (this.bodyUuidToData.has(uuid)) {
      this.bodyUuidToData.get(uuid).options = options;
      this.workerHelpers.updateBody(uuid, options);
    } else {
      console.warn(`updateBody called for uuid: ${uuid} but body missing.`);
    }
  }

  removeBody(uuid) {
    const idx = this.bodyUuids.indexOf(uuid);
    if (this.bodyUuidToData.has(uuid) && idx !== -1) {
      delete this.indexToUuid[this.bodyUuidToData.get(uuid).index];
      this.bodyUuidToData.delete(uuid);
      this.bodyUuids.splice(idx, 1);
      this.workerHelpers.removeBody(uuid);
    } else {
      console.warn(`removeBody called for uuid: ${uuid} but body missing.`);
    }
  }

  addShapes(bodyUuid, mesh, options) {
    if (mesh) {
      const scale = new THREE.Vector3();
      mesh.updateMatrices();
      scale.setFromMatrixScale(mesh.matrixWorld);
    }
    this.workerHelpers.addShapes(bodyUuid, this.nextShapeUuid, mesh, options);
    this.bodyUuidToData.get(bodyUuid).shapes.push(this.nextShapeUuid);
    return this.nextShapeUuid++;
  }

  removeShapes(bodyUuid, shapesUuid) {
    if (this.bodyUuidToData.has(bodyUuid)) {
      this.workerHelpers.removeShapes(bodyUuid, shapesUuid);
      const idx = this.bodyUuidToData.get(bodyUuid).shapes.indexOf(shapesUuid);
      if (idx !== -1) {
        this.bodyUuidToData.get(bodyUuid).shapes.splice(idx, 1);
      } else {
        console.warn(`removeShapes called for shapesUuid: ${shapesUuid} on bodyUuid: ${bodyUuid} but shapes missing.`);
      }
    }
  }

  addConstraint(constraintId, bodyUuid, targetUuid, options) {
    this.workerHelpers.addConstraint(constraintId, bodyUuid, targetUuid, options);
  }

  removeConstraint(constraintId) {
    this.workerHelpers.removeConstraint(constraintId);
  }

  registerBodyHelper(bodyHelper) {
    if (this.ready) {
      bodyHelper.init2();
    } else {
      this.bodyHelpers.push(bodyHelper);
    }
  }

  registerShapeHelper(shapeHelper) {
    if (this.ready) {
      shapeHelper.init2();
    } else {
      this.shapeHelpers.push(shapeHelper);
    }
  }

  bodyInitialized(uuid) {
    return this.bodyUuidToData.has(uuid) && this.bodyUuidToData.get(uuid).index !== -1;
  }

  getLinearVelocity(uuid) {
    return this.bodyUuidToData.get(uuid).linearVelocity;
  }

  getAngularVelocity(uuid) {
    return this.bodyUuidToData.get(uuid).angularVelocity;
  }

  getCollisions(uuid) {
    return this.bodyUuidToData.get(uuid).collisions;
  }

  resetDynamicBody(uuid) {
    this.workerHelpers.resetDynamicBody(uuid);
  }

  activateBody(uuid) {
    this.workerHelpers.activateBody(uuid);
  }
}
