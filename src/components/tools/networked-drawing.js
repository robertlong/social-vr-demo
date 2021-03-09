/* global THREE */
/**
 * Networked Drawing
 * Creates procedurally generated 'lines' (or tubes) that are networked.
 * @namespace drawing
 * @component networked-drawing
 */

import SharedBufferGeometryManager from "../../utils/sharedbuffergeometrymanager";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import { convertStandardMaterial } from "../../utils/material-utils";
import { addMedia, addMeshScaleAnimation } from "../../utils/media-utils";
import { ObjectContentOrigins } from "../../object-types";
import { SOUND_PEN_START_DRAW } from "../../systems/sound-effects-system";

const MSG_CONFIRM_CONNECT = 0;
const MSG_BUFFER_DATA = 1;
const MSG_BUFFER_DATA_FULL = 2;

function copyData(fromArray, toArray, fromIndex, toIndex) {
  let i = fromIndex - 1;
  let j = -1;
  while (i + 1 <= toIndex) {
    toArray[++j] = fromArray[++i];
  }
}

AFRAME.registerComponent("networked-drawing", {
  schema: {
    segments: { default: 8 }, //the number of "sides" the procedural tube should have
    defaultRadius: { default: 0.01 }, //the radius of the procedural tube
    maxDrawTimeout: { default: 600000 }, //the maximum time a drawn line will live
    maxLines: { default: 50 }, //how many lines can persist before lines older than minDrawTime are removed
    maxPointsPerLine: { default: 250 } //the max number of points a single line can have
  },

  init() {
    this._receiveData = this._receiveData.bind(this);

    this.networkBuffer = [];

    this.sendNetworkBufferQueue = [];

    this.drawStarted = false;
    this.lineStarted = false;
    this.remoteLineStarted = false;

    this.receivedBufferParts = 0;
    this.bufferIndex = 0;
    this.connectedToOwner = false;
    this.networkBufferInitialized = false;

    const options = {
      vertexColors: THREE.VertexColors
    };

    this.color = new THREE.Color();
    this.radius = this.data.defaultRadius;
    this.segments = this.data.segments;

    let material = new THREE.MeshStandardMaterial(options);

    const quality = window.APP.store.materialQualitySetting;
    material = convertStandardMaterial(material, quality);

    this.sharedBufferGeometryManager = new SharedBufferGeometryManager();
    // NOTE: 20 is approximate for how many floats per point are added.
    // maxLines + 1 because a line can be currently drawing while at maxLines.
    // Multiply by 1/3 (0.333) because 3 floats per vertex (x, y, z).
    const maxBufferSize = Math.round(this.data.maxPointsPerLine * 20 * (this.data.maxLines + 1) * 0.333);
    this.sharedBufferGeometryManager.addSharedBuffer(0, material, maxBufferSize);

    this.lastPoint = new THREE.Vector3();

    this.lastSegments = [];
    this.currentSegments = [];
    for (let x = 0; x < this.segments; x++) {
      this.lastSegments[x] = {
        position: new THREE.Vector3(),
        normal: new THREE.Vector3()
      };
      this.currentSegments[x] = {
        position: new THREE.Vector3(),
        normal: new THREE.Vector3()
      };
    }

    this.sharedBuffer = this.sharedBufferGeometryManager.getSharedBuffer(0);
    this.drawing = this.sharedBuffer.drawing;

    this.el.setObject3D("mesh", this.drawing);

    const environmentMapComponent = this.el.sceneEl.components["environment-map"];
    if (environmentMapComponent) {
      environmentMapComponent.applyEnvironmentMap(this.drawing);
    }

    this.prevIdx = Object.assign({}, this.sharedBuffer.idx);
    this.idx = Object.assign({}, this.sharedBuffer.idx);
    this.vertexCount = 0; //number of vertices added for current line (used for line deletion).
    this.indexCount = 0; //number of indexes added for current line (used for line deletion);
    this.networkBufferCount = 0; //number of items added to networkBuffer for current line (used for line deletion).
    this.currentPointCount = 0; //number of points added for current line (used for maxPointsPerLine).
    this.invalidPointRead = false; //flag flipped if we read a bad point anywhere during this line
    this.lastReadPointCount = 0; //last read point count read off of the network, used for sanity checking
    this.networkBufferHistory = []; //tracks vertexCount and networkBufferCount so that lines can be deleted.

    NAF.connection.onConnect(() => {
      NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
        this.networkedEl = networkedEl;
        this.networkId = NAF.utils.getNetworkId(this.networkedEl);
        this.drawingId = "drawing-" + this.networkId;
        NAF.connection.subscribeToDataChannel(this.drawingId, this._receiveData);
      });
    });
  },

  play() {
    this.el.sceneEl.systems["hubs-systems"].drawingMenuSystem.registerDrawingMenu(this.el);
  },

  remove() {
    NAF.connection.unsubscribeToDataChannel(this.drawingId, this._receiveData);

    this.drawStarted = false;

    this.el.removeObject3D("mesh");

    const drawingManager = this.el.sceneEl.querySelector("#drawing-manager").components["drawing-manager"];
    drawingManager.destroyDrawing(this);

    this.el.sceneEl.systems["hubs-systems"].drawingMenuSystem.unregisterDrawingMenu(this.el);
  },

  tick(t) {
    const connected = NAF.connection.isConnected() && this.networkedEl;
    const isMine = connected && NAF.utils.isMine(this.networkedEl);

    if (!this.connectedToOwner && connected) {
      const owner = NAF.utils.getNetworkOwner(this.networkedEl);
      if (!isMine && NAF.connection.hasActiveDataChannel(owner)) {
        NAF.connection.sendDataGuaranteed(owner, this.drawingId, {
          type: MSG_CONFIRM_CONNECT,
          clientId: NAF.clientId
        });
        this.connectedToOwner = true;
      }
    }

    if (this.networkBuffer.length > 0 && connected) {
      if (!isMine) {
        this._drawFromNetwork();
      } else if (this.bufferIndex < this.networkBuffer.length) {
        this._broadcastDrawing();
      }
    }

    //TODO: handle possibility that a clientId gets stuck in sendNetworkBufferQueue
    //if that client disconnects before this executes and an activeDataChannel is opened.
    if (isMine && this.sendNetworkBufferQueue.length > 0) {
      const connected = [];
      for (let i = 0; i < this.sendNetworkBufferQueue.length; i++) {
        if (NAF.connection.hasActiveDataChannel(this.sendNetworkBufferQueue[i])) {
          connected.push(this.sendNetworkBufferQueue[i]);
        }
      }
      for (let j = 0; j < connected.length; j++) {
        const pos = this.sendNetworkBufferQueue.indexOf(connected[j]);
        this._sendNetworkBuffer(connected[j]);
        this.sendNetworkBufferQueue.splice(pos, 1);
      }
    }

    this._deleteExpiredLines(t);
  },

  cloneMesh(sharedBufferGeometry) {
    const originalGeometry = sharedBufferGeometry.current;
    const idx = sharedBufferGeometry.idx;
    const geometry = new THREE.BufferGeometry();

    const positions = originalGeometry.getAttribute("position").array.subarray(0, idx.position * 3);
    const colors = originalGeometry.getAttribute("color").array.subarray(0, idx.color * 3);
    const normals = originalGeometry.getAttribute("normal").array.subarray(0, idx.normal * 3);
    const indices = originalGeometry.index.array.subarray(0, idx.index);

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: THREE.VertexColors
    });
    return new THREE.Mesh(geometry, material);
  },

  async serializeDrawing() {
    const exporter = new GLTFExporter();

    //mesh needs to be cloned before exporting to get rid of excess geometry information
    const mesh = this.cloneMesh(this.sharedBuffer);

    mesh.userData.gltfExtensions = {
      MOZ_hubs_components: {
        version: 4,
        "networked-drawing-buffer": { buffer: this.networkBuffer }
      }
    };

    const glb = await new Promise(resolve => {
      exporter.parse(mesh, resolve, {
        binary: true,
        includeCustomExtensions: true
      });
    });

    const file = new File([glb], "drawing.glb", {
      type: "model/gltf-binary"
    });

    const { entity } = addMedia(file, "#interactable-media", ObjectContentOrigins.FILE, "drawing", false, false);

    const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    const temp = new THREE.Vector3();

    const attribute = this.sharedBuffer.current.attributes.position;
    for (let i = 0; i < this.sharedBuffer.idx.position; i++) {
      temp.set(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      min.min(temp);
      max.max(temp);
    }

    entity.object3D.position.addVectors(min, max).multiplyScalar(0.5);
    entity.object3D.matrixNeedsUpdate = true;
  },

  deserializeDrawing: (() => {
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const normal = new THREE.Vector3();
    return function(buffer) {
      let head = buffer[0];
      if (head === "-") {
        this._undoDraw();
        buffer.shift();
        head = buffer[0];
      }

      while (head != null && buffer.length >= 11) {
        position.set(buffer[1], buffer[2], buffer[3]);
        direction.set(buffer[4], buffer[5], buffer[6]);
        this.radius = Math.round(direction.length() * 1000) / 1000; //radius is encoded as length of direction vector
        direction.normalize();
        normal.set(buffer[7], buffer[8], buffer[9]);
        this.color.setHex(Math.round(normal.length()) - 1); //color is encoded as length of normal vector
        normal.normalize();

        buffer.splice(0, 10);

        if (!this.drawStarted) {
          this.startDraw(position, direction, normal);
        } else if (buffer[0] !== null) {
          this.draw(position, direction, normal);
        }

        if (buffer[0] === null) {
          this.endDraw(position, direction, normal);
          buffer.shift();
        }
      }
    };
  })(),

  _broadcastDrawing: (() => {
    const copyArray = [];
    return function() {
      copyArray.length = 0;
      copyData(this.networkBuffer, copyArray, this.bufferIndex, this.networkBuffer.length - 1);

      //remove undo's from networkBuffer after they've been sent so that
      //newly joining clients don't get them
      let index = -1;
      while ((index = this.networkBuffer.indexOf("-")) != -1) {
        this.networkBuffer.splice(index, 1);
      }
      this.bufferIndex = this.networkBuffer.length;
      NAF.connection.broadcastDataGuaranteed(this.drawingId, { type: MSG_BUFFER_DATA, buffer: copyArray });
    };
  })(),

  _drawFromNetwork: (() => {
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const normal = new THREE.Vector3();
    return function() {
      let head = this.networkBuffer[0];
      if (head === "-") {
        this._undoDraw();
        this.networkBuffer.shift();
        head = this.networkBuffer[0];
      }
      let didWork = false;
      while (head != null && this.networkBuffer.length >= 11) {
        const pointCount = this.networkBuffer[0];

        // This is a sanity check against the sequence number to help uncover remaining bugs.
        // If the point is out-of-order, report the error and stop drawing this line.
        if (pointCount !== this.lastReadPointCount + 1) {
          this.invalidPointRead = true;

          console.error(
            `Draw networking error: ID ${this.drawingId} expected point ${this.lastReadPointCount +
              1} but received ${pointCount}`
          );
        }

        this.lastReadPointCount = pointCount;
        position.set(this.networkBuffer[1], this.networkBuffer[2], this.networkBuffer[3]);
        direction.set(this.networkBuffer[4], this.networkBuffer[5], this.networkBuffer[6]);
        this.radius = Math.round(direction.length() * 1000) / 1000; //radius is encoded as length of direction vector
        direction.normalize();
        normal.set(this.networkBuffer[7], this.networkBuffer[8], this.networkBuffer[9]);
        this.color.setHex(Math.round(normal.length()) - 1); //color is encoded as length of normal vector
        normal.normalize();

        this.networkBuffer.splice(0, 10);

        if (!this.remoteLineStarted) {
          this.startDraw(position, direction, normal);
          this.remoteLineStarted = true;
        }

        if (this.networkBuffer[0] === null) {
          if (!this.invalidPointRead) {
            this._endDraw(position, direction, normal);
          }

          this.remoteLineStarted = false;
          this.networkBuffer.shift();
          this.lastReadPointCount = 0;
          this.invalidPointRead = false;
        } else {
          if (!this.invalidPointRead) {
            this._draw(position, direction, normal);
            didWork = true;
          }
        }
      }
      if (didWork) this._updateBuffer();
    };
  })(),

  _deleteExpiredLines(time) {
    const length = this.networkBufferHistory.length;
    if (length > 0) {
      const drawTime = this.networkBufferHistory[0].time;
      if (length > this.data.maxLines || drawTime + this.data.maxDrawTimeout <= time) {
        const datum = this.networkBufferHistory[0];
        this.idx.position = datum.vertexCount;
        this.idx.normal = datum.vertexCount;
        this.idx.color = datum.vertexCount;
        this.idx.index = datum.indexCount;
        this.sharedBuffer.remove(this.prevIdx, this.idx);
        this.networkBufferHistory.shift();
        if (this.networkedEl && NAF.utils.isMine(this.networkedEl)) {
          this.networkBuffer.splice(0, datum.networkBufferCount);
          this.bufferIndex -= datum.networkBufferCount;
        }
      }
    }
  },

  _sendNetworkBuffer: (() => {
    const copyArray = [];
    //This number needs to be approx. < ~6000 based on napkin math
    //see: https://github.com/webrtc/adapter/blob/682e0f2439e139da6c0c406370eae820637b8sc1a/src/js/common_shim.js#L157
    const chunkAmount = 3000;
    return function(clientId) {
      if (NAF.utils.isMine(this.networkedEl)) {
        if (this.networkBuffer.length <= chunkAmount) {
          NAF.connection.sendDataGuaranteed(clientId, this.drawingId, {
            type: MSG_BUFFER_DATA_FULL,
            parts: 1,
            buffer: this.networkBuffer
          });
        } else {
          let start = 0;
          let end = 0;
          while (end < this.networkBuffer.length) {
            end = Math.min(end + chunkAmount, this.networkBuffer.length);
            copyArray.length = 0;
            copyData(this.networkBuffer, copyArray, start, end - 1);
            start = end;
            NAF.connection.sendDataGuaranteed(clientId, this.drawingId, {
              type: MSG_BUFFER_DATA_FULL,
              parts: Math.ceil(this.networkBuffer.length / chunkAmount),
              buffer: copyArray
            });
          }
        }
      }
    };
  })(),

  _receiveData(_, dataType, data) {
    switch (data.type) {
      case MSG_CONFIRM_CONNECT:
        this.sendNetworkBufferQueue.push(data.clientId);
        break;
      case MSG_BUFFER_DATA:
        if (this.networkBufferInitialized) {
          this.networkBuffer.push.apply(this.networkBuffer, data.buffer);
        }
        break;
      case MSG_BUFFER_DATA_FULL:
        this.networkBuffer.push.apply(this.networkBuffer, data.buffer);
        if (++this.receivedBufferParts >= data.parts) {
          this.networkBufferInitialized = true;
        }
        break;
    }
  },

  getLastPoint() {
    return this.lastPoint;
  },

  startDraw(position, direction, normal, color, radius) {
    if (!NAF.connection.isConnected()) {
      return;
    }

    this.drawStarted = true;

    if (color) {
      this.color.set(color);
    }
    if (radius) this.radius = radius;

    this.lastPoint.copy(position);
    this._addToNetworkBuffer(position, direction, normal);
  },

  draw(position, direction, normal, color, radius) {
    if (!NAF.connection.isConnected() || !this.drawStarted) {
      return;
    }

    if (color && color != "#" + this.color.getHexString().toUpperCase()) {
      this.color.set(color);
    }
    if (radius) this.radius = radius;

    this._addToNetworkBuffer(position, direction, normal);
    this._draw(position, direction, normal);

    this._updateBuffer();
  },

  _draw: (() => {
    const capNormal = new THREE.Vector3();
    return function(position, direction, normal, radiusMultiplier = 1.0) {
      if (!this.lineStarted) {
        this._generateSegments(this.lastSegments, position, direction, normal, this.radius * radiusMultiplier);

        //get normal for tip of cap
        capNormal.copy(direction).negate();
        //get normals for rim of cap
        for (let i = 0; i < this.segments; i++) {
          this.lastSegments[i].normal.add(capNormal).multiplyScalar(0.5);
        }

        this._drawStartCap(this.lastPoint, this.lastSegments, capNormal);

        this.lineStarted = true;
      } else {
        this._generateSegments(this.currentSegments, position, direction, normal, this.radius * radiusMultiplier);
        this._drawCylinder();

        if (this.currentPointCount > this.data.maxPointsPerLine) {
          this._drawProjectedEndCap(position, direction);
          this._endLine();
        }
      }
      this.lastPoint.copy(position);
    };
  })(),

  undoDraw() {
    if (!NAF.connection.isConnected() || this.drawStarted) {
      return;
    }
    this._undoDraw();
    this._pushToNetworkBuffer("-");
  },

  _undoDraw() {
    const length = this.networkBufferHistory.length;
    if (length > 0) {
      const datum = this.networkBufferHistory.pop();
      this.idx.position = 0;
      this.idx.normal = 0;
      this.idx.color = 0;
      this.idx.index = 0;
      if (length > 1) {
        this.idx.position = this.sharedBuffer.idx.position - datum.vertexCount - 1;
        this.idx.normal = this.sharedBuffer.idx.normal - datum.vertexCount - 1;
        this.idx.color = this.sharedBuffer.idx.color - datum.vertexCount - 1;
        this.idx.index = this.sharedBuffer.idx.index - datum.indexCount - 1;
      }
      this.sharedBuffer.remove(this.idx, this.sharedBuffer.idx);
      if (this.networkedEl && NAF.utils.isMine(this.networkedEl)) {
        this.networkBuffer.splice(this.networkBuffer.length - datum.networkBufferCount, datum.networkBufferCount);
        this.bufferIndex -= datum.networkBufferCount;
      }
    }
  },

  endDraw(position, direction, normal) {
    this._endDraw(position, direction, normal);
    this._updateBuffer();
  },

  _endDraw(position, direction, normal) {
    if (!this.lineStarted && this.drawStarted) {
      this._drawPoint(position);
    } else if (this.lineStarted && this.drawStarted) {
      this._addToNetworkBuffer(position, direction, normal);
      this._draw(position, direction, normal);
      this._drawProjectedEndCap(position, direction);
    }
    this._endLine();
  },

  _drawProjectedEndCap: (() => {
    const projectedDirection = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();
    return function(position, direction) {
      if (this.lineStarted && this.drawStarted) {
        projectedDirection.copy(direction).multiplyScalar(this.radius);
        projectedPoint.copy(position).add(projectedDirection);
        this._drawEndCap(projectedPoint, direction);
      }
    };
  })(),

  _endLine() {
    if (!this.drawStarted) return;

    if (this.networkedEl && NAF.utils.isMine(this.networkedEl)) this._pushToNetworkBuffer(null);

    const datum = {
      networkBufferCount: this.networkBufferCount,
      vertexCount: this.vertexCount - 1,
      indexCount: this.indexCount - 1,
      time: this.el.sceneEl.clock.elapsedTime * 1000
    };
    this.networkBufferHistory.push(datum);
    this.vertexCount = 0;
    this.indexCount = 0;
    this.networkBufferCount = 0;
    this.currentPointCount = 0;
    this.lineStarted = false;
    this.drawStarted = false;

    this.sharedBuffer.computeBoundingSpheres();
  },

  _addToNetworkBuffer: (() => {
    const copyDirection = new THREE.Vector3();
    const copyNormal = new THREE.Vector3();
    return function(position, direction, normal) {
      if (this.networkedEl && NAF.utils.isMine(this.networkedEl)) {
        ++this.currentPointCount;
        this._pushToNetworkBuffer(this.currentPointCount);
        this._pushToNetworkBuffer(position.x);
        this._pushToNetworkBuffer(position.y);
        this._pushToNetworkBuffer(position.z);
        copyDirection.copy(direction);
        copyDirection.setLength(this.radius); //encode radius as length of direction vector
        this._pushToNetworkBuffer(copyDirection.x);
        this._pushToNetworkBuffer(copyDirection.y);
        this._pushToNetworkBuffer(copyDirection.z);
        copyNormal.copy(normal);
        copyNormal.setLength(this.color.getHex() + 1); //encode color as length, add one in case color is black
        this._pushToNetworkBuffer(copyNormal.x);
        this._pushToNetworkBuffer(copyNormal.y);
        this._pushToNetworkBuffer(copyNormal.z);
      }
    };
  })(),

  _pushToNetworkBuffer(val) {
    //don't increment networkBufferCount if undo, because the undo character
    //will be removed in tick() on the next frame
    if (val !== "-") {
      ++this.networkBufferCount;
    }
    this.networkBuffer.push(val);
  },

  //draw a cylinder from last to current segments
  _drawCylinder() {
    //average the normals with the normals from the lastSegment
    //not a perfect normal calculation, but works well enough
    for (let i = 0; i < this.segments; i++) {
      this.currentSegments[i].normal.add(this.lastSegments[i].normal).multiplyScalar(0.5);
    }

    for (let i = 0; i < this.segments; i++) {
      this._addVertex(this.currentSegments[i]);
    }

    const bufferVertexCount = this.sharedBuffer.idx.position;

    for (let i = 0; i < this.segments; i++) {
      const a = bufferVertexCount - (this.segments + (this.segments - i));
      const b = i + 1 < this.segments ? a + 1 : bufferVertexCount - 2 * this.segments;
      const c = bufferVertexCount - (this.segments - i);
      const d = i + 1 < this.segments ? c + 1 : bufferVertexCount - this.segments;

      this._addIndex(c, a, b);
      this._addIndex(c, b, d);
    }

    for (let i = 0; i < this.segments; i++) {
      this.lastSegments[i].position.copy(this.currentSegments[i].position);
      this.lastSegments[i].normal.copy(this.currentSegments[i].normal);
    }
  },

  //draw a standalone point in space
  _drawPoint: (() => {
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const left = new THREE.Vector3(1, 0, 0);
    const projectedDirection = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();
    return function(position) {
      projectedDirection.copy(up).multiplyScalar(this.radius * 0.75);
      projectedPoint.copy(position).add(projectedDirection);
      this.lastPoint.copy(projectedPoint);

      projectedDirection.copy(up).multiplyScalar(this.radius * 0.5);
      projectedPoint.copy(position).add(projectedDirection);
      this._draw(projectedPoint, down, left, 0.75);

      this._draw(position, down, left);

      projectedDirection.copy(down).multiplyScalar(this.radius * 0.5);
      projectedPoint.copy(position).add(projectedDirection);
      this._draw(projectedPoint, down, left, 0.75);

      projectedDirection.copy(down).multiplyScalar(this.radius * 0.75);
      projectedPoint.copy(position).add(projectedDirection);

      this._drawEndCap(projectedPoint, down);
    };
  })(),

  _drawStartCap(point, segments, normal) {
    this._addVertex({ position: point, normal: normal });

    for (let i = 0; i < this.segments; i++) {
      this._addVertex(segments[i]);
    }

    const bufferVertexCount = this.sharedBuffer.idx.position;
    const a = bufferVertexCount - this.segments - 1;
    for (let i = 0; i < this.segments; i++) {
      const b = bufferVertexCount - (this.segments - i);
      const c = i + 1 < this.segments ? b + 1 : bufferVertexCount - this.segments;
      this._addIndex(a, c, b);
    }
  },

  _drawEndCap(point, normal) {
    this._addVertex({ position: point, normal: normal });

    const bufferVertexCount = this.sharedBuffer.idx.position;
    const a = bufferVertexCount - 1;
    for (let i = 0; i < this.segments; i++) {
      const b = bufferVertexCount - (this.segments - i) - 1;
      const c = i + 1 < this.segments ? b + 1 : bufferVertexCount - this.segments - 1;
      this._addIndex(a, b, c);
    }
  },

  _updateBuffer() {
    this.sharedBuffer.update();
  },

  _addVertex(segment) {
    const point = segment.position;
    const normal = segment.normal;
    this.sharedBuffer.addVertex(point.x, point.y, point.z);
    this.sharedBuffer.addColor(this.color.r, this.color.g, this.color.b);

    if (normal) {
      this.sharedBuffer.addNormal(normal.x, normal.y, normal.z);
    } else {
      ++this.sharedBuffer.idx.normal;
    }

    ++this.vertexCount;
  },

  _addIndex(a, b, c) {
    this.sharedBuffer.addIndex(a, b, c);
    this.indexCount += 3;
  },

  //calculate the segments for a given point
  _generateSegments(segmentsList, point, forward, up, radius) {
    const angleIncrement = (Math.PI * 2) / this.segments;
    for (let i = 0; i < this.segments; i++) {
      const segment = segmentsList[i].position;
      this._rotatePointAroundAxis(segment, point, forward, up, angleIncrement * i, radius);
      segmentsList[i].normal.subVectors(segment, point).normalize();
    }
  },

  _rotatePointAroundAxis: (() => {
    const calculatedDirection = new THREE.Vector3();
    return function(out, point, axis, up, angle, radius) {
      calculatedDirection.copy(up);
      calculatedDirection.applyAxisAngle(axis, angle);
      out.copy(point).add(calculatedDirection.normalize().multiplyScalar(radius));
    };
  })()
});

