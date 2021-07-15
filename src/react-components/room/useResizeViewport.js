import { useState, useEffect } from "react";
// ResizeObserver not currently supported in Firefox Android
import ResizeObserver from "resize-observer-polyfill";

const DEFAULT_MAX_RESOLUTION = 1920;

// Modified from AFrame
function getRenderResolution(canvasRect, maxResolution, isVR) {
  const pixelRatio = window.devicePixelRatio;

  if (!maxResolution || isVR || (maxResolution.width === -1 && maxResolution.height === -1)) {
    return canvasRect;
  }

  if (canvasRect.width * pixelRatio < maxResolution.width && canvasRect.height * pixelRatio < maxResolution.height) {
    return canvasRect;
  }

  const aspectRatio = canvasRect.width / canvasRect.height;

  if (canvasRect.width * pixelRatio > maxResolution.width && maxResolution.width !== -1) {
    return {
      width: Math.round(maxResolution.width / pixelRatio),
      height: Math.round(maxResolution.width / aspectRatio / pixelRatio)
    };
  }

  if (canvasRect.height * pixelRatio > maxResolution.height && maxResolution.height !== -1) {
    return {
      height: Math.round(maxResolution.height / pixelRatio),
      width: Math.round((maxResolution.height * aspectRatio) / pixelRatio)
    };
  }

  return canvasRect;
}

export function useResizeViewport(viewportRef, store, scene) {
  const [maxResolution, setMaxResolution] = useState({
    width: DEFAULT_MAX_RESOLUTION,
    height: DEFAULT_MAX_RESOLUTION
  });

  useEffect(
    () => {
      function onStoreChanged() {
        const { maxResolutionWidth, maxResolutionHeight } = store.state.preferences;

        setMaxResolution({
          width: maxResolutionWidth === undefined ? DEFAULT_MAX_RESOLUTION : maxResolutionWidth,
          height: maxResolutionHeight === undefined ? DEFAULT_MAX_RESOLUTION : maxResolutionHeight
        });
      }

      onStoreChanged();

      store.addEventListener("statechanged", onStoreChanged);

      return () => {
        store.removeEventListener("statechanged", onStoreChanged);
      };
    },
    [store]
  );

  useEffect(
    () => {
      const observer = new ResizeObserver(entries => {
        const isPresenting = scene.renderer.xr.isPresenting;
        const isVRPresenting = scene.renderer.xr.enabled && isPresenting;

        // Do not update renderer, if a camera or a canvas have not been injected.
        // In VR mode, three handles canvas resize based on the dimensions returned by
        // the getEyeParameters function of the WebVR API. These dimensions are independent of
        // the window size, therefore should not be overwritten with the window's width and
        // height, // except when in fullscreen mode.
        if (!scene.camera || !scene.canvas || (scene.is("vr-mode") && (scene.isMobile || isVRPresenting))) {
          return;
        }

        const canvasRect = entries[0].contentRect;

        const resolution = getRenderResolution(canvasRect, maxResolution, isVRPresenting);

        const canvas = scene.canvas;
        canvas.style.width = canvasRect.width + "px";
        canvas.style.height = canvasRect.height + "px";

        scene.renderer.setSize(resolution.width, resolution.height, false);

        scene.camera.aspect = resolution.width / resolution.height;
        scene.camera.updateProjectionMatrix();

        // Resizing the canvas clears it, so render immediately after resize to prevent flicker.
        scene.renderer.render(scene.object3D, scene.camera);

        scene.emit("rendererresize", null, false);
      });

      observer.observe(viewportRef.current);

      return () => {
        observer.disconnect();
      };
    },
    [viewportRef, scene, maxResolution]
  );
}
