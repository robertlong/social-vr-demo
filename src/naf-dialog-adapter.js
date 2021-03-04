import * as mediasoupClient from "mediasoup-client";
import protooClient from "protoo-client";
import { debug as newDebug } from "debug";

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

const ICE_RECONNECT_INTERVAL = 2000;
const INITIAL_ROOM_RECONNECTION_INTERVAL = 2000;

const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

export default class DialogAdapter {
  constructor() {
    this._timeOffsets = [];
    this._occupants = {};
    this._micProducer = null;
    this._videoProducer = null;
    this._mediaStreams = {};
    this._localMediaStream = null;
    this._consumers = new Map();
    this._frozenUpdates = new Map();
    this._pendingMediaRequests = new Map();
    this._micEnabled = true;
    this._initialAudioConsumerPromise = null;
    this._initialAudioConsumerResolvers = new Map();
    this._serverTimeRequests = 0;
    this._avgTimeOffset = 0;
    this._blockedClients = new Map();
    this.type = "dialog";
    this.occupants = {}; // This is a public field
    this._forceTcp = false;
    this._forceTurn = false;
    this._iceTransportPolicy = "all";
    this._iceReconnectSendTaskId = null;
    this._iceReconnectRecvTaskId = null;
    this._reconnectionDelay = INITIAL_ROOM_RECONNECTION_INTERVAL;
    this._reconnectionTimeout = null;
    this._reconnectionAttempts = 0;
    this._lastSendConnectionState = null;
    this._lastRecvConnectionState = null;
    this._sendTaskId = null;
    this._recvTaskId = null;
    this._closed = true;
    this.scene = document.querySelector("a-scene");
    this._webcams = {}; // { [consumerId]: {stream,order}, ["mine"]: {}}
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

  /**
   * This applies to the ICE restart method below.
   * Why do we need new ICE servers? In case the ICE fails we need to re-negotiate new candidates
   * but most likely our TURN credentials have expired so we need to request new credentials and
   * update the TURN servers to be able to gather new candidates.
   * Firefox doesn't support hot updating ICE servers through mediasoup's updateIceServers (which
   * internally uses setConfiguration):
   * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setConfiguration
   * So we recreate the transports/consumer/producers through reconnect to force setting
   * new ICE servers for both send and receive transports.
   */

  /**
   * Restart ICE in the underlying send peerconnection.
   */
  async restartSendICE(force = true) {
    if (!this._sendTransport?._closed) {
      // Renegotiate ICE in case ICE state is "failed".
      // Chrome doesn't seem to automatically reconnect after a "disconnected" so we renegotiate in that case.
      // We also try to renegotiate in case we got stuck in a new state after an ICE failure.
      if (
        force ||
        this._sendTransport.connectionState === "failed" ||
        (!isFirefox && this._sendTransport.connectionState === "disconnected") ||
        (this._sendTransport.connectionState === "new" && this._lastSendConnectionState === "failed")
      ) {
        this.emitRTCEvent("log", "RTC", () => `Restarting send transport ICE`);
        if (this._protoo.connected) {
          if (isFirefox) {
            this.reconnect();
          } else if (!this._sendTransport.closed) {
            const { host, port, turn } = await window.APP.hubChannel.getHost();
            const iceServers = this.getIceServers(host, port, turn);
            await this._sendTransport.updateIceServers({ iceServers });
            const iceParameters = await this._protoo.request("restartIce", { transportId: this._sendTransport.id });
            await this._sendTransport.restartIce({ iceParameters });
          }
        }
      }
    }
  }

  /**
   * Checks the Send Transport ICE status and restarts it in case is in failed or disconnected states.
   * This is called by the Send Transport "connectionstatechange" event listener.
   * @param {boolean} connectionState The transport connnection state (ICE connection state)
   */
  checkSendIceStatus(connectionState) {
    // If the ICE connection state failed we force an ICE negotiation
    if (connectionState === "failed" || connectionState === "disconnected") {
      this.restartSendICE(false);
    } else if (connectionState === "connected") {
      this._iceReconnectSendTaskId && clearTimeout(this._iceReconnectSendTaskId);
      this._iceReconnectSendTaskId = null;
    }

    this._lastSendConnectionState = connectionState;
  }

  /**
   * Starts a watchdog to monitorize the state of the Send Transport ICE connection state.
   * @param {boolean} force Forces the execution of the reconnect.
   */
  startSendIceConnectionStateWd(force = false) {
    if (force) {
      this.reconnect();
    } else {
      if (!this._sendTaskId) {
        this._sendTaskId = setInterval(() => {
          this.restartSendICE(false);
        }, ICE_RECONNECT_INTERVAL);
      }
    }
  }

  /**
   * Stops the Send Transport ICE connection state watchdog.
   */
  stopSendIceConnectionStateWd() {
    this._sendTaskId && clearInterval(this._sendTaskId);
    this._sendTaskId = null;
  }

  /**
   * Restart ICE in the underlying receive peerconnection.
   * @param {boolean} force Forces the execution of the reconnect.
   */
  async restartRecvICE(force = true) {
    // Renegotiate ICE in case ICE state is "failed".
    // Chrome doesn't seem to automatically reconnect after a "disconnected" so we renegotiate in that case.
    // We also try to renegotiate in case we got stuck in a new state after an ICE failure.
    if (!this._recvTransport?._closed) {
      if (
        force ||
        this._recvTransport.connectionState === "failed" ||
        (!isFirefox && this._recvTransport.connectionState === "disconnected") ||
        (this._recvTransport.connectionState === "new" && this._lastRecvConnectionState === "failed")
      ) {
        this.emitRTCEvent("log", "RTC", () => `Restarting receive transport ICE`);
        if (this._protoo.connected) {
          if (isFirefox) {
            this.reconnect();
          } else if (!this._recvTransport.closed) {
            const { host, port, turn } = await window.APP.hubChannel.getHost();
            const iceServers = this.getIceServers(host, port, turn);
            await this._recvTransport.updateIceServers({ iceServers });
            const iceParameters = await this._protoo.request("restartIce", { transportId: this._recvTransport.id });
            await this._recvTransport.restartIce({ iceParameters });
          }
        }
      }
    }
  }

  /**
   * Checks the Send Transport ICE status and restarts it in case is in failed or disconnected states.
   * This is called by the Send Transport "connectionstatechange" event listener.
   * @param {boolean} connectionState The transport connection state (ICE connection state)
   */
  checkRecvIceStatus(connectionState) {
    // If the ICE connection state failed we force an ICE negotiation
    if (connectionState === "failed" || connectionState === "disconnected") {
      this.restartRecvICE(false);
    } else if (connectionState === "connected") {
      this._iceReconnectRecvTaskId && clearTimeout(this._iceReconnectRecvTaskId);
      this._iceReconnectRecvTaskId = null;
    }

    this._lastRecvConnectionState = connectionState;
  }

  /**
   * Starts a watchdog to monitorize the state of the Receive Transport ICE connection state.
   * @param {boolean} force Forces the execution of the reconnect.
   */
  startRecvIceConnectionStateWd(force = false) {
    if (force) {
      this.reconnect();
    } else {
      if (!this._recvTaskId) {
        this._recvTaskId = setInterval(() => {
          this.restartRecvICE(false);
        }, ICE_RECONNECT_INTERVAL);
      }
    }
  }

  /**
   * Stops the Receive Transport ICE connection state watchdog.
   */
  stopRecvIceConnectionStateWd() {
    this._recvTaskId && clearInterval(this._recvTaskId);
    this._recvTaskId = null;
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
              this.removeWebcam(consumer.id);

              console.log("NAF dialog adapter.js request(): transportclosed");
              // console.log("producerId: " + producerId);
              // console.log("consumer.id: " + consumer.id);
              // console.log("peerId: " + peerId);
            });

