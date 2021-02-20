# Creating New Networked Interactables

We often get asked how you can create new interactable objects in Hubs. This guide is a tutorial on how to do that. I'm going to be working on a new iframe object that you can spawn in the world, move around, and change the web page. For the sake of this tutorial I'll be focusing on the basics that you need to create your own interactable.

## Step 1: Add a New Button to the Place Menu

You need to be able to spawn the object in Hubs, so we'll need to add a button to the UI that spawns the object in front of you.

To add a button, we'll add the following item to the `nextItems` array in [PlacePopoverContainer.js](/src/react-components/room/PlacePopoverContainer.js):
```js
{
  id: "iframe",
  icon: BrowserIcon,
  color: "orange",
  label: <FormattedMessage id="place-popover.item-type.iframe" defaultMessage="Web Page" />,
  onSelect: () => scene.emit("spawn-iframe")
}
```

When we click the button, a `spawn-iframe` event will be emitted on the scene. We can listen for this event in systems/components. 

The end result should look something like this:
```js
export function PlacePopoverContainer({ scene, mediaSearchStore, showNonHistoriedDialog, hubChannel }) {
  const [items, setItems] = useState([]);

  useEffect(
    () => {
      function updateItems() {
        // ...

        let nextItems = [
          // ...
        ];

        if (hubChannel.can("spawn_and_move_media")) {
          nextItems = [
            ...nextItems,
            // ...
            {
              id: "iframe",
              icon: BrowserIcon,
              color: "orange",
              label: <FormattedMessage id="place-popover.item-type.iframe" defaultMessage="Web Page" />,
              onSelect: () => scene.emit("spawn-iframe")
            },
            // ...
          ];
        }

        setItems(nextItems);
      }

      hubChannel.addEventListener("permissions_updated", updateItems);

      updateItems();

      // ...

      return () => {
        hubChannel.removeEventListener("permissions_updated", updateItems);
        // ...
      };
    },
    [hubChannel, mediaSearchStore, showNonHistoriedDialog, scene]
  );

  return <PlacePopoverButton items={items} />;
}
```

Note that we only add the button ony if the user can spawn and move media.

## Step 2: Create and register a system to handle the spawn event

We need to handle the `spawn-iframe` event that we just emitted on the scene. Our recommended way of doing so is to create a Hubs System. This is just a javascript class that is registered in [hubs-systems.js](/src/systems/hubs-systems.js). They contain a `tick()` method which is called in the `hubs-systems` AFrame system in the order you determine. This makes it so that we get a predictable execution order vs AFrame systems which are somewhat hard to predict.

We'll start with creating a new file `iframe-system.js` in `/src/systems/`. We'll create a basic class that just registers an event listener in the constructor and creates a simple red cube entity in the center of the scene.

[iframe-system.js](/src/systems/iframe-system.js)
```js
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("position", "0 1 0");
    entity.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    entity.setAttribute("material", { color: "red" });
    this.scene.appendChild(entity);
  }
}
```

We'll then register it in [hubs-systems.js](/src/systems/hubs-systems.js).
```js
//...
import { IframeSystem } from "./iframe-system";

AFRAME.registerSystem("hubs-systems", {
  init() {
    // ...
    this.iframeSystem = new IframeSystem(this.el);
  }
  //...
});
```

At this point you should be able to click the "Web Page" button and it should spawn a cube in the center of the scene.

## Step 3: Spawn in front of the player

To get the cube to spawn in front of the player we can use the `offset-relative-to` component.

[iframe-system.js](/src/systems/iframe-system.js)
```diff
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
-    entity.setAttribute("position", "0 1 0");
+    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    entity.setAttribute("material", { color: "red" });
    this.scene.appendChild(entity);
  }
}
```

## Step 4: Make the cube interactable

