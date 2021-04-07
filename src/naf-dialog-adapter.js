import * as mediasoupClient from "mediasoup-client";
import protooClient from "protoo-client";
import { debug as newDebug } from "debug";
import EventEmitter from "eventemitter3";

// NOTE this adapter does not properly fire the onOccupantsReceived events since those are only needed for
// data channels, which are not yet supported. To fire that event, this class would need to keep a list of
// occupants around and manage it.
//
// Used for VP9 webcam video.
//const VIDEO_KSVC_ENCODINGS = [{ scalabilityMode: "S3T3_KEY" }];

// Used for VP9 desktop sharing.
//const VIDEO_SVC_ENCODINGS = [{ scalabilityMode: "S3T3", dtx: true }];

// TODO
// - look into requestConsumerKeyframe
// - look into applyNetworkThrottle
// SFU todo
// - remove active speaker stuff
// - remove score stuff

// Based upon mediasoup-demo RoomClient

const debug = newDebug("naf-dialog-adapter:debug");
//const warn = newDebug("naf-dialog-adapter:warn");
const error = newDebug("naf-dialog-adapter:error");
const info = newDebug("naf-dialog-adapter:info");

const PC_PROPRIETARY_CONSTRAINTS = {
  optional: [{ googDscp: true }]
};

const INITIAL_ROOM_RECONNECTION_INTERVAL = 2000;

const WEBCAM_SIMULCAST_ENCODINGS = [
  { scaleResolutionDownBy: 4, maxBitrate: 500000 },
  { scaleResolutionDownBy: 2, maxBitrate: 1000000 },
  { scaleResolutionDownBy: 1, maxBitrate: 5000000 }
];

// Used for simulcast screen sharing.
const SCREEN_SHARING_SIMULCAST_ENCODINGS = [{ dtx: true, maxBitrate: 1500000 }, { dtx: true, maxBitrate: 6000000 }];

export default class DialogAdapter extends EventEmitter {
  constructor() {
    super();

    this._timeOffsets = [];
    this._occupants = {};
    this._micProducer = null;
    this._cameraProducer = null;
    this._shareProducer = null;
    this._mediaStreams = {};
    this._localMediaStream = null;
    this._consumers = new Map();
    this._frozenUpdates = new Map();
    this._pendingMediaRequests = new Map();
    this._micEnabled = true;
    this._serverTimeRequests = 0;
    this._avgTimeOffset = 0;
    this._blockedClients = new Map();
    this.type = "dialog";
    this.occupants = {}; // This is a public field
    this._forceTcp = false;
    this._forceTurn = false;
    this._iceTransportPolicy = "all";
    this._reconnectionDelay = INITIAL_ROOM_RECONNECTION_INTERVAL;
    this._reconnectionTimeout = null;
    this._reconnectionAttempts = 0;
    this._lastSendConnectionState = null;
    this._lastRecvConnectionState = null;
    this._closed = true;
    this.scene = document.querySelector("a-scene");
    this._downlinkBwe = null;
    this._consumerStats = {};
  }

  get consumerStats() {
    return this._consumerStats;
  }

  get downlinkBwe() {
    return this._downlinkBwe;
  }

  get serverUrl() {
    return this._serverUrl;
  }

  setServerUrl(url) {
    this._serverUrl = url;
  }

  setJoinToken(joinToken) {
    this._joinToken = joinToken;
  }

  setTurnConfig(forceTcp, forceTurn) {
    this._forceTcp = forceTcp;
    this._forceTurn = forceTurn;

    if (this._forceTurn || this._forceTcp) {
      this._iceTransportPolicy = "relay";
    }
  }

