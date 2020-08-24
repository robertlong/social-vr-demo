import { isLocalHubsSceneUrl, proxiedUrlFor } from "../utils/media-url-utils";

export async function isValidGLB(url) {
  return fetch(url).then(async r => {
    const reader = r.body.getReader();
    let header = "";
    function readChunk({ done, value }) {
      header += String.fromCharCode.apply(null, value.slice(0, 4));
      if (!done && header.length < 4) {
        return reader.read().then(readChunk);
      } else {
        reader.cancel();
      }
    }
    await reader.read().then(readChunk);
    return header.startsWith("glTF");
  });
}

export async function isValidSceneUrl(url) {
  if (url.trim() === "") return false;
  if (!url.startsWith("http")) return false;
  if (await isLocalHubsSceneUrl(url)) {
    return true;
  } else {
    return isValidGLB(await proxiedUrlFor(url));
  }
}

// To assist with content control, we avoid displaying scene links to users who are not the scene
// creator, unless the scene is remixable or promotable.
export function allowDisplayOfSceneLink(scene, store) {
  return (
    (store.credentialsAccountId && scene.account_id === store.credentialsAccountId) ||
    scene.allow_promotion ||
    scene.allow_remixing
  );
}