The `interactable` css class and `is-remote-hover-target` component are necessary to make the object interactable with your cursor. And the `isHandCollisionTarget` and `

[iframe-system.js](/src/systems/iframe-system.js)
```diff
+import { TYPE } from "three-ammo/constants";
+
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    entity.setAttribute("material", { color: "red" });
+    entity.setAttribute("class", "interactable"); // This makes the object targetable by the cursor-targetting-system
+    entity.setAttribute("is-remote-hover-target", ""); // This makes the object hoverable in the interaction system
+    entity.setAttribute("tags", { isHandCollisionTarget: true }); // This makes the object hoverable by your hands in VR
+    entity.setAttribute("body-helper", { type: TYPE.KINEMATIC }); // This registers a kinematic body with the physics system so you we can detect collisions with your hands
    this.scene.appendChild(entity);
  }
}
```

After you add these attributes we should be able to hover over the cube and our cursor should change. At this point, the `interaction` system will have the held object state set for the cursor (`scene.systems.interaction.state.rightRemote.hovered`) or other interactor (left hand, right hand, left cursor), but you can't grab or move it yet.

## Step 5: Display the hover effect

For this object we want to display the default hover effect (the blue sweeping effect). Internally it uses that `hovered` state to check to see if it his being hovered. You can use this state yourself to implement other hover behaviors.

[iframe-system.js](/src/systems/iframe-system.js)
```diff
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    entity.setAttribute("material", { color: "red" });
    entity.setAttribute("class", "interactable"); // This makes the object targetable by the cursor-targetting-system
    entity.setAttribute("is-remote-hover-target", ""); // This makes the object hoverable in the interaction system
    entity.setAttribute("tags", { isHandCollisionTarget: true }); // This makes the object hoverable by your hands in VR
    entity.setAttribute("body-helper", { type: "kinematic" }); // This registers a kinematic body with the physics system so you we can detect collisions with your hands
+    entity.setAttribute("hoverable-visuals", ""); // This adds the hoverable effect to the object
    this.scene.appendChild(entity);
  }
}
```

## Step 6: Make the object grabbable
Now that we can hover on on object, we want to be able to grab and move it around. This is accomplished by adding some tags that register the object with the physics and interaction systems and a number of other supporting components.

[iframe-system.js](/src/systems/iframe-system.js)
```diff
-import { TYPE } from "three-ammo/constants";
+import { COLLISION_LAYERS } from "../constants";
+import { SHAPE, TYPE } from "three-ammo/constants";
+
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    entity.setAttribute("material", { color: "red" });
    entity.setAttribute("class", "interactable"); // This makes the object targetable by the cursor-targetting-system
    entity.setAttribute("is-remote-hover-target", ""); // This makes the object hoverable in the interaction system
-    entity.setAttribute("tags", { isHandCollisionTarget: true }); // This makes the object hoverable by your hands in VR
-    entity.setAttribute("body-helper", { type: "kinematic" }); // This registers a kinematic body with the physics system so you we can detect collisions with your hands
+    entity.setAttribute("tags", {
+      // This makes the object hoverable by your hands in VR
+      isHandCollisionTarget: true,
+      // The interaction system will set it's held state to this object
+      isHoldable: true, 
+      // The physics system will create a constraint between your cursor and the object when grabbed allowing you to move it
+      offersRemoteConstraint: true
+      // The physics system will create a constraint between your hand and the object when grabbed allowing you to move it
+      offersHandConstraint: true
+    });
+    entity.setAttribute("body-helper", {
+      type: TYPE.DYNAMIC, // Now that the body can be grabbed, let's make it respond to gravity
+      mass: 1, // We'll give it a mass of 1kg
+      collisionFilterGroup: COLLISION_LAYERS.INTERACTABLES, 
+      collisionFilterMask: COLLISION_LAYERS.DEFAULT_INTERACTABLE
+    });
+    entity.setAttribute("shape-helper", { type: SHAPE.BOX }); // Create a physics shape that is automatically sized to the bounding box
+    entity.setAttribute("set-unowned-body-kinematic", ""); // When the object has no owner (hasn't been grabbed yet, etc.) use a kinematic body
+    entity.setAttribute("floaty-object", { // Manages the gravity of an object so that it doesn't fall straight to the floor
+      modifyGravityOnRelease: true,
+      autoLockOnLoad: true,
+      gravitySpeedLimit: 0,
+      reduceAngularFloat: true
+    });
    entity.setAttribute("hoverable-visuals", ""); // This adds the hoverable effect to the object
    this.scene.appendChild(entity);
  }
}
```

You should now be able to move the cube around with your cursor. It should float around in 3D space and eventually slow to a stop.

## Step 7: Network the object

So far all this object is only visible locally. If we want to spawn in the other user's scenes we need to add some networking logic.

First we need to add a network template to [hub.html](/src/hub.html). This template is used by networked aframe to instantiate an entity remotely. We can also use this templat to create the entity locally. Let's move all of the logic we've added so far to a template.

And we'll also add a few new components:

- `set-yxz-order`: This sets the rotation order to `yxz` which solves some networked rotation issues.
- `destroy-at-extreme-distances`: This destroys the networked object if it goes too far away from the origin
- `matrix-auto-update`: This undoes our matrix optimizations for this object and make it so that it updates every frame

It is also important that your template id match one of the [existing template categories set in Reticulum](https://github.com/mozilla/reticulum/blob/master/lib/ret_web/channels/hub_channel.ex#L695). In this case we set our template id to `interactable-iframe-media`, the `-media` suffix allows our object to be passed through reticulum and allowed for any user that has the `spawn_and_move_media` permission.

[hub.html](/src/hub.html)
```diff
<!DOCTYPE html>
<html>