            // We are ready. Answer the protoo request so the server will
            // resume this Consumer (which was paused for now if video).
            accept();

            // console.log("case newConsumer");
            // console.log("producerId: " + producerId);
            // console.log("consumer.id: " + consumer.id);
            // console.log("peerId: " + peerId);

            this.resolvePendingMediaRequestForTrack(peerId, consumer.track, consumer.id);

            if (kind === "video") {
              console.log("Is video stream");
            }

            if (kind === "audio") {
              const initialAudioResolver = this._initialAudioConsumerResolvers.get(peerId);

              if (initialAudioResolver) {
                initialAudioResolver();
                this._initialAudioConsumerResolvers.delete(peerId);
              }
            }
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
          this._onOccupantConnected(peer.id);
          this.occupants[peer.id] = peer;

          if (this._onOccupantsChanged) {
            this._onOccupantsChanged(this.occupants);
          }

          break;
        }

        case "peerClosed": {
          const { peerId } = notification.data;
          this._onOccupantDisconnected(peerId);

          const pendingMediaRequests = this._pendingMediaRequests.get(peerId);

          if (pendingMediaRequests) {
            const msg = "The user disconnected before the media stream was resolved.";
            info(msg);

            if (pendingMediaRequests.audio) {
              pendingMediaRequests.audio.resolve(null);
            }

            if (pendingMediaRequests.video) {
              console.log("case peerClosed");
              console.log("pendingMediaRequests.video");
              pendingMediaRequests.video.resolve(null);
            }

            this._pendingMediaRequests.delete(peerId);
          }

          // Resolve initial audio resolver since this person left.
          const initialAudioResolver = this._initialAudioConsumerResolvers.get(peerId);

          if (initialAudioResolver) {
            initialAudioResolver();

            this._initialAudioConsumerResolvers.delete(peerId);
          }

          delete this.occupants[peerId];

          if (this._onOccupantsChanged) {
            this._onOccupantsChanged(this.occupants);
          }

          break;
        }

        case "consumerClosed": {
          const { consumerId } = notification.data;

          const consumer = this._consumers.get(consumerId);

          consumer.close();
          this.removeConsumer(consumer.id);
          this.removeWebcam(consumer.id);

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
      }
    });

    await Promise.all([this.updateTimeOffset(), this._initialAudioConsumerPromise]);
  }

  removeWebcam(consumerId) {
    console.log("removeWebCam()");
    console.log("removeWebCam() consumerId: " + consumerId);
    // const video = document.getElementById("webcam-feed-" + consumerId);
    // console.log(video);
    const webcam = this._webcams[consumerId];
    if (webcam) {
      delete this._webcams[consumerId];
    } else {
      // doesn't exist
      console.error("The consumerId doesnt exist to delete webcam");
    }
    this.scene.emit("webcams-changed");
    // if (video) {
    //   console.log("video exists");
    //   console.log(video);
    //   video.remove();
    // }
  }

  removeMyWebcam() {
    console.log("removeMyWebCam()");
    this.removeWebcam("mine");
  }

  addWebcam(consumerId, stream) {
    // consumerId | mine
    // consumerId or mine
    console.log("addWebcam()");
    console.log("clientId: " + consumerId);
    const webcam = this._webcams[consumerId];
    if (!webcam) {
      this._webcams[consumerId] = { consumerId, stream, order: -1 };
    } else {
      // exists
      this._webcams[consumerId].stream = stream;
    }
    this.scene.emit("webcams-changed");
  }

  shouldStartConnectionTo() {
    return true;
  }
  startStreamConnection() {}

  closeStreamConnection() {}

  resolvePendingMediaRequestForTrack(clientId, track, consumerId) {
    const requests = this._pendingMediaRequests.get(clientId);
    console.log("resolvePendingMediaRequestForTrack()");
    console.log(0);

    if (requests && requests[track.kind]) {
      console.log(1);
      const resolve = requests[track.kind].resolve;
      delete requests[track.kind];

      const stream = new MediaStream([track]);

      if (track.kind === "video") {
        console.log(2);
        // this.addWebcam(clientId, stream);
        if (consumerId === undefined) this.addWebcam("mine", stream);
        else this.addWebcam(consumerId, stream);
      }
      resolve(stream);
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
    console.log("naf getmediastream()");
    console.log("my clientId: " + this._clientId);
    let track;

    // _clientId is mine,
    // compare with peerId for each consumer

    if (this._clientId === clientId) {
      if (kind === "audio" && this._micProducer) {
        track = this._micProducer.track;
      } else if (kind === "video" && this._videoProducer) {
        track = this._videoProducer.track;
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

  async _joinRoom() {
    debug("_joinRoom()");

    try {
      this._mediasoupDevice = new mediasoupClient.Device({});

      const routerRtpCapabilities = await this._protoo.request("getRouterRtpCapabilities");

      await this._mediasoupDevice.load({ routerRtpCapabilities });

      const { host, port, turn } = await window.APP.hubChannel.getHost();
      const iceServers = this.getIceServers(host, port, turn);

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

      const { peers } = await this._protoo.request("join", {
        displayName: this._clientId,
        device: this._device,
        rtpCapabilities: this._mediasoupDevice.rtpCapabilities,
        sctpCapabilities: this._useDataChannel ? this._mediasoupDevice.sctpCapabilities : undefined,
        token: this._joinToken
      });

      const audioConsumerPromises = [];
      this.occupants = {};

      // Create a promise that will be resolved once we attach to all the initial consumers.
      // This will gate the connection flow until all voices will be heard.
      for (let i = 0; i < peers.length; i++) {
        const peerId = peers[i].id;
        this._onOccupantConnected(peerId);
        this.occupants[peerId] = peers[i];
        if (!peers[i].hasProducers) continue;
        audioConsumerPromises.push(new Promise(res => this._initialAudioConsumerResolvers.set(peerId, res)));
      }

      this._connectSuccess(this._clientId);
      this._initialAudioConsumerPromise = Promise.all(audioConsumerPromises);

      if (this._onOccupantsChanged) {
        this._onOccupantsChanged(this.occupants);
      }

      if (this._localMediaStream) {
        this.createMissingProducers(this._localMediaStream);
      }
    } catch (err) {
      this.emitRTCEvent("error", "Adapter", () => `Join room failed: ${error}`);
      error("_joinRoom() failed:%o", err);

      if (!this._reconnectionTimeout) {
        this._reconnectionTimeout = setTimeout(() => this.reconnect(), this._reconnectionDelay);
      }
    }

    // Start the ICE connection state watchdogs
    this.startSendIceConnectionStateWd();
    this.startRecvIceConnectionStateWd();
  }

  setLocalMediaStream(stream) {
    this.createMissingProducers(stream);
    console.log("setLocalMediaStream()");
    console.log(stream);
  }

  createMissingProducers(stream) {
    this.emitRTCEvent("info", "RTC", () => `Creating missing producers`);
    console.log("createMissingProducers()");
    console.log(stream);

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

          // stopTracks = false because otherwise the track will end during a temporary disconnect
          this._micProducer = await this._sendTransport.produce({
            track,
            stopTracks: false,
            zeroRtpOnPause: true,
            disableTrackOnPause: true,
            codecOptions: { opusStereo: false, opusDtx: true }
          });

          this._micProducer.on("transportclose", () => {
            this.emitRTCEvent("info", "RTC", () => `Mic transport closed`);
            this._micProducer = null;
          });

          if (!this._micEnabled) {
            this._micProducer.pause();
            this._protoo.request("pauseProducer", { producerId: this._micProducer.id });
          }
        }
      } else {
        console.log("createMissingProducers() sawVideo");
        console.log(stream);

        sawVideo = true;

        if (this._videoProducer) {
          if (this._videoProducer.track !== track) {
            this._videoProducer.track.stop();
            this._videoProducer.replaceTrack(track);
          }
        } else {
          // TODO simulcasting

          // stopTracks = false because otherwise the track will end during a temporary disconnect
          this._videoProducer = await this._sendTransport.produce({
            track,
            stopTracks: false,
            zeroRtpOnPause: true,
            disableTrackOnPause: true,
            codecOptions: { videoGoogleStartBitrate: 1000 }
          });

          this._videoProducer.on("transportclose", () => {
            console.log("transportclose my _videoProducer");
            this.emitRTCEvent("info", "RTC", () => `Video transport closed`);
            this._videoProducer = null;
          });
        }
      }

      this.resolvePendingMediaRequestForTrack(this._clientId, track);
    });

    if (!sawAudio && this._micProducer) {
      this._micProducer.close();
      this._protoo.request("closeProducer", { producerId: this._micProducer.id });
      this._micProducer = null;
    }

    if (!sawVideo && this._videoProducer) {
      this._videoProducer.close();
      this._protoo.request("closeProducer", { producerId: this._videoProducer.id });
      this._videoProducer = null;
    }

    this._localMediaStream = stream;
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
    if (!this._sendTransport?._closed) this._sendTransport.close();
    if (!this._recvTransport?._closed) this._recvTransport.close();

    // Stop the ICE connection state watchdogs.
    this.stopSendIceConnectionStateWd();
    this.stopRecvIceConnectionStateWd();

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