  getIceServers(host, port, turn) {
    const iceServers = [];

    this._serverUrl = `wss://${host}:${port}`;

    if (turn && turn.enabled) {
      turn.transports.forEach(ts => {
        // Try both TURN DTLS and TCP/TLS
        if (!this._forceTcp) {
          iceServers.push({
            urls: `turns:${host}:${ts.port}`,
            username: turn.username,
            credential: turn.credential
          });
        }

        iceServers.push({
          urls: `turns:${host}:${ts.port}?transport=tcp`,
          username: turn.username,
          credential: turn.credential
        });
      });
      iceServers.push({ urls: "stun:stun1.l.google.com:19302" });
    } else {
      iceServers.push({ urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:stun2.l.google.com:19302" });
    }

    return iceServers;
  }

  setApp() {}

  setRoom(roomId) {
    this._roomId = roomId;
  }

  setClientId(clientId) {
    this._clientId = clientId;
  }

  setServerConnectListeners(successListener, failureListener) {
    this._connectSuccess = successListener;
    this._connectFailure = failureListener;
  }

  setRoomOccupantListener(occupantListener) {
    this._onOccupantsChanged = occupantListener;
  }

  setDataChannelListeners(openListener, closedListener, messageListener) {
    this._onOccupantConnected = openListener;
    this._onOccupantDisconnected = closedListener;
    this._onOccupantMessage = messageListener;
  }

  /**
   * Gets transport/consumer/producer stats on the server side.
   */
  async getServerStats() {
    if (this.getConnectStatus() === NAF.adapters.NOT_CONNECTED) {
      // Signaling channel not connected, no reason to get remote RTC stats.
      return;
    }

    const result = {};
    try {
      if (!this._sendTransport?._closed) {
        const sendTransport = (result[this._sendTransport.id] = {});
        sendTransport.name = "Send";
        sendTransport.stats = await this._protoo.request("getTransportStats", {
          transportId: this._sendTransport.id
        });
        result[this._sendTransport.id]["producers"] = {};
        for (const producer of this._sendTransport._producers) {
          const id = producer[0];
          result[this._sendTransport.id]["producers"][id] = await this._protoo.request("getProducerStats", {
            producerId: id
          });
        }
      }
      if (!this._recvTransport?._closed) {
        const recvTransport = (result[this._recvTransport.id] = {});
        recvTransport.name = "Receive";
        recvTransport.stats = await this._protoo.request("getTransportStats", {
          transportId: this._recvTransport.id
        });
        result[this._recvTransport.id]["consumers"] = {};
        for (const consumer of this._recvTransport._consumers) {
          const id = consumer[0];
          result[this._recvTransport.id]["consumers"][id] = await this._protoo.request("getConsumerStats", {
            consumerId: id
          });
        }
      }
      return result;
    } catch (e) {
      this.emitRTCEvent("error", "Adapter", () => `Error getting the server status: ${e}`);
      return { error: `Error getting the server status: ${e}` };
    }
  }

  async iceRestart(transport) {
    // Force an ICE restart to gather new candidates and trigger a reconnection
    this.emitRTCEvent(
      "log",
      "RTC",
      () => `Restarting ${transport.id === this._sendTransport.id ? "send" : "receive"} transport ICE`
    );
    const iceParameters = await this._protoo.request("restartIce", { transportId: transport.id });
    await transport.restartIce({ iceParameters });
  }

  async recreateSendTransport(iceServers) {
    this.emitRTCEvent("log", "RTC", () => `Recreating send transport ICE`);
    await this.closeSendTransport();
    await this.createSendTransport(iceServers);
  }

  /**
   * Restart ICE in the underlying send peerconnection.
   */
  async restartSendICE() {
    // Do not restart ICE if Signaling is disconnected. We are not in the meeting room if that's the case.
    if (this._closed) {
      return;
    }

    try {
      if (!this._sendTransport?._closed) {
        await this.iceRestart(this._sendTransport);
      } else {
        // If the transport is closed but the signaling is connected, we try to recreate
        const { host, port, turn } = await window.APP.hubChannel.getHost();
        const iceServers = this.getIceServers(host, port, turn);
        await this.recreateSendTransport(iceServers);
      }
    } catch (err) {
      this.emitRTCEvent("error", "RTC", () => `Send transport [recreate] failed: ${err}`);
    }
  }

  /**
   * Checks the Send Transport ICE status and restarts it in case is in failed state.
   * This is called by the Send Transport "connectionstatechange" event listener.
   * @param {boolean} connectionState The transport connnection state (ICE connection state)
   */
  checkSendIceStatus(connectionState) {
    // If the ICE connection state is failed, we force an ICE restart
    if (connectionState === "failed") {
      this.restartSendICE();
    }

    this._lastSendConnectionState = connectionState;
  }

  async recreateRecvTransport(iceServers) {
    this.emitRTCEvent("log", "RTC", () => `Recreating receive transport ICE`);
    await this.closeRecvTransport();
    await this.createRecvTransport(iceServers);
    await this.createMissingConsumers();
  }

  /**
   * Restart ICE in the underlying receive peerconnection.
   * @param {boolean} force Forces the execution of the reconnect.
   */
  async restartRecvICE() {
    // Do not restart ICE if Signaling is disconnected. We are not in the meeting room if that's the case.
    if (this._closed) {
      return;
    }

    try {
      if (!this._recvTransport?._closed) {
        await this.iceRestart(this._recvTransport);
      } else {
        // If the transport is closed but the signaling is connected, we try to recreate
        const { host, port, turn } = await window.APP.hubChannel.getHost();
        const iceServers = this.getIceServers(host, port, turn);
        await this.recreateRecvTransport(iceServers);
      }
    } catch (err) {
      this.emitRTCEvent("error", "RTC", () => `Receive transport [recreate] failed: ${err}`);
    }
  }

  /**
   * Checks the ReeceiveReeceive Transport ICE status and restarts it in case is in failed state.
   * This is called by the Reeceive Transport "connectionstatechange" event listener.
   * @param {boolean} connectionState The transport connection state (ICE connection state)
   */
  checkRecvIceStatus(connectionState) {
    // If the ICE connection state is failed, we force an ICE restart
    if (connectionState === "failed") {
      this.restartRecvICE();
    }

    this._lastRecvConnectionState = connectionState;
  }

  async connect() {
    const urlWithParams = new URL(this._serverUrl);
    urlWithParams.searchParams.append("roomId", this._roomId);
    urlWithParams.searchParams.append("peerId", this._clientId);

    const protooTransport = new protooClient.WebSocketTransport(urlWithParams.toString());
    this._protoo = new protooClient.Peer(protooTransport);

    await new Promise(res => {
      this._protoo.on("open", async () => {
        this.emitRTCEvent("info", "Signaling", () => `Open`);
        this._closed = false;
        await this._joinRoom();
        res();
      });
    });

    this._protoo.on("disconnected", () => {
      this.emitRTCEvent("info", "Signaling", () => `Diconnected`);
      this.disconnect();
    });

    this._protoo.on("close", () => {
      this.emitRTCEvent("info", "Signaling", () => `Close`);
      this.disconnect();
    });

    // eslint-disable-next-line no-unused-vars
    this._protoo.on("request", async (request, accept, reject) => {
      this.emitRTCEvent("info", "Signaling", () => `Request [${request.method}]: ${request.data?.id}`);
      debug('proto "request" event [method:%s, data:%o]', request.method, request.data?.id);

      switch (request.method) {
        case "newConsumer": {
          const {
            peerId,
            producerId,
            id,
            kind,
            rtpParameters,
            /*type, */ appData /*, producerPaused */
          } = request.data;

          try {
            const consumer = await this._recvTransport.consume({
              id,
              producerId,
              kind,
              rtpParameters,
              appData: { ...appData, peerId } // Trick.
            });

            // Store in the map.
            this._consumers.set(consumer.id, consumer);

            consumer.on("transportclose", () => {
              this.emitRTCEvent("error", "RTC", () => `Consumer transport closed`);
              this.removeConsumer(consumer.id);
            });

            if (kind === "video") {
              const { spatialLayers, temporalLayers } = mediasoupClient.parseScalabilityMode(
                consumer.rtpParameters.encodings[0].scalabilityMode
              );

              this._consumerStats[consumer.id] = this._consumerStats[consumer.id] || {};
              this._consumerStats[consumer.id]["spatialLayers"] = spatialLayers;
              this._consumerStats[consumer.id]["temporalLayers"] = temporalLayers;
            }

            // We are ready. Answer the protoo request so the server will
            // resume this Consumer (which was paused for now if video).
            accept();

            this.resolvePendingMediaRequestForTrack(peerId, consumer.track);

            // Notify of an stream update event
            this.emit("stream_updated", peerId, kind);
          } catch (err) {
            this.emitRTCEvent("error", "Adapter", () => `Error: ${err}`);
            error('"newConsumer" request failed:%o', err);

            throw err;
          }

          break;
        }
      }
    });

    this._protoo.on("notification", notification => {
      debug('proto "notification" event [method:%s, data:%o]', notification.method, notification.data);

      switch (notification.method) {
        case "newPeer": {
          const peer = notification.data;
          this.newPeer(peer);

          break;
        }

        case "peerClosed": {
          const { peerId } = notification.data;
          this.closePeer(peerId);

          break;
        }

        case "consumerClosed": {
          const { consumerId } = notification.data;
          const consumer = this._consumers.get(consumerId);

          if (!consumer) {
            info(`consumerClosed event received without related consumer: ${consumerId}`);
            break;
          }

          consumer.close();
          this.removeConsumer(consumer.id);

          break;
        }

        case "peerBlocked": {
          const { peerId } = notification.data;
          document.body.dispatchEvent(new CustomEvent("blocked", { detail: { clientId: peerId } }));

          break;
        }

        case "peerUnblocked": {
          const { peerId } = notification.data;
          document.body.dispatchEvent(new CustomEvent("unblocked", { detail: { clientId: peerId } }));

          break;
        }

        case "downlinkBwe": {
          this._downlinkBwe = notification.data;
          break;
        }

        case "consumerLayersChanged": {
          const { consumerId, spatialLayer, temporalLayer } = notification.data;

          const consumer = this._consumers.get(consumerId);

          if (!consumer) {
            info(`consumerLayersChanged event received without related consumer: ${consumerId}`);
            break;
          }

          this._consumerStats[consumerId] = this._consumerStats[consumerId] || {};
          this._consumerStats[consumerId]["spatialLayer"] = spatialLayer;
          this._consumerStats[consumerId]["temporalLayer"] = temporalLayer;

          // TODO: If spatialLayer/temporalLayer are null, that's probably because the current downlink
          // it's not enough forany spatial layer bitrate. In that case the server has paused the consumer.
          // At this point we it would be nice to give the user some visual cue that this stream is paused.
          // ie. A grey overlay with some icon or replacing the video stream por a generic person image.
          break;
        }

        case "consumerScore": {
          const { consumerId, score } = notification.data;

          const consumer = this._consumers.get(consumerId);

          if (!consumer) {
            info(`consumerScore event received without related consumer: ${consumerId}`);
            break;
          }

          this._consumerStats[consumerId] = this._consumerStats[consumerId] || {};
          this._consumerStats[consumerId]["score"] = score;
        }
      }
    });
  }

  newPeer(peer) {
    this._onOccupantConnected(peer.id);
    this.occupants[peer.id] = peer;

    if (this._onOccupantsChanged) {
      this._onOccupantsChanged(this.occupants);
    }
  }

  closePeer(peerId) {
    this._onOccupantDisconnected(peerId);

    const pendingMediaRequests = this._pendingMediaRequests.get(peerId);

    if (pendingMediaRequests) {
      const msg = "The user disconnected before the media stream was resolved.";
      info(msg);

      if (pendingMediaRequests.audio) {
        pendingMediaRequests.audio.resolve(null);
      }

      if (pendingMediaRequests.video) {
        pendingMediaRequests.video.resolve(null);
      }

      this._pendingMediaRequests.delete(peerId);
    }

    delete this.occupants[peerId];

    if (this._onOccupantsChanged) {
      this._onOccupantsChanged(this.occupants);
    }
  }

  shouldStartConnectionTo() {
    return true;
  }

  startStreamConnection() {}

  closeStreamConnection() {}

  resolvePendingMediaRequestForTrack(clientId, track) {
    const requests = this._pendingMediaRequests.get(clientId);

    if (requests && requests[track.kind]) {
      const resolve = requests[track.kind].resolve;
      delete requests[track.kind];
      resolve(new MediaStream([track]));
    }

    if (requests && Object.keys(requests).length === 0) {
      this._pendingMediaRequests.delete(clientId);
    }
  }

  removeConsumer(consumerId) {
    this.emitRTCEvent("info", "RTC", () => `Consumer removed: ${consumerId}`);
    this._consumers.delete(consumerId);
  }

  getConnectStatus(/*clientId*/) {
    return this._protoo.connected ? NAF.adapters.IS_CONNECTED : NAF.adapters.NOT_CONNECTED;
  }

  getMediaStream(clientId, kind = "audio") {
    let track;

    if (this._clientId === clientId) {
      if (kind === "audio" && this._micProducer) {
        track = this._micProducer.track;
      } else if (kind === "video") {
        if (this._cameraProducer && !this._cameraProducer.closed) {
          track = this._cameraProducer.track;
        } else if (this._shareProducer && !this._shareProducer.closed) {
          track = this._shareProducer.track;
        }
      }
    } else {
      this._consumers.forEach(consumer => {
        if (consumer.appData.peerId === clientId && kind == consumer.track.kind) {
          track = consumer.track;
        }
      });
    }

    if (track) {
      debug(`Already had ${kind} for ${clientId}`);
      return Promise.resolve(new MediaStream([track]));
    } else {
      debug(`Waiting on ${kind} for ${clientId}`);
      if (!this._pendingMediaRequests.has(clientId)) {
        this._pendingMediaRequests.set(clientId, {});
      }

      const requests = this._pendingMediaRequests.get(clientId);
      const promise = new Promise((resolve, reject) => (requests[kind] = { resolve, reject }));
      requests[kind].promise = promise;
      promise.catch(e => {
        this.emitRTCEvent("error", "Adapter", () => `getMediaStream error: ${e}`);
        console.warn(`${clientId} getMediaStream Error`, e);
      });
      return promise;
    }
  }

  getServerTime() {
    return Date.now() + this._avgTimeOffset;
  }

  sendData(clientId, dataType, data) {
    this.unreliableTransport(clientId, dataType, data);
  }
  sendDataGuaranteed(clientId, dataType, data) {
    this.reliableTransport(clientId, dataType, data);
  }
  broadcastData(dataType, data) {
    this.unreliableTransport(undefined, dataType, data);
  }
  broadcastDataGuaranteed(dataType, data) {
    this.reliableTransport(undefined, dataType, data);
  }

  setReconnectionListeners(reconnectingListener, reconnectedListener, reconnectionErrorListener) {
    this._reconnectingListener = reconnectingListener;
    this._reconnectedListener = reconnectedListener;
    this._reconnectionErrorListener = reconnectionErrorListener;
  }

  syncOccupants() {
    // Not implemented
  }

  async createSendTransport(iceServers) {
    // Create mediasoup Transport for sending (unless we don't want to produce).
    const sendTransportInfo = await this._protoo.request("createWebRtcTransport", {
      producing: true,
      consuming: false,
      sctpCapabilities: undefined
    });

    this._sendTransport = this._mediasoupDevice.createSendTransport({
      id: sendTransportInfo.id,
      iceParameters: sendTransportInfo.iceParameters,
      iceCandidates: sendTransportInfo.iceCandidates,
      dtlsParameters: sendTransportInfo.dtlsParameters,
      sctpParameters: sendTransportInfo.sctpParameters,
      iceServers,
      iceTransportPolicy: this._iceTransportPolicy,
      proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS
    });

    this._sendTransport.on("connect", (
      { dtlsParameters },
      callback,
      errback // eslint-disable-line no-shadow
    ) => {
      this.emitRTCEvent("info", "RTC", () => `Send transport [connect]`);
      this._sendTransport.observer.on("close", () => {
        this.emitRTCEvent("info", "RTC", () => `Send transport [close]`);
        !this._sendTransport?._closed && this._sendTransport.close();
      });
      this._sendTransport.observer.on("newproducer", producer => {
        this.emitRTCEvent("info", "RTC", () => `Send transport [newproducer]: ${producer.id}`);
      });
      this._sendTransport.observer.on("newconsumer", consumer => {
        this.emitRTCEvent("info", "RTC", () => `Send transport [newconsumer]: ${consumer.id}`);
      });

      this._protoo
        .request("connectWebRtcTransport", {
          transportId: this._sendTransport.id,
          dtlsParameters
        })
        .then(callback)
        .catch(errback);
    });

    this._sendTransport.on("connectionstatechange", connectionState => {
      let level = "info";
      if (connectionState === "failed" || connectionState === "disconnected") {
        level = "error";
      }
      this.emitRTCEvent(level, "RTC", () => `Send transport [connectionstatechange]: ${connectionState}`);

      this.checkSendIceStatus(connectionState);
    });

    this._sendTransport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
      this.emitRTCEvent("info", "RTC", () => `Send transport [produce]: ${kind}`);
      try {
        // eslint-disable-next-line no-shadow
        const { id } = await this._protoo.request("produce", {
          transportId: this._sendTransport.id,
          kind,
          rtpParameters,
          appData
        });

        callback({ id });
      } catch (error) {
        this.emitRTCEvent("error", "Signaling", () => `[produce] error: ${error}`);
        errback(error);
      }
    });

    if (this._localMediaStream) {
      this.createMissingProducers(this._localMediaStream);
    }
  }