<head>
<!-- ...  -->
</head>

<body>
    <!-- ...  -->

    <a-scene>
        <a-assets>
          <!-- ...  -->

+          <template id="interactable-iframe-media">
+            <a-entity
+                geometry="primitive: box; width: 1; height: 1; depth: 1"
+                material="color: red"
+                class="interactable"
+                is-remote-hover-target
+                hoverable-visuals
+                tags="isHandCollisionTarget: true; isHoldable: true; offersRemoteConstraint: true; offersHandConstraint: true;"
+                body-helper="type: dynamic; mass: 1; collisionFilterGroup: 1; collisionFilterMask: 31;"
+                shape-helper="type: box"
+                set-unowned-body-kinematic
+                floaty-object="modifyGravityOnRelease: true; autoLockOnLoad: true; gravitySpeedLimit: 0; reduceAngularFloat: true;"
+                set-yxz-order
+                destroy-at-extreme-distances
+                matrix-auto-update
+            ></a-entity>
+          </template>

        <!-- ...  -->
      </a-assets>
      <!-- ...  -->
    </a-scene>

    <!-- ...  -->
</body>

</html>
```

With the template in place our system can be simplified to:

[iframe-system.js](/src/systems/iframe-system.js)
```js
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    this.scene.appendChild(entity);
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("networked", { template: "#interactable-iframe-media" });
  };
}
```

We set the local position with the `offset-relative-to` component and `networked` handles attaching the components from the template to the entity both locally and remotely. The `offset-relative-to` component will not be attached locally because it is not in the template.

You should now see the object spawn and move locally and on a remote client.

## Step 8: Render a page thumbnail

We won't be going into creating a complete 3D iframe implementation in this tutorial, but we will cover part of it. In the final implementation we will literally render an iframe and transform it in 3D with CSS. However, this isn't possible in WebXR. We can't yet render DOM elements into a WebGL context. So we'll be using a thumbnail for the site instead. We already have a backend service in Hubs that generates these thumbnails, all we need to do is provide it with a url. To start we'll use `https://mozilla.org` as our url and later we'll make it possible to set your own and change it.

Let's create a new component to handle rendering this 3D thumbnail. Components are placed in the `/src/components` directory.

[page-thumbnail.js](/src/components/page-thumbnail.js)
```js
import { resolveUrl, createImageTexture } from "../utils/media-utils";
import { proxiedUrlFor } from "../utils/media-url-utils";

AFRAME.registerComponent("page-thumbnail", {
  schema: {
    src: { type: "string" }
  },

  init: function() {
    this.updateThumbnail = this.updateThumbnail.bind(this);
  },

  update(prevData) {
    if (this.data.src !== prevData.src) {
      this.updateThumbnail();
    }
  },

  updateThumbnail: async function updateThumbnail() {
    if (this.el.object3DMap.mesh) {
      this.el.removeObject3D("mesh");
    }

    const src = this.data.src;

    const result = await resolveUrl(src);

    const thumbnailUrl = result?.meta?.thumbnail;

    if (!thumbnailUrl) {
      throw Error("No thumbnail found");
    }

    const corsProxiedThumbnailUrl = proxiedUrlFor(thumbnailUrl);

    const texture = await createImageTexture(corsProxiedThumbnailUrl);

    const geometry = new THREE.PlaneBufferGeometry(1.6, 0.9, 1, 1, texture.flipY);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    this.el.setObject3D("mesh", mesh);
  }
});
```

