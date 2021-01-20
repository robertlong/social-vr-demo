import { Socket } from "phoenix";
import { generateHubName } from "../utils/name-generation";
import configs from "../utils/configs";

import Store from "../storage/store";

export function hasReticulumServer() {
  return !!configs.RETICULUM_SERVER;
}

export function isLocalClient() {
  return hasReticulumServer() && document.location.host !== configs.RETICULUM_SERVER;
}

export function hubUrl(hubId) {
  if (!hubId) {
    if (isLocalClient()) {
      hubId = new URLSearchParams(location.search).get("hub_id");
    } else {
      hubId = location.pathname.split("/")[1];
    }
  }
  return new URL(isLocalClient() ? `/hub.html?hub_id=${hubId}` : `/${hubId}`, location.href);
}

const resolverLink = document.createElement("a");
let reticulumMeta = null;
let invalidatedReticulumMetaThisSession = false;

export function getReticulumFetchUrl(path, absolute = false, host = null, port = null) {
  if (host || hasReticulumServer()) {
    return `https://${host || configs.RETICULUM_SERVER}${port ? `:${port}` : ""}${path}`;
  } else if (absolute) {
    resolverLink.href = path;
    return resolverLink.href;
  } else {
    return path;
  }
}

export async function getReticulumMeta() {
  if (!reticulumMeta) {
    // Initially look up version based upon page, avoiding round-trip, otherwise fetch.
    if (!invalidatedReticulumMetaThisSession && document.querySelector("meta[name='ret:version']")) {
      reticulumMeta = {
        version: document.querySelector("meta[name='ret:version']").getAttribute("value"),
        pool: document.querySelector("meta[name='ret:pool']").getAttribute("value"),
        phx_host: document.querySelector("meta[name='ret:phx_host']").getAttribute("value")
      };
    } else {
      await fetch(getReticulumFetchUrl("/api/v1/meta")).then(async res => {
        reticulumMeta = await res.json();
      });
    }
  }

  const qs = new URLSearchParams(location.search);
  const phxHostOverride = qs.get("phx_host");

  if (phxHostOverride) {
    reticulumMeta.phx_host = phxHostOverride;
  }

  return reticulumMeta;
}

let directReticulumHostAndPort;

async function refreshDirectReticulumHostAndPort() {
  const qs = new URLSearchParams(location.search);
  let host = qs.get("phx_host");
  const reticulumMeta = await getReticulumMeta();
  host = host || configs.RETICULUM_SOCKET_SERVER || reticulumMeta.phx_host;
  const port =
    qs.get("phx_port") ||
    (hasReticulumServer() ? new URL(`${document.location.protocol}//${configs.RETICULUM_SERVER}`).port : "443");
  directReticulumHostAndPort = { host, port };
}

export function getDirectReticulumFetchUrl(path, absolute = false) {
  if (!directReticulumHostAndPort) {
    console.warn("Cannot call getDirectReticulumFetchUrl before connectToReticulum. Returning non-direct url.");
    return getReticulumFetchUrl(path, absolute);
  }

  const { host, port } = directReticulumHostAndPort;
  return getReticulumFetchUrl(path, absolute, host, port);
}

export async function invalidateReticulumMeta() {
  invalidatedReticulumMetaThisSession = true;
  reticulumMeta = null;
}

export async function connectToReticulum(debug = false, params = null, socketClass = Socket) {
  const qs = new URLSearchParams(location.search);

  const getNewSocketUrl = async () => {
    await refreshDirectReticulumHostAndPort();
    const { host, port } = directReticulumHostAndPort;
    const protocol =
      qs.get("phx_protocol") ||
      configs.RETICULUM_SOCKET_PROTOCOL ||
      (document.location.protocol === "https:" ? "wss:" : "ws:");

    return `${protocol}//${host}${port ? `:${port}` : ""}`;
  };

  const socketUrl = await getNewSocketUrl();
  console.log(`Phoenix Socket URL: ${socketUrl}`);

  const socketSettings = {};

  if (debug) {
    socketSettings.logger = (kind, msg, data) => {
      console.log(`${kind}: ${msg}`, data);
    };
  }

  if (params) {
    socketSettings.params = params;
  }

  const socket = new socketClass(`${socketUrl}/socket`, socketSettings);
  socket.connect();
  socket.onError(async () => {
    // On error, underlying reticulum node may have died, so rebalance by
    // fetching a new healthy node to connect to.
    invalidateReticulumMeta();

    const endPointPath = new URL(socket.endPoint).pathname;
    const newSocketUrl = await getNewSocketUrl();
    const newEndPoint = `${newSocketUrl}${endPointPath}`;
    console.log(`Socket error, changed endpoint to ${newEndPoint}`);
    socket.endPoint = newEndPoint;
  });

  return socket;
}

