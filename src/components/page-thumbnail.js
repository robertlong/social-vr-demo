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

    this.el.emit("page-thumbnail-loaded");
  }
});