And then we'll add this component to the entity in `iframe-system.js`. 

```diff
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

  onSpawnIframe = () => {
    const entity = document.createElement("a-entity");
    this.scene.appendChild(entity);
+    entity.setAttribute("page-thumbnail", { src: "https://mozilla.org" });
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("networked", { template: "#interactable-iframe-media" });
  };
}

```

And finally remove the geometry and material components from the network template in `hub.html`.

[hub.html](/src/hub.html)
```diff
<!DOCTYPE html>
<html>

<head>
<!-- ...  -->
</head>

<body>
    <!-- ...  -->

    <a-scene>
        <a-assets>
          <!-- ...  -->

          <template id="interactable-iframe-media">
            <a-entity
-                geometry="primitive: box; width: 1; height: 1; depth: 1"
-                material="color: red"
                class="interactable"
                is-remote-hover-target
                hoverable-visuals
                tags="isHandCollisionTarget: true; isHoldable: true; offersRemoteConstraint: true; offersHandConstraint: true;"
                body-helper="type: dynamic; mass: 1; collisionFilterGroup: 1; collisionFilterMask: 31;"
                shape-helper="type: box"
                set-unowned-body-kinematic
                floaty-object="modifyGravityOnRelease: true; autoLockOnLoad: true; gravitySpeedLimit: 0; reduceAngularFloat: true;"
                set-yxz-order
                destroy-at-extreme-distances
                matrix-auto-update
            ></a-entity>
          </template>

        <!-- ...  -->
      </a-assets>
      <!-- ...  -->
    </a-scene>

    <!-- ...  -->
</body>

</html>
```

Now when you spawn the Web Page you should see a screenshot of the Mozilla.org homepage, but on the remote client we don't see it yet.

## Step 9: Synchronizing the web page url

The page isn't showing up because the `page-thumbnail` component isn't added on the remote client. We could add this component to the network template in `hub.html`, but then we wouldn't be able to change the url. By default networked aframe synchronizes position, rotation, and scale components every time they change. We want to add a new synchronized component. To do this, we need to create a network schema.

Add the following code somewhere in `/src/network-schemas.js`

[network-schemas.js](/src/network-schemas.js)
```js
NAF.schemas.add({
  template: "#interactable-iframe-media",
  components: [
    {
      component: "position",
      requiresNetworkUpdate: vectorRequiresUpdate(0.001) // Only send updates when the object has moved over 0.001 meters
    },
    {
      component: "rotation",
      requiresNetworkUpdate: vectorRequiresUpdate(0.5) // Only send updates when the object has rotated over 0.5 degrees
    },
    {
        component: "scale",
        requiresNetworkUpdate: vectorRequiresUpdate(0.001)  // Only send updates when the object scale has changed over 0.001 units
      },
    {
      component: "page-thumbnail",
      property: "src" // Synchronize the page-thumbnail component's src property
    }
  ]
});
```

Now the thumbnail should show up in the remote client's view.

## Step 10: Changing the web page url

Now we should be able to set or change the url whenever we want. Let's add some UI to set the web page url when adding it to the scene.

