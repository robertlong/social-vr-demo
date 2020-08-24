import { hasReticulumServer } from "./phoenix-utils";
import configs from "./configs";

const nonCorsProxyDomains = (configs.NON_CORS_PROXY_DOMAINS || "").split(",");
if (configs.CORS_PROXY_SERVER) {
  nonCorsProxyDomains.push(configs.CORS_PROXY_SERVER);
}
nonCorsProxyDomains.push(document.location.hostname);

const commonKnownContentTypes = {
  gltf: "model/gltf",
  glb: "model/gltf-binary",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  basis: "image/basis",
  m3u8: "application/vnd.apple.mpegurl",
  mpd: "application/dash+xml"
};

// thanks to https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
function b64EncodeUnicode(str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8, then we convert the percent-encodings
  // into raw bytes which can be fed into btoa.
  const CHAR_RE = /%([0-9A-F]{2})/g;
  return btoa(encodeURIComponent(str).replace(CHAR_RE, (_, p1) => String.fromCharCode("0x" + p1)));
}

const farsparkEncodeUrl = url => {
  // farspark doesn't know how to read '=' base64 padding characters
  // translate base64 + to - and / to _ for URL safety
  return b64EncodeUnicode(url)
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

export const scaledThumbnailUrlFor = (url, width, height) => {
  let extension = "";
  try {
    const pathParts = new URL(url).pathname.split(".");

    if (pathParts.length > 1) {
      const extensionCandidate = pathParts.pop();
      if (commonKnownContentTypes[extensionCandidate]) {
        extension = `.${extensionCandidate}`;
      }
    }
  } catch (e) {
    extension = ".png";
  }

  // HACK: the extension is needed to ensure CDN caching on Cloudflare
  const thumbnailUrl = `https://${configs.THUMBNAIL_SERVER}/thumbnail/${farsparkEncodeUrl(
    url
  )}${extension}?w=${width}&h=${height}`;

  try {
    const urlHostname = new URL(url).hostname;

    if (hasReticulumServer()) {
      const retHostname = new URL(`https://${configs.RETICULUM_SERVER}`).hostname;
      if (retHostname === urlHostname) return url;
    }
  } catch (e) {
    return thumbnailUrl;
  }

  return thumbnailUrl;
};

export const isNonCorsProxyDomain = hostname => {
  return nonCorsProxyDomains.find(domain => hostname.endsWith(domain));
};

export const proxiedUrlFor = async url => {
  if (!(url.startsWith("http:") || url.startsWith("https:"))) return url;

  // Skip known domains that do not require CORS proxying.
  try {
    const parsedUrl = new URL(url);
    if (isNonCorsProxyDomain(parsedUrl.hostname)) return url;

    // TODO check actual access control headers and response code
    const headRes = await fetch(url, { method: "HEAD" });
    return url;
  } catch (e) {
    // Ignore
  }

  console.log("Using cors proxy");
  return `https://${configs.CORS_PROXY_SERVER}/${url}`;
};

export function getAbsoluteUrl(baseUrl, relativeUrl) {
  return new URL(relativeUrl, baseUrl);
}

export function getAbsoluteHref(baseUrl, relativeUrl) {
  return getAbsoluteUrl(baseUrl, relativeUrl).href;
}

export const getCustomGLTFParserURLResolver = gltfUrl => url => {
  if (typeof url !== "string" || url === "") return "";
  if (/^(https?:)?\/\//i.test(url)) return proxiedUrlFor(url);
  if (/^data:.*,.*$/i.test(url)) return url;
  if (/^blob:.*$/i.test(url)) return url;

  if (configs.CORS_PROXY_SERVER) {
    // For absolute paths with a CORS proxied gltf URL, re-write the url properly to be proxied
    const corsProxyPrefix = `https://${configs.CORS_PROXY_SERVER}/`;

    if (gltfUrl.startsWith(corsProxyPrefix)) {
      const originalUrl = decodeURIComponent(gltfUrl.substring(corsProxyPrefix.length));
      const originalUrlParts = originalUrl.split("/");

      // Drop the .gltf filename
      const path = new URL(url).pathname;
      const assetUrl = originalUrlParts.slice(0, originalUrlParts.length - 1).join("/") + "/" + path;
      return corsProxyPrefix + assetUrl;
    }
  }

  return url;
};

const dataUrlRegex = /data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/;

export const guessContentType = url => {
  if (!url) return;
  if (url.startsWith("hubs://") && url.endsWith("/video")) return "video/vnd.hubs-webrtc";
  if (url.startsWith("data:")) {
    const matches = dataUrlRegex.exec(url);
    if (matches.length > 0) {
      matches[1];
    }
  }
  const extension = new URL(url, window.location).pathname.split(".").pop();
  return commonKnownContentTypes[extension];
};

const originIsHubsServer = new Map();
async function isHubsServer(url) {
  if (!url) return false;
  if (!url.startsWith("http")) {
    url = "https://" + url;
  }
  const { origin } = new URL(url);

  if (originIsHubsServer.has(origin)) {
    return originIsHubsServer.get(origin);
  }

  let isHubsServer;
  try {
    isHubsServer = (await fetch(await proxiedUrlFor(origin), { method: "HEAD" })).headers.has("hub-name");
  } catch (e) {
    isHubsServer = false;
  }
  originIsHubsServer.set(origin, isHubsServer);
  return isHubsServer;
}

const hubsSceneRegex = /https?:\/\/[^/]+\/scenes\/(\w+)\/?\S*/;
const hubsAvatarRegex = /https?:\/\/[^/]+\/avatars\/(?<id>\w+)\/?\S*/;
const hubsRoomRegex = /(https?:\/\/)?[^/]+\/([a-zA-Z0-9]{7})\/?\S*/;

export const isLocalHubsUrl = async url =>
  (await isHubsServer(url)) && new URL(url).origin === document.location.origin;

export const isHubsSceneUrl = async url => (await isHubsServer(url)) && hubsSceneRegex.test(url);
export const isLocalHubsSceneUrl = async url => (await isHubsSceneUrl(url)) && (await isLocalHubsUrl(url));

export const isHubsAvatarUrl = async url => (await isHubsServer(url)) && hubsAvatarRegex.test(url);
export const isLocalHubsAvatarUrl = async url => (await isHubsAvatarUrl(url)) && (await isLocalHubsUrl(url));

export const isHubsRoomUrl = async url =>
  (await isHubsServer(url)) && !(await isHubsAvatarUrl(url)) && !(await isHubsSceneUrl(url)) && hubsRoomRegex.test(url);

export const isHubsDestinationUrl = async url =>
  (await isHubsServer(url)) && ((await isHubsSceneUrl(url)) || (await isHubsRoomUrl(url)));

export const idForAvatarUrl = url => {
  const match = url.match(hubsAvatarRegex);
  if (match) {
    return match.groups.id;
  }
  return null;
};
