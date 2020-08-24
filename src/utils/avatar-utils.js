import { fetchReticulumAuthenticated } from "./phoenix-utils";
import { proxiedUrlFor } from "./media-url-utils";

const AVATARS_API = "/api/v1/avatars";

export const AVATAR_TYPES = {
  SKINNABLE: "skinnable",
  URL: "url"
};

export function getAvatarType(avatarId) {
  if (avatarId.startsWith("http")) return AVATAR_TYPES.URL;
  return AVATAR_TYPES.SKINNABLE;
}

async function fetchSkinnableAvatar(avatarId) {
  const resp = await fetchReticulumAuthenticated(`/api/v1/avatars/${avatarId}`);
  return resp && resp.avatars && resp.avatars[0];
}

export async function fetchAvatar(avatarId) {
  switch (getAvatarType(avatarId)) {
    case AVATAR_TYPES.SKINNABLE:
      return fetchSkinnableAvatar(avatarId);
    case AVATAR_TYPES.URL:
      return {
        avatar_id: avatarId,
        gltf_url: await proxiedUrlFor(avatarId)
      };
  }
}

async function fetchAvatarGltfUrl(avatarId) {
  return fetchAvatar(avatarId).then(avatar => avatar && avatar.gltf_url);
}

export async function getAvatarSrc(avatarId) {
  switch (getAvatarType(avatarId)) {
    case AVATAR_TYPES.SKINNABLE:
      return fetchAvatarGltfUrl(avatarId);
    case AVATAR_TYPES.URL:
      return await proxiedUrlFor(avatarId);
    default:
      return avatarId;
  }
}

export async function getAvatarThumbnailUrl(avatarId) {
  switch (getAvatarType(avatarId)) {
    case AVATAR_TYPES.SKINNABLE:
      return fetchAvatar(avatarId).then(avatar => avatar.files.thumbnail);
    default:
      return "https://asset-bundles-prod.reticulum.io/bots/avatar_unavailable.png";
  }
}

// Currently the way we do material overrides is with a special named material.
// We want to migrate eventually to having a GLTF extension that specifies what
// materials can be overridden, but in the meantime we want to be able to support
// arbitrary models with some sort of functionality. This provides a fallback
export const MAT_NAME = "Bot_PBS";
export function ensureAvatarMaterial(gltf) {
  if (gltf.materials.find(m => m.name === MAT_NAME)) return gltf;

  function materialForMesh(mesh) {
    if (!mesh.primitives) return;
    const primitive = mesh.primitives.find(p => p.material !== undefined);
    return primitive && gltf.materials[primitive.material];
  }

  let nodes = gltf.scenes[gltf.scene].nodes.slice(0);
  while (nodes.length) {
    const node = gltf.nodes[nodes.shift()];
    const material = node.mesh !== undefined && materialForMesh(gltf.meshes[node.mesh]);
    if (material) {
      material.name = MAT_NAME;
      break;
    }
    if (node.children) nodes = nodes.concat(node.children);
  }

  return gltf;
}

export async function remixAvatar(parentId, name) {
  const avatar = {
    parent_avatar_listing_id: parentId,
    name: name,
    files: {}
  };

  return fetchReticulumAuthenticated(AVATARS_API, "POST", { avatar });
}