We split our UI features into two parts, presentational and container components. Presentational components handle rendering the UI and do not depend on the state of the app or any non-presentational components. Container components compose one or more presentational components and contain all the business logic and app state bindings. We try to keep all of the UI and styles out of container components so that we can build and test presentational components with [Storybook](https://storybook.js.org/), a tool for rapidly iterating on components.

We'll start by creating a new presentational React component, `/src/react-components/room/WebPageUrlModal.js`.

[WebPageUrlModal.js](/src/react-components/room/WebPageUrlModal.js)
```js
import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { CloseButton } from "../input/CloseButton";
import { TextInputField } from "../input/TextInputField";
import { useForm } from "react-hook-form";
import { Button } from "../input/Button";
import { FormattedMessage } from "react-intl";
import { Column } from "../layout/Column";

export function WebPageUrlModal({ onSubmit, onClose }) {
  const { isSubmitting, handleSubmit, register, errors } = useForm();

  return (
    <Modal
      title={<FormattedMessage id="web-page-url-modal.title" defaultMessage="Web Page URL" />}
      beforeTitle={<CloseButton onClick={onClose} />}
    >
      <Column as="form" padding center onSubmit={handleSubmit(onSubmit)}>
        <p>
          <FormattedMessage
            id="web-page-url-modal.message"
            defaultMessage="Paste a URL to the web page you want to embed in the scene."
          />
        </p>
        <TextInputField
          name="src"
          label={<FormattedMessage id="web-page-url-modal.url-input" defaultMessage="Web Page URL" />}
          placeholder="https://example.com"
          type="url"
          required
          ref={register}
          error={errors.src && errors.src.message}
        />
        <Button type="submit" preset="accept" disabled={isSubmitting}>
          <FormattedMessage id="web-page-url-modal.spawn-web-page-button" defaultMessage="Spawn Web Page" />
        </Button>
      </Column>
    </Modal>
  );
}

WebPageUrlModal.propTypes = {
  onSubmit: PropTypes.func,
  onClose: PropTypes.func
};
```

Then we'll create a story for this component so we can preview it and make sure it looks right. This file will be placed alongside the presentational component (`/src/react-components/room/WebPageUrlModal.stories.js`).


[WebPageUrlModal.stories.js](/src/react-components/room/WebPageUrlModal.stories.js)
```js
import React from "react";
import { RoomLayout } from "../layout/RoomLayout";
import { WebPageUrlModal } from "./WebPageUrlModal";

export default {
  title: "WebPageUrlModal",
  parameters: {
    layout: "fullscreen"
  }
};

export const Base = () => <RoomLayout modal={<WebPageUrlModal />} />;
```

You can then view this story by running `npm run storybook` and navigating to the `Web Page Url Modal` component in the sidebar.

We'll then need to create a container component which interacts with the scene and triggers the spawn event with the provided url. We'll do that in `/src/react-components/room/WebPageUrlModalContainer.js`.

[WebPageUrlModalContainer.js](/src/react-components/room/WebPageUrlModalContainer.js)
```js
import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { WebPageUrlModal } from "./WebPageUrlModal";

export function WebPageUrlModalContainer({ scene, onClose }) {
  const onSubmit = useCallback(
    ({ src }) => {
      scene.emit("spawn-iframe", { src });
      onClose();
    },
    [scene, onClose]
  );

  return <WebPageUrlModal onSubmit={onSubmit} onClose={onClose} />;
}

WebPageUrlModalContainer.propTypes = {
  scene: PropTypes.object.isRequired,
  onClose: PropTypes.func
};

```

We also need to show this modal when you click the "Web Page" button in the place modal.

In `PlacePopoverContainer.js` change this line:

```diff
export function PlacePopoverContainer({ scene, mediaSearchStore, showNonHistoriedDialog, hubChannel }) {
  const [items, setItems] = useState([]);

  useEffect(
    () => {
      function updateItems() {
        // ...

        let nextItems = [
          // ...
        ];

        if (hubChannel.can("spawn_and_move_media")) {
          nextItems = [
            ...nextItems,
            // ...
            {
              id: "iframe",
              icon: BrowserIcon,
              color: "orange",
              label: <FormattedMessage id="place-popover.item-type.iframe" defaultMessage="Web Page" />,
-              onSelect: () => scene.emit("spawn-iframe")
+              () => showNonHistoriedDialog(WebPageUrlModalContainer, { scene })
            },
            // ...
          ];
        }

        setItems(nextItems);
      }

      hubChannel.addEventListener("permissions_updated", updateItems);

      updateItems();

      // ...

      return () => {
        hubChannel.removeEventListener("permissions_updated", updateItems);
        // ...
      };
    },
    [hubChannel, mediaSearchStore, showNonHistoriedDialog, scene]
  );

  return <PlacePopoverButton items={items} />;
}
```

This will show the modal in the viewport and pass the `scene` object into the container component's props.

And finally we need to change `iframe-system.js` to use this `src` property in the `spawn-iframe` event.

```diff
export class IframeSystem {
  constructor(scene) {
    this.scene = scene;

    this.scene.addEventListener("spawn-iframe", this.onSpawnIframe);
  }

-  onSpawnIframe = () => {
+  onSpawnIframe = event => {
    const entity = document.createElement("a-entity");
    this.scene.appendChild(entity);
-    entity.setAttribute("page-thumbnail", { src: "https://mozilla.org" });
+    entity.setAttribute("page-thumbnail", { src: event.detail.src });
    entity.setAttribute("offset-relative-to", { target: "#avatar-pov-node", offset: { x: 0, y: 0, z: -1.5 } });
    entity.setAttribute("networked", { template: "#interactable-iframe-media" });
  };
}
```

Now when we click the "Web Page` button we should see the modal, we can fill it out with any url we want, and then click "Spawn Webpage". In a short while we'll see the object spawn.

## Step 11: Show the loading state

To polish it off, let's add a loader so that we have something to look at and grab while it's loading. Back in `hub.html` add the following line.

```diff
<template id="interactable-iframe-media">
  <a-entity
      class="interactable"
      is-remote-hover-target
      hoverable-visuals
      tags="isHandCollisionTarget: true; isHoldable: true; offersRemoteConstraint: true; offersHandConstraint: true;"
      body-helper="type: dynamic; mass: 1; collisionFilterGroup: 1; collisionFilterMask: 31;"
      matrix-auto-update
      shape-helper="type: box"
      set-unowned-body-kinematic
      floaty-object="modifyGravityOnRelease: true; autoLockOnLoad: true; gravitySpeedLimit: 0; reduceAngularFloat: true;"
      set-yxz-order
      destroy-at-extreme-distances
      matrix-auto-update
+      loader="loadedEvent: page-thumbnail-loaded"
  ></a-entity>
</template>
```

Then we'll emit this event on the element when it's done loading

[page-thumbnail.js](/src/components/page-thumbnail.js)
```diff
import { resolveUrl, createImageTexture } from "../utils/media-utils";
import { proxiedUrlFor } from "../utils/media-url-utils";

AFRAME.registerComponent("page-thumbnail", {
  schema: {
    src: { type: "string" }
  },

  init: function() {
    this.updateThumbnail = this.updateThumbnail.bind(this);
  },

  update(prevData) {
    if (this.data.src !== prevData.src) {
      this.updateThumbnail();
    }
  },

  updateThumbnail: async function updateThumbnail() {
    if (this.el.object3DMap.mesh) {
      this.el.removeObject3D("mesh");
    }

    const src = this.data.src;

    const result = await resolveUrl(src);

    const thumbnailUrl = result?.meta?.thumbnail;

    if (!thumbnailUrl) {
      throw Error("No thumbnail found");
    }

    const corsProxiedThumbnailUrl = proxiedUrlFor(thumbnailUrl);

    const texture = await createImageTexture(corsProxiedThumbnailUrl);

    const geometry = new THREE.PlaneBufferGeometry(1.6, 0.9, 1, 1, texture.flipY);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    this.el.setObject3D("mesh", mesh);

+    this.el.emit("page-thumbnail-loaded");
  }
});
```

Now you should see a loading indicator while the website thumbnail is being loaded.

## What's Next

You've successfully created a basic networked interactable object. From here you can modify the code you've written to have different visual behavior.You could also check the held or grabbed state to trigger different actions. Whatever interactable objects your app needs, these basic concepts can be applied to.

The Hubs codebase can be challenging to work with. It's quite large and contains a wide vriety of libraries and javascript APIs. If you get stuck and want to find help, we recommend starting a [Github Discussion thread](https://github.com/mozilla/hubs/discussions). You can also [join our community on Discord](https://discord.com/invite/CzAbuGu), where our community members and developers are constantly talking about Hubs development.