export function getLandingPageForPhoto(photoUrl) {
  const parsedUrl = new URL(photoUrl);
  return getReticulumFetchUrl(parsedUrl.pathname.replace(".png", ".html") + parsedUrl.search, true);
}

export function fetchReticulumAuthenticated(url, method = "GET", payload) {
  const { token } = window.APP.store.state.credentials;
  const retUrl = getReticulumFetchUrl(url);
  const params = {
    headers: { "content-type": "application/json" },
    method
  };
  if (token) {
    params.headers.authorization = `bearer ${token}`;
  }
  if (payload) {
    params.body = JSON.stringify(payload);
  }
  return fetch(retUrl, params).then(async r => {
    const result = await r.text();
    try {
      return JSON.parse(result);
    } catch (e) {
      // Some reticulum responses, particularly DELETE requests, don't return json.
      return result;
    }
  });
}

export async function createAndRedirectToNewHub(name, sceneId, replace) {
  const createUrl = getReticulumFetchUrl("/api/v1/hubs");
  const payload = { hub: { name: name || generateHubName() } };

  if (sceneId) {
    payload.hub.scene_id = sceneId;
  }

  const headers = { "content-type": "application/json" };
  const store = new Store();
  if (store.state && store.state.credentials.token) {
    headers.authorization = `bearer ${store.state.credentials.token}`;
  }

  let res = await fetch(createUrl, {
    body: JSON.stringify(payload),
    headers,
    method: "POST"
  }).then(r => r.json());

  if (res.error === "invalid_token") {
    // Clear the invalid token from store.
    store.update({ credentials: { token: null, email: null, displayName: null } });

    // Create hub anonymously
    delete headers.authorization;
    res = await fetch(createUrl, {
      body: JSON.stringify(payload),
      headers,
      method: "POST"
    }).then(r => r.json());
  }

  const hub = res;
  let url = hub.url;

  const creatorAssignmentToken = hub.creator_assignment_token;
  if (creatorAssignmentToken) {
    store.update({ creatorAssignmentTokens: [{ hubId: hub.hub_id, creatorAssignmentToken: creatorAssignmentToken }] });

    // Don't need to store the embed token if there's no creator assignment token, since that means
    // we are the owner and will get the embed token on page load.
    const embedToken = hub.embed_token;

    if (embedToken) {
      store.update({ embedTokens: [{ hubId: hub.hub_id, embedToken: embedToken }] });
    }
  }

  if (isLocalClient()) {
    url = `/hub.html?hub_id=${hub.hub_id}`;
  }

  if (replace) {
    document.location.replace(url);
  } else {
    document.location = url;
  }
}

export function getPresenceEntryForSession(presences, sessionId) {
  const entry = Object.entries(presences || {}).find(([k]) => k === sessionId) || [];
  const presence = entry[1];
  return (presence && presence.metas && presence.metas[0]) || {};
}

export function getPresenceContextForSession(presences, sessionId) {
  return (getPresenceEntryForSession(presences, sessionId) || {}).context || {};
}

export function getPresenceProfileForSession(presences, sessionId) {
  return (getPresenceEntryForSession(presences, sessionId) || {}).profile || {};
}

// Takes the given channel, and creates a new channel with the same bindings
// with the given socket, joins it, and leaves the old channel after joining.
//
// NOTE: This function relies upon phoenix channel object internals, so this
// function will need to be reviewed if/when we ever update phoenix.js
export function migrateChannelToSocket(oldChannel, socket, params) {
  const channel = socket.channel(oldChannel.topic, params || oldChannel.params);

  for (let i = 0, l = oldChannel.bindings.length; i < l; i++) {
    const item = oldChannel.bindings[i];
    channel.on(item.event, item.callback);
  }

  for (let i = 0, l = oldChannel.pushBuffer.length; i < l; i++) {
    const item = oldChannel.pushBuffer[i];
    channel.push(item.event, item.payload, item.timeout);
  }

  const oldJoinPush = oldChannel.joinPush;
  const joinPush = channel.join();

  for (let i = 0, l = oldJoinPush.recHooks.length; i < l; i++) {
    const item = oldJoinPush.recHooks[i];
    joinPush.receive(item.status, item.callback);
  }

  return new Promise(resolve => {
    joinPush.receive("ok", () => {
      // Clear all event handlers first so no duplicate messages come in.
      oldChannel.bindings = [];
      resolve(channel);
    });
  });
}

export function discordBridgesForPresences(presences) {
  const channels = [];
  for (const p of Object.values(presences)) {
    for (const m of p.metas) {
      if (m.profile && m.profile.discordBridges) {
        Array.prototype.push.apply(channels, m.profile.discordBridges.map(b => b.channel.name));
      }
    }
  }
  return channels;
}
