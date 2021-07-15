import "./utils/theme";
import "./utils/configs";

console.log(`Hubs version: ${process.env.BUILD_VERSION || "?"}`);

import "./react-components/styles/global.scss";
import "./assets/stylesheets/scene.scss";

import "aframe";
import "./utils/logging";
import "./utils/threejs-world-update";
import { patchWebGLRenderingContext } from "./utils/webgl";
patchWebGLRenderingContext();

// It seems we need to use require to import modules
// under the three/examples/js to avoid tree shaking
// in webpack production mode.
require("three/examples/js/loaders/GLTFLoader");

import "./components/scene-components";
import "./components/debug";
import "./systems/nav";

import { connectToReticulum, fetchReticulumAuthenticated } from "./utils/phoenix-utils";

import ReactDOM from "react-dom";
import React from "react";
import jwtDecode from "jwt-decode";
import SceneUI from "./react-components/scene-ui";
import { disableiOSZoom } from "./utils/disable-ios-zoom";

import "./systems/scene-systems";
import "./gltf-component-mappings";

import { App } from "./App";

window.APP = new App();

const qs = new URLSearchParams(location.search);

import "./components/event-repeater";

import registerTelemetry from "./telemetry";
import { WrappedIntlProvider } from "./react-components/wrapped-intl-provider";
import { ThemeProvider } from "./react-components/styles/theme";

disableiOSZoom();

function mountUI(scene, props = {}) {
  ReactDOM.render(
    <WrappedIntlProvider>
      <ThemeProvider store={window.APP.store}>
        <SceneUI
          {...{
            scene,
            ...props
          }}
        />
      </ThemeProvider>
    </WrappedIntlProvider>,
    document.getElementById("ui-root")
  );
}

const onReady = async () => {
  const scene = document.querySelector("a-scene");
  window.APP.scene = scene;

  const sceneId = qs.get("scene_id") || document.location.pathname.substring(1).split("/")[1];
  console.log(`Scene ID: ${sceneId}`);

  let uiProps = { sceneId: sceneId };

  mountUI(scene);

  const remountUI = props => {
    uiProps = { ...uiProps, ...props };
    mountUI(scene, uiProps);
  };

  const sceneRoot = document.querySelector("#scene-root");
  const sceneModelEntity = document.createElement("a-entity");
  const gltfEl = document.createElement("a-entity");
  const camera = document.getElementById("camera");

  connectToReticulum().then(socket => {
    const joinParams = { hub_id: "scene" };

    if (window.APP.store.state.credentials && window.APP.store.state.credentials.token) {
      joinParams.token = window.APP.store.state.credentials.token;
    }

    const retPhxChannel = socket.channel("ret", joinParams);

    retPhxChannel.join().receive("ok", () => {
      retPhxChannel.push("refresh_perms_token").receive("ok", ({ perms_token }) => {
        const perms = jwtDecode(perms_token);
        remountUI({ showCreateRoom: !!perms.create_hub });

        retPhxChannel.leave();
        socket.disconnect();
      });
    });
  });

  sceneModelEntity.addEventListener("environment-scene-loaded", () => {
    remountUI({ sceneLoaded: true });
    const previewCamera = gltfEl.object3D.getObjectByName("scene-preview-camera");

    if (previewCamera) {
      camera.object3D.position.copy(previewCamera.position);
      camera.object3D.rotation.copy(previewCamera.rotation);
      camera.object3D.matrixNeedsUpdate = true;
    }

    camera.setAttribute("scene-preview-camera", "");
  });

  const res = await fetchReticulumAuthenticated(`/api/v1/scenes/${sceneId}`);
  const sceneInfo = res.scenes[0];

  // Delisted/Removed
  if (!sceneInfo) {
    remountUI({ unavailable: true });
    return;
  }

  if (sceneInfo.allow_promotion) {
    registerTelemetry(`/scene/${sceneId}`, `Hubs Scene: ${sceneInfo.title}`);
  } else {
    registerTelemetry("/scene", "Hubs Non-Promotable Scene Page");
  }

  const modelUrl = sceneInfo.model_url;
  console.log(`Scene Model URL: ${modelUrl}`);

  gltfEl.setAttribute("gltf-model-plus", { src: modelUrl, useCache: false, inflate: true });
  gltfEl.addEventListener("model-loaded", ({ detail: { model } }) =>
    sceneModelEntity.emit("environment-scene-loaded", model)
  );
  sceneModelEntity.appendChild(gltfEl);
  sceneRoot.appendChild(sceneModelEntity);

  const parentScene =
    sceneInfo.parent_scene_id &&
    (await fetchReticulumAuthenticated(`/api/v1/scenes/${sceneInfo.parent_scene_id}`)).scenes[0];

  remountUI({
    sceneName: sceneInfo.name,
    sceneDescription: sceneInfo.description,
    sceneAttributions: sceneInfo.attributions,
    sceneScreenshotURL: sceneInfo.screenshot_url,
    sceneId: sceneInfo.scene_id,
    sceneProjectId: sceneInfo.project_id,
    sceneAllowRemixing: sceneInfo.allow_remixing,
    isOwner: sceneInfo.account_id && sceneInfo.account_id === window.APP.store.credentialsAccountId,
    parentScene: parentScene
  });
};

document.addEventListener("DOMContentLoaded", onReady);
