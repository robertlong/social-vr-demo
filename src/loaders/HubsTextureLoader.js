// Disable ImageBitmap for Firefox so far because
// createImageBitmap() with option fails on Firefox due to the bug.
// Three.js ImageBitmapLoader passes {colorSpaceConversion: 'none'} option.
// Without the option, the rendering result can be wrong if image file has ICC profiles.
// See https://github.com/mrdoob/three.js/pull/21336
const HAS_IMAGE_BITMAP = window.createImageBitmap !== undefined && /Firefox/.test(navigator.userAgent) === false;
export const TEXTURES_FLIP_Y = !HAS_IMAGE_BITMAP;

export default class HubsTextureLoader extends THREE.TextureLoader {
  constructor(manager) {
    super(manager);
  }

  load(url, onLoad, onProgress, onError) {
    const texture = HAS_IMAGE_BITMAP
      ? this.loadImageBitmapTexture(url, onLoad, onProgress, onError)
      : super.load(url, onLoad, onProgress, onError);

    texture.onUpdate = function() {
      // Delete texture data once it has been uploaded to the GPU
      texture.image.close && texture.image.close();
      delete texture.image;
    };

    return texture;
  }

  async loadAsync(url, onProgress) {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject);
    });
  }

  loadImageBitmapTexture(url, onLoad, onProgress, onError) {
    const texture = new THREE.Texture();
    const loader = new THREE.ImageBitmapLoader(this.manager);
    loader.setCrossOrigin(this.crossOrigin);
    loader.setPath(this.path);

    loader.load(
      url,
      bitmap => {
        texture.image = bitmap;
        texture.needsUpdate = true;

        // We close the image bitmap when it's uploaded to texture.
        // Closed image bitmap can't be reused so we remove the cache
        // added in ImageBitmapLoader.
        // You can remove this line once we entirely disable THREE.Cache.
        THREE.Cache.remove(this.manager.resolveURL(url));

        if (onLoad !== undefined) {
          onLoad(texture);
        }
      },
      onProgress,
      onError
    );

    texture.flipY = false;
    return texture;
  }
}