  async closeSendTransport() {
    if (this._micProducer) {
      this._micProducer.close();
      this._protoo.connected && this._protoo.request("closeProducer", { producerId: this._micProducer.id });
      this._micProducer = null;
    }

    if (this._videoProducer) {
      this._videoProducer.close();
      this._protoo.connected && this._protoo.request("closeProducer", { producerId: this._videoProducer.id });
      this._videoProducer = null;
    }

    if (!this._sendTransport?._closed) {
      this._sendTransport.close();
    }

    if (this._protoo.connected) {
      try {
        await this._protoo.request("closeWebRtcTransport", { transportId: this._sendTransport?.id });
      } catch (err) {
        error(err);
      }
    }
  }

  async createRecvTransport(iceServers) {
    // Create mediasoup Transport for sending (unless we don't want to consume).
    const recvTransportInfo = await this._protoo.request("createWebRtcTransport", {
      producing: false,
      consuming: true,
      sctpCapabilities: undefined
    });

    this._recvTransport = this._mediasoupDevice.createRecvTransport({
      id: recvTransportInfo.id,
      iceParameters: recvTransportInfo.iceParameters,
      iceCandidates: recvTransportInfo.iceCandidates,
      dtlsParameters: recvTransportInfo.dtlsParameters,
      sctpParameters: recvTransportInfo.sctpParameters,
      iceServers,
      iceTransportPolicy: this._iceTransportPolicy
    });

    this._recvTransport.on("connect", (
      { dtlsParameters },
      callback,
      errback // eslint-disable-line no-shadow
    ) => {
      this.emitRTCEvent("info", "RTC", () => `Receive transport [connect]`);
      this._recvTransport.observer.on("close", () => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [close]`);
        !this._recvTransport?._closed && this._recvTransport.close();
      });
      this._recvTransport.observer.on("newproducer", producer => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [newproducer]: ${producer.id}`);
      });
      this._recvTransport.observer.on("newconsumer", consumer => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [newconsumer]: ${consumer.id}`);
      });

      this._protoo
        .request("connectWebRtcTransport", {
          transportId: this._recvTransport.id,
          dtlsParameters
        })
        .then(callback)
        .catch(errback);
    });

    this._recvTransport.on("connectionstatechange", connectionState => {
      let level = "info";
      if (connectionState === "failed" || connectionState === "disconnected") {
        level = "error";
      }
      this.emitRTCEvent(level, "RTC", () => `Receive transport [connectionstatechange]: ${connectionState}`);

      this.checkRecvIceStatus(connectionState);
    });
  }

  async closeRecvTransport() {
    if (!this._recvTransport?._closed) {
      this._recvTransport.close();
    }
    if (this._protoo.connected) {
      try {
        await this._protoo.request("closeWebRtcTransport", { transportId: this._recvTransport?.id });
      } catch (err) {
        error(err);
      }
    }
  }

  async createMissingConsumers() {
    await this._protoo.request("refreshConsumers");
  }

  async _joinRoom() {
    debug("_joinRoom()");

    try {
      this._mediasoupDevice = new mediasoupClient.Device({});

      const routerRtpCapabilities = await this._protoo.request("getRouterRtpCapabilities");

      await this._mediasoupDevice.load({ routerRtpCapabilities });

      const { host, port, turn } = await window.APP.hubChannel.getHost();
      const iceServers = this.getIceServers(host, port, turn);

      await this.createSendTransport(iceServers);
      await this.createRecvTransport(iceServers);

      const { peers } = await this._protoo.request("join", {
        displayName: this._clientId,
        device: this._device,
        rtpCapabilities: this._mediasoupDevice.rtpCapabilities,
        sctpCapabilities: this._useDataChannel ? this._mediasoupDevice.sctpCapabilities : undefined,
        token: this._joinToken
      });

      this.occupants = {};

      for (let i = 0; i < peers.length; i++) {
        const peerId = peers[i].id;
        this._onOccupantConnected(peerId);
        this.occupants[peerId] = peers[i];
        if (!peers[i].hasProducers) continue;
      }

      this._connectSuccess(this._clientId);

      if (this._onOccupantsChanged) {
        this._onOccupantsChanged(this.occupants);
      }
    } catch (err) {
      this.emitRTCEvent("error", "Adapter", () => `Join room failed: ${error}`);
      error("_joinRoom() failed:%o", err);

      if (!this._reconnectionTimeout) {
        this._reconnectionTimeout = setTimeout(() => this.reconnect(), this._reconnectionDelay);
      }
    }
  }

  setLocalMediaStream(stream) {
    this.createMissingProducers(stream);
  }

  createMissingProducers(stream) {
    this.emitRTCEvent("info", "RTC", () => `Creating missing producers`);

    if (!this._sendTransport) return;
    let sawAudio = false;
    let sawVideo = false;

    stream.getTracks().forEach(async track => {
      if (track.kind === "audio") {
        sawAudio = true;

        // TODO multiple audio tracks?
        if (this._micProducer) {
          if (this._micProducer.track !== track) {
            this._micProducer.track.stop();
            this._micProducer.replaceTrack(track);
          }
        } else {
          if (!this._micEnabled) {
            track.enabled = false;
          }

          await this.enabledMic(track);

          if (!this._micEnabled) {
            this._micProducer.pause();
            this._protoo.request("pauseProducer", { producerId: this._micProducer.id });
          }
        }
      } else {
        sawVideo = true;

        if (track._hubs_contentHint === "share") {
          await this.disableCamera();
          await this.enableShare(track);
        } else if (track._hubs_contentHint === "camera") {
          await this.disableShare();
          await this.enableCamera(track);
        }
      }

      this.resolvePendingMediaRequestForTrack(this._clientId, track);
    });

    if (!sawAudio && this._micProducer) {
      this._micProducer.close();
      this._protoo.request("closeProducer", { producerId: this._micProducer.id });
      this._micProducer = null;
    }

    if (!sawVideo) {
      this.disableCamera();
      this.disableShare();
    }

    this._localMediaStream = stream;
  }

  async enabledMic(track) {
    // stopTracks = false because otherwise the track will end during a temporary disconnect
    this._micProducer = await this._sendTransport.produce({
      track,
      stopTracks: false,
      codecOptions: { opusStereo: false, opusDtx: true },
      zeroRtpOnPause: true,
      disableTrackOnPause: true
    });

    this._micProducer.on("transportclose", () => {
      this.emitRTCEvent("info", "RTC", () => `Mic transport closed`);
      this._micProducer = null;
    });
  }

  async enableCamera(track) {
    // stopTracks = false because otherwise the track will end during a temporary disconnect
    this._cameraProducer = await this._sendTransport.produce({
      track,
      stopTracks: false,
      codecOptions: { videoGoogleStartBitrate: 1000 },
      encodings: WEBCAM_SIMULCAST_ENCODINGS,
      zeroRtpOnPause: true,
      disableTrackOnPause: true
    });

    this._cameraProducer.on("transportclose", () => {
      this.emitRTCEvent("info", "RTC", () => `Camera transport closed`);
      this.disableCamera();
    });
    this._cameraProducer.observer.on("trackended", () => {
      this.emitRTCEvent("info", "RTC", () => `Camera track ended`);
      this.disableCamera();
    });
  }

  async disableCamera() {
    if (!this._cameraProducer) return;

    this._cameraProducer.close();

    try {
      if (!this._sendTransport.closed) {
        await this._protoo.request("closeProducer", { producerId: this._cameraProducer.id });
      }
    } catch (error) {
      console.error(`disableCamera(): ${error}`);
    }

    this._cameraProducer = null;
  }

  async enableShare(track) {
    // stopTracks = false because otherwise the track will end during a temporary disconnect
    this._shareProducer = await this._sendTransport.produce({
      track,
      stopTracks: false,
      codecOptions: { videoGoogleStartBitrate: 1000 },
      encodings: SCREEN_SHARING_SIMULCAST_ENCODINGS,
      zeroRtpOnPause: true,
      disableTrackOnPause: true,
      appData: {
        share: true
      }
    });

    this._shareProducer.on("transportclose", () => {
      this.emitRTCEvent("info", "RTC", () => `Desktop Share transport closed`);
      this.disableShare();
    });
    this._shareProducer.observer.on("trackended", () => {
      this.emitRTCEvent("info", "RTC", () => `Desktop Share transport track ended`);
      this.disableShare();
    });
  }

  async disableShare() {
    if (!this._shareProducer) return;

    this._shareProducer.close();

    try {
      if (!this._sendTransport.closed) {
        await this._protoo.request("closeProducer", { producerId: this._shareProducer.id });
      }
    } catch (error) {
      console.error(`disableShare(): ${error}`);
    }

    this._shareProducer = null;
  }

  enableMicrophone(enabled) {
    if (this._micProducer) {
      if (enabled) {
        this._micProducer.resume();
        this._protoo.request("resumeProducer", { producerId: this._micProducer.id });
      } else {
        this._micProducer.pause();
        this._protoo.request("pauseProducer", { producerId: this._micProducer.id });
      }
    }

    this._micEnabled = enabled;

    window.APP.store.update({
      settings: { micMuted: !this._micEnabled }
    });
  }

  setWebRtcOptions() {
    // Not implemented
  }

  isDisconnected() {
    return !this._protoo.connected;
  }

  disconnect() {
    if (this._closed) return;

    this._closed = true;

    const occupantIds = Object.keys(this.occupants);
    for (let i = 0; i < occupantIds.length; i++) {
      const peerId = occupantIds[i];
      if (peerId === this._clientId) continue;
      this._onOccupantDisconnected(peerId);
    }

    this.occupants = {};

    if (this._onOccupantsChanged) {
      this._onOccupantsChanged(this.occupants);
    }

    debug("disconnect()");

    // Close protoo Peer, though may already be closed if this is happening due to websocket breakdown
    if (this._protoo && this._protoo.connected) {
      this._protoo.close();
      this.emitRTCEvent("info", "Signaling", () => `[close]`);
    }

    // Close mediasoup Transports.
    this.closeSendTransport();
    this.closeRecvTransport();

    this._lastRecvConnectionState = null;
    this._lastSendConnectionState = null;
  }

  reconnect() {
    // Dispose of all networked entities and other resources tied to the session.
    this.disconnect();

    this.connect()
      .then(() => {
        this._reconnectionDelay = INITIAL_ROOM_RECONNECTION_INTERVAL;
        this._reconnectionAttempts = 0;

        if (this._reconnectedListener) {
          this._reconnectedListener();
        }

        clearInterval(this._reconnectionTimeout);
        this._reconnectionTimeout = null;
      })
      .catch(error => {
        this._reconnectionDelay += 1000;
        this._reconnectionAttempts++;

        if (this._reconnectionAttempts > this.max_reconnectionAttempts && this._reconnectionErrorListener) {
          return this._reconnectionErrorListener(
            new Error("Connection could not be reestablished, exceeded maximum number of reconnection attempts.")
          );
        }

        this.emitRTCEvent("warn", "Adapter", () => `Error during reconnect, retrying: ${error}`);
        console.warn("Error during reconnect, retrying.");
        console.warn(error);

        if (this._reconnectingListener) {
          this._reconnectingListener(this._reconnectionDelay);
        }

        if (!this._reconnectionTimeout) {
          this._reconnectionTimeout = setTimeout(() => this.reconnect(), this._reconnectionDelay);
        }
      });
  }

  kick(clientId, permsToken) {
    return this._protoo
      .request("kick", {
        room_id: this.room,
        user_id: clientId,
        token: permsToken
      })
      .then(() => {
        document.body.dispatchEvent(new CustomEvent("kicked", { detail: { clientId: clientId } }));
      });
  }

  block(clientId) {
    return this._protoo.request("block", { whom: clientId }).then(() => {
      this._blockedClients.set(clientId, true);
      document.body.dispatchEvent(new CustomEvent("blocked", { detail: { clientId: clientId } }));
    });
  }

  unblock(clientId) {
    return this._protoo.request("unblock", { whom: clientId }).then(() => {
      this._blockedClients.delete(clientId);
      document.body.dispatchEvent(new CustomEvent("unblocked", { detail: { clientId: clientId } }));
    });
  }

  async updateTimeOffset() {
    if (this.isDisconnected()) return;

    const clientSentTime = Date.now();

    const res = await fetch(document.location.href, {
      method: "HEAD",
      cache: "no-cache"
    });

    const precision = 1000;
    const serverReceivedTime = new Date(res.headers.get("Date")).getTime() + precision / 2;
    const clientReceivedTime = Date.now();
    const serverTime = serverReceivedTime + (clientReceivedTime - clientSentTime) / 2;
    const timeOffset = serverTime - clientReceivedTime;

    this._serverTimeRequests++;

    if (this._serverTimeRequests <= 10) {
      this._timeOffsets.push(timeOffset);
    } else {
      this._timeOffsets[this._serverTimeRequests % 10] = timeOffset;
    }

    this._avgTimeOffset = this._timeOffsets.reduce((acc, offset) => (acc += offset), 0) / this._timeOffsets.length;

    if (this._serverTimeRequests > 10) {
      debug(`new server time offset: ${this._avgTimeOffset}ms`);
      setTimeout(() => this.updateTimeOffset(), 5 * 60 * 1000); // Sync clock every 5 minutes.
    } else {
      this.updateTimeOffset();
    }
  }

  toggleFreeze() {
    if (this.frozen) {
      this.unfreeze();
    } else {
      this.freeze();
    }
  }

  freeze() {
    this.frozen = true;
  }

  unfreeze() {
    this.frozen = false;
    this.flushPendingUpdates();
  }

  storeMessage(message) {
    if (message.dataType === "um") {
      // UpdateMulti
      for (let i = 0, l = message.data.d.length; i < l; i++) {
        this.storeSingleMessage(message, i);
      }
    } else {
      this.storeSingleMessage(message);
    }
  }

  storeSingleMessage(message, index) {
    const data = index !== undefined ? message.data.d[index] : message.data;
    const dataType = message.dataType;

    const networkId = data.networkId;

    if (!this._frozenUpdates.has(networkId)) {
      this._frozenUpdates.set(networkId, message);
    } else {
      const storedMessage = this._frozenUpdates.get(networkId);
      const storedData =
        storedMessage.dataType === "um" ? this.dataForUpdateMultiMessage(networkId, storedMessage) : storedMessage.data;

      // Avoid updating components if the entity data received did not come from the current owner.
      const isOutdatedMessage = data.lastOwnerTime < storedData.lastOwnerTime;
      const isContemporaneousMessage = data.lastOwnerTime === storedData.lastOwnerTime;
      if (isOutdatedMessage || (isContemporaneousMessage && storedData.owner > data.owner)) {
        return;
      }

      if (dataType === "r") {
        const createdWhileFrozen = storedData && storedData.isFirstSync;
        if (createdWhileFrozen) {
          // If the entity was created and deleted while frozen, don't bother conveying anything to the consumer.
          this._frozenUpdates.delete(networkId);
        } else {
          // Delete messages override any other messages for this entity
          this._frozenUpdates.set(networkId, message);
        }
      } else {
        // merge in component updates
        if (storedData.components && data.components) {
          Object.assign(storedData.components, data.components);
        }
      }
    }
  }

  onDataChannelMessage(e, source) {
    this.onData(JSON.parse(e.data), source);
  }

  onData(message, source) {
    if (debug.enabled) {
      debug(`DC in: ${message}`);
    }

    if (!message.dataType) return;

    message.source = source;

    if (this.frozen) {
      this.storeMessage(message);
    } else {
      this._onOccupantMessage(null, message.dataType, message.data, message.source);
    }
  }

  getPendingData(networkId, message) {
    if (!message) return null;

    const data = message.dataType === "um" ? this.dataForUpdateMultiMessage(networkId, message) : message.data;

    // Ignore messages from users that we may have blocked while frozen.
    if (data.owner && this._blockedClients.has(data.owner)) return null;

    return data;
  }

  // Used externally
  getPendingDataForNetworkId(networkId) {
    return this.getPendingData(networkId, this._frozenUpdates.get(networkId));
  }

  flushPendingUpdates() {
    for (const [networkId, message] of this._frozenUpdates) {
      const data = this.getPendingData(networkId, message);
      if (!data) continue;

      // Override the data type on "um" messages types, since we extract entity updates from "um" messages into
      // individual frozenUpdates in storeSingleMessage.
      const dataType = message.dataType === "um" ? "u" : message.dataType;

      this._onOccupantMessage(null, dataType, data, message.source);
    }
    this._frozenUpdates.clear();
  }

  dataForUpdateMultiMessage(networkId, message) {
    // "d" is an array of entity datas, where each item in the array represents a unique entity and contains
    // metadata for the entity, and an array of components that have been updated on the entity.
    // This method finds the data corresponding to the given networkId.
    for (let i = 0, l = message.data.d.length; i < l; i++) {
      const data = message.data.d[i];

      if (data.networkId === networkId) {
        return data;
      }
    }

    return null;
  }

  emitRTCEvent(level, tag, msgFunc) {
    if (!window.APP.store.state.preferences.showRtcDebugPanel) return;
    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    this.scene.emit("rtc_event", { level, tag, time, msg: msgFunc() });
  }
}

NAF.adapters.register("dialog", DialogAdapter);
