import {paths} from "../paths";

import {Hands, HAND_CONNECTIONS} from "@mediapipe/hands";
import {Camera} from "@mediapipe/camera_utils/camera_utils";
import {drawConnectors, drawLandmarks} from "@mediapipe/drawing_utils/drawing_utils";

const WEBCAM_WIDTH = 1280;
const WEBCAM_HEIGHT = 780;
const WEBCAM_ASPECT = WEBCAM_WIDTH / WEBCAM_HEIGHT;

export class GestureTracking {
  constructor() {
    this.lastEffectiveResults = null;
    this.hands = new Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    this.hands.setOptions({
      maxNumHands: 2,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });
    this.hands.onResults(results => {
      if (results.multiHandLandmarks) {
        this.lastEffectiveResults = results;
      }
      draw(results);
    });

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = WEBCAM_WIDTH / 4;
    outputCanvas.height = WEBCAM_HEIGHT / 4;
    outputCanvas.style.position = 'absolute';
    outputCanvas.style.right = 0;
    outputCanvas.style.top = 0;
    document.body.appendChild(outputCanvas);

    const canvasCtx = outputCanvas.getContext('2d');

    const draw = (results) => {
      canvasCtx.save()
      canvasCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height)
      canvasCtx.drawImage(results.image, 0, 0, outputCanvas.width, outputCanvas.height)
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 1});
          drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});
        }
      }
      canvasCtx.restore()
    };

    const videoElement = document.createElement('video');
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await this.hands.send({image: videoElement});
      },
      width: WEBCAM_WIDTH,
      height: WEBCAM_HEIGHT
    });
    camera.start();
  }

  write(frame) {
    if (!frame.get(paths.actions.rightHand.matrix)) {
      frame.setMatrix4(paths.actions.rightHand.matrix, new THREE.Matrix4());
    }
    if (!frame.get(paths.actions.leftHand.matrix)) {
      frame.setMatrix4(paths.actions.leftHand.matrix, new THREE.Matrix4());
    }

    if (this.lastEffectiveResults) {
      const results = this.lastEffectiveResults;
      const multiHandLandmarks = results.multiHandLandmarks;
      const multiHandedness = results.multiHandedness;

      for (const handedness of multiHandedness) {
        // It seems that handedness.index sometimes can be 1 while
        // multiHandLandmarks.length is 1 (MediaPipe bug?).
        // In that case changing the index to 0 as workaround.
        if (handedness.index === 1 && multiHandLandmarks.length === 1) {
          handedness.index = 0;
        }

        const landmarks = multiHandLandmarks[handedness.index];
        if (landmarks === undefined) {
          continue;
        }
        const isRight = handedness.label === 'Right';
        const path = isRight ? paths.actions.rightHand.matrix : paths.actions.leftHand.matrix;
        const p = new THREE.Vector3((landmarks[0].x - 0.5) * WEBCAM_ASPECT, (0.5 - landmarks[0].y) + 1.65, -0.3);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2 * (isRight ? 1: -1)));
        const s = new THREE.Vector3(1, 1, 1);
        const matrix = new THREE.Matrix4().compose(p, q, s);
        frame.setMatrix4(path, matrix);
      }
    }
  }
}