AFRAME.registerComponent("networked-drawing-buffer", {
  schema: {
    buffer: { default: [] }
  },

  play() {
    const button = this._getDeserializeButton(this.el.parentEl);
    if (button) {
      button.object3D.visible = true;
      button.components["deserialize-drawing-button"].networkedDrawingBuffer = this;
    }
  },

  _getDeserializeButton(entity) {
    if (entity.classList.contains("interactable")) {
      return entity.querySelector(".deserialize-drawing");
    } else if (entity.parentEl) {
      return this._getDeserializeButton(entity.parentEl);
    } else {
      return null;
    }
  }
});

AFRAME.registerComponent("deserialize-drawing-button", {
  init() {
    const drawingManager = this.el.sceneEl.querySelector("#drawing-manager").components["drawing-manager"];
    this.networkedDrawingBuffer = null;

    this.onClick = () => {
      if (!NAF.utils.isMine(this.targetEl) && !NAF.utils.takeOwnership(this.targetEl)) return;

      const finishDrawing = () => {
        drawingManager.drawing.deserializeDrawing(this.networkedDrawingBuffer.data.buffer);
        addMeshScaleAnimation(drawingManager.drawing.el.object3DMap.mesh, { x: 0.001, y: 0.001, z: 0.001 });

        if (this.targetEl.components.pinnable && this.targetEl.components.pinnable.data.pinned) {
          this.targetEl.setAttribute("pinnable", "pinned", false);
        }
        this.targetEl.parentEl.removeChild(this.targetEl);
        this.el.sceneEl.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_PEN_START_DRAW);
      };

      //serialize any existing drawing and clear the drawing.
      if (drawingManager.drawing) {
        drawingManager.drawing.serializeDrawing().then(() => {
          drawingManager.drawing.el.parentEl.removeChild(drawingManager.drawing.el);
          drawingManager.destroyDrawing(drawingManager.drawing);

          drawingManager.createDrawing().then(finishDrawing);
        });
      } else {
        drawingManager.createDrawing().then(finishDrawing);
      }
    };

    this._updateUI = this._updateUI.bind(this);
    this._updateUIOnStateChange = this._updateUIOnStateChange.bind(this);
    this.el.sceneEl.addEventListener("stateadded", this._updateUIOnStateChange);
    this.el.sceneEl.addEventListener("stateremoved", this._updateUIOnStateChange);

    NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
      this.targetEl = networkedEl;
      this._updateUI();
      this.targetEl.addEventListener("pinned", this._updateUI);
      this.targetEl.addEventListener("unpinned", this._updateUI);
    });
  },

  play() {
    this.el.object3D.addEventListener("interact", this.onClick);
  },

  pause() {
    this.el.object3D.removeEventListener("interact", this.onClick);
  },

  remove() {
    this.el.sceneEl.removeEventListener("stateadded", this._updateUIOnStateChange);
    this.el.sceneEl.removeEventListener("stateremoved", this._updateUIOnStateChange);

    if (this.targetEl) {
      this.targetEl.removeEventListener("pinned", this._updateUI);
      this.targetEl.removeEventListener("unpinned", this._updateUI);
    }
  },

  _updateUIOnStateChange(e) {
    if (e.detail !== "frozen") return;
    this._updateUI();
  },

  _updateUI() {
    if (this.networkedDrawingBuffer) {
      const isPinned = this.targetEl.components.pinnable && this.targetEl.components.pinnable.data.pinned;
      const canPin = window.APP.hubChannel.can("pin_objects") && window.APP.hubChannel.signedIn;
      this.el.object3D.visible = (!isPinned || canPin) && window.APP.hubChannel.can("spawn_drawing");
    } else {
      this.el.object3D.visible = false;
    }
  }
});
