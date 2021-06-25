import React, { Component } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { DataPanel } from "./DataPanel.js";
import { CollapsiblePanel } from "./CollapsiblePanel.js";
import { Button } from "../input/Button.js";
import styles from "./RtcDebugPanel.scss";
import { FormattedMessage } from "react-intl";
import { AudioDebugPanel } from "./AudioDebugPanel";

const isMobile = AFRAME.utils.device.isMobile();

const TransportType = {
  SEND: "send_transport",
  RECEIVE: "receive_transport"
};

const StatsType = {
  INBOUND_RTP: "inbound-rtp",
  OUTBOUND_RTP: "outbound-rtp",
  LOCAL_CANDIDATE: "local-candidate",
  REMOTE_CANDIDATE: "remote-candidate",
  CANDIDATE_PAIR: "candidate-pair",
  TRANSPORT: "transport"
};

const ERROR_COLOR = "#8b1c00";
const STATS_REFRESH_TIME = 2000;
const PRODUCERS_KEY = "producers";
const CONSUMERS_KEY = "consumers";
const MEDIASOUP_DOC_BASE_URL = "https://mediasoup.org/documentation/v3/libmediasoupclient/api/";
const MDN_DOC_BASE_URL = "https://developer.mozilla.org/en-US/docs/Web/API/";

const MessageButtonStyle = {
  width: "auto",
  alignSelf: "center",
  margin: "5px",
  padding: "4px 18px",
  fontSize: "12px",
  minWidth: "120px"
};

const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

function capitalize(str) {
  return str ? str.replace(/\b\w/g, c => c.toUpperCase()) : "";
}

function download(filename, text) {
  const element = document.createElement("a");
  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

export function PanelMessageButton({ children, ...rest }) {
  return (
    <Button {...rest} style={MessageButtonStyle}>
      {children}
    </Button>
  );
}

PanelMessageButton.propTypes = {
  children: PropTypes.node
};

function TrackStatsPanel({ title, data, xAxis, yAxis, stats }) {
  const props = {
    id: data.id,
    opened: data.opened,
    paused: data.paused,
    kind: data.kind,
    codec: data.codec
  };
  if (data.kind === "video") {
    (data.spatialLayer !== undefined || data.temporalLayer !== undefined) &&
      (props["currentLayers"] = `S[${data.spatialLayer}] T[${data.temporalLayer}]`);
    data.score != undefined &&
      (props["score"] = `S[${data.score?.score}] P[${data.score?.producerScore}][${data.score?.producerScores}]`);
    data.frameRate != undefined && (props["frameRate"] = `${data.frameRate}`);
    data.width != undefined && (props["width"] = `${data.width}`);
    data.height != undefined && (props["height"] = `${data.height}`);
  }

  const backgroundColor = !data.opened || !stats?.speed ? ERROR_COLOR : null;
  return (
    <DataPanel title={title} data={props} backgroundColor={backgroundColor}>
      {data?.track && (
        <DataPanel
          key={data.id}
          data={data.track}
          title={<FormattedMessage id="rtc-debug-panel.track-panel-title" defaultMessage="Track" />}
        />
      )}
      {stats && (
        <DataPanel
          key={stats.rtpStats?.id}
          graphData={stats.graph.slice()}
          width={"120px"}
          height={"50px"}
          color={"green"}
          speed={stats.speed}
          data={stats.rtpStats}
          xAxis={xAxis}
          yAxis={yAxis}
          title={<FormattedMessage id="rtc-debug-panel.stats-panel-title" defaultMessage="Stats" />}
        />
      )}
    </DataPanel>
  );
}

TrackStatsPanel.propTypes = {
  title: PropTypes.node,
  data: PropTypes.object,
  xAxis: PropTypes.string,
  yAxis: PropTypes.string,
  stats: PropTypes.object,
  backgroundColor: PropTypes.string
};

function TransportPanel({ title, data, candidates, producers, consumers, isButtonEnabled, onRestart }) {
  const error = producers?.some(producer => {
    return !producer.props?.data?.opened || !producer.props?.stats?.speed;
  });
  const backgroundColor = error ? ERROR_COLOR : null;
  return (
    <CollapsiblePanel key={title} title={title} border url={`${MEDIASOUP_DOC_BASE_URL}#Transport`} data={data}>
      <PanelMessageButton onClick={onRestart} disabled={!isButtonEnabled} preset="accept">
        <FormattedMessage id="rtc-debug-panel.restart-ice-button" defaultMessage="Restart ICE" />
      </PanelMessageButton>
      <CollapsiblePanel
        key={`Candidates`}
        title={<FormattedMessage id="rtc-debug-panel.local-candidates-panel-title" defaultMessage="Candidates" />}
        row
        url={`${MDN_DOC_BASE_URL}RTCIceCandidate`}
        border
        backgroundColor={candidates?.length === 0 && data?.state === "connected" && data?.opened ? ERROR_COLOR : null}
      >
        {(candidates?.length && candidates) || (
          <p className={classNames(styles.rtcLogMsg)}>
            <FormattedMessage id="rtc-debug-panel.local-no-candidates-message" defaultMessage="No Candidates" />
          </p>
        )}
      </CollapsiblePanel>
      {(producers?.length && (
        <CollapsiblePanel
          key={`Local producers`}
          title={<FormattedMessage id="rtc-debug-panel.local-producers-panel-title" defaultMessage="Local Producers" />}
          row
          url={`${MEDIASOUP_DOC_BASE_URL}#Producer`}
          border
          collapsed
          backgroundColor={backgroundColor}
        >
          {producers}
        </CollapsiblePanel>
      )) ||
        null}
      {consumers || null}
    </CollapsiblePanel>
  );
}

TransportPanel.propTypes = {
  candidates: PropTypes.array,
  producers: PropTypes.array,
  consumers: PropTypes.array,
  data: PropTypes.object,
  onRestart: PropTypes.func,
  title: PropTypes.node,
  isButtonEnabled: PropTypes.bool
};

function SignalingPanel({ data, onConnect, onDisconnect }) {
  return (
    <CollapsiblePanel
      title={<FormattedMessage id="rtc-debug-panel.signaling-panel-title" defaultMessage="Signaling" />}
      border
      data={data}
    >
      <PanelMessageButton
        onClick={() => {
          if (data.connected) {
            onDisconnect();
          } else {
            onConnect();
          }
        }}
        disabled={false}
        preset="accept"
      >
        {data.connected ? (
          <FormattedMessage id="rtc-debug-panel.disconnect-signaling-button" defaultMessage="Disconnect" />
        ) : (
          <FormattedMessage id="rtc-debug-panel.connect-signaling-button" defaultMessage="Connect" />
        )}
      </PanelMessageButton>
    </CollapsiblePanel>
  );
}

SignalingPanel.propTypes = {
  data: PropTypes.object,
  onConnect: PropTypes.func,
  onDisconnect: PropTypes.func
};

export default class RtcDebugPanel extends Component {
  static propTypes = {
    avatarId: PropTypes.string,
    store: PropTypes.object,
    scene: PropTypes.object,
    intl: PropTypes.object,
    presences: PropTypes.object,
    history: PropTypes.object,
    sessionId: PropTypes.string,
    showRtcDebug: PropTypes.bool,
    showAudioDebug: PropTypes.bool
  };

  constructor() {
    super();

    this.state = {
      log: [],
      collapsed: { Local: false, Log: isMobile, Remote: true, Audio: false }
    };
  }

  componentDidMount() {
    this.props.scene.addEventListener("rtc_event", this.logEvent);
    this.props.store.addEventListener("statechanged", this.storeUpdated);
    this.runStats(true);
  }

  componentWillUnmount() {
    this.props.scene.removeEventListener("rtc_event", this.logEvent);
    this.props.store.removeEventListener("statechanged", this.storeUpdated);
    this.runStats(false);
  }

  logEvent = e => {
    const currentLog = this.state.log.slice(-200) || [];
    currentLog.push(e.detail);
    this.setState({
      log: currentLog
    });
  };

  storeUpdated = () => {
    const showPanel = this.props.store.state.preferences["showRtcDebugPanel"];
    this.setState({ showPanel: showPanel });
  };

  getDeviceData() {
    let result = {};
    const device = APP.dialog._mediasoupDevice;
    if (device) {
      result["loaded"] = !device._closed ? true : false;
      result["codecs"] = device._recvRtpCapabilities?.codecs.map(
        codec => "[" + codec.mimeType + "/" + codec.clockRate + "]"
      );
      result = {
        ...result,
        ...APP.dialog.downlinkBwe
      };
    }
    return result;
  }

  async getCandidatesData(peer) {
    const result = {};
    const stats = await peer.getStats();
    let selectedCandidatePairId = null;
    if (!isFirefox) {
      for (const data of stats.values()) {
        if (data["type"] === StatsType.TRANSPORT) {
          selectedCandidatePairId = data["selectedCandidatePairId"];
        }
      }
    }
    for (const data of stats.values()) {
      if (data["type"] === StatsType.CANDIDATE_PAIR) {
        const candidatePair = data;
        let isCandidate = false;
        if (isFirefox) {
          isCandidate = candidatePair && candidatePair["selected"] && candidatePair["state"] === "succeeded";
        } else {
          isCandidate = candidatePair["id"] === selectedCandidatePairId;
        }
        if (isCandidate) {
          for (const values of stats.values()) {
            if (candidatePair["localCandidateId"] === values["id"]) {
              result[StatsType.LOCAL_CANDIDATE] = values;
            } else if (candidatePair["remoteCandidateId"] === values["id"]) {
              result[StatsType.REMOTE_CANDIDATE] = values;
            }
          }
        }
      }
    }
    return result;
  }

  async getTransportData(type) {
    const result = {};
    let transport;
    if (type === TransportType.SEND) {
      transport = APP.dialog._sendTransport;
    } else if (type === TransportType.RECEIVE) {
      transport = APP.dialog._recvTransport;
    }
    const opened = (transport && !transport._closed && true) || false;
    result["opened"] = opened;
    if (transport) {
      result["state"] = opened ? transport._connectionState : "closed";
      result["id"] = transport._id;
      result[PRODUCERS_KEY] = [];
      result[CONSUMERS_KEY] = [];
      transport._producers.forEach(producer => {
        result[PRODUCERS_KEY].push(this.getProducerConsumerData(producer));
      });
      transport._consumers.forEach(consumer => {
        result[CONSUMERS_KEY].push(this.getProducerConsumerData(consumer));
      });
      opened && (result["candidates"] = await this.getCandidatesData(transport));
    }
    return result;
  }

  profileFromPresence([, data]) {
    const meta = data.metas[data.metas.length - 1];
    return meta.profile;
  }

  profileFromConsumer(consumer) {
    return Object.entries(this.props.presences || {})
      .filter(([k]) => k === consumer._appData.peerId)
      .map(this.profileFromPresence)
      .shift();
  }

  getProducerConsumerData(peer) {
    const result = {};
    result["opened"] = !peer._closed;
    if (peer) {
      const profile = Object.entries(this.props.presences || {})
        .filter(([k]) => k === peer._appData.peerId)
        .map(this.profileFromPresence)
        .shift();
      result["id"] = peer._id;
      result["paused"] = peer._paused;
      result["track"] = this.getTrackData(peer);
      result["kind"] = peer._kind || result["track"].kind;
      result["codec"] = peer.rtpParameters.codecs[0].mimeType.split("/")[1];
      result["name"] = profile ? profile.displayName : "N/A";
      result["peerId"] = peer._appData.peerId;

      const stats = APP.dialog.consumerStats[peer._id];
      if (result["kind"] === "video" && stats) {
        result["spatialLayer"] = stats["spatialLayer"];
        result["temporalLayer"] = stats["temporalLayer"];
        result["score"] = stats["score"];
      }
    }
    return result;
  }

  getTrackData(owner) {
    const result = {};
    result["id"] = owner._track.id;
    result["enabled"] = (owner._track !== null && owner._track.enabled && true) || false;
    result["kind"] = owner._track.kind;
    result["muted"] = owner._track.muted;
    result["state"] = owner._track.readyState;
    return result;
  }

  getSignalingData() {
    return { connected: !APP.dialog._closed };
  }

  async getServerData() {
    return await APP.dialog.getServerStats();
  }

  async getRtpStatsData(peer, type) {
    const result = {};
    const stats = await peer.getStats();
    for (const data of stats.values()) {
      if (data["type"] === type) {
        return data;
      }
    }
    return result;
  }

  getGraphData(id, stats) {
    let lastStats = this.state.statsData?.[id]?.last;
    const bytesSent = stats?.bytesSent || 0;
    const bytesReceived = stats?.bytesReceived || 0;
    const packetsSent = stats?.packetsSent || 0;
    const packetsReceived = stats?.packetsReceived || 0;
    const timestamp = stats?.timestamp || 0;
    const bytesSentDelta = bytesSent - lastStats?.bytesSent || 0;
    const bytesReceivedDelta = bytesReceived - lastStats?.bytesReceived || 0;
    const packetsSentDelta = packetsSent - lastStats?.packetsSent || 0;
    const packetsReceivedDelta = packetsReceived - lastStats?.packetsReceived || 0;
    const timeDelta = timestamp - lastStats?.timestamp || 0;
    let graphData = this.state.statsData?.[id]?.graph;
    if (!graphData) {
      const data = new Array(20);
      data.fill({
        bytesSent: 0,
        bytesReceived: 0,
        packetsSent: 0,
        packetsReceived: 0,
        timeDelta: 0
      });
      graphData = data;
    }
    graphData.shift();
    graphData.push({
      bytesSent: bytesSentDelta,
      bytesReceived: bytesReceivedDelta,
      packetsSent: packetsSentDelta,
      packetsReceived: packetsReceivedDelta,
      timeDelta: timeDelta
    });
    lastStats = {
      bytesSent,
      bytesReceived,
      packetsSent,
      packetsReceived,
      timestamp
    };
    return {
      lastStats: lastStats,
      graphData: graphData
    };
  }

  /**
   * @param {string} id Peer id.
   * @param {string} key Stats key to use for generating the speed value.
   */
  getPeerSpeed(id, key) {
    let speed = "0.00";
    const graphData = this.state.statsData?.[id]?.graph;
    if (graphData) {
      const lastData = graphData[graphData.length - 1];
      if (lastData) {
        speed = ((lastData[key] / 1024) * (1 / (lastData.timeDelta / 1000)) || 0).toFixed(2);
      }
    }

    return speed;
  }

  /**
   * Starts/stops the execution of a perioding data updating task. Every time this is executed all the debugging panel data is
   * gathered and the component state is updated to reflect the new data.
   * @param {bool} running Sets the running state for this task, true starts the tas, false stops it.
   */
  async runStats(running) {
    if (running && this.state) {
      const taskId = setInterval(() => {
        (async () => {
          try {
            const deviceData = this.getDeviceData();
            const serverData = this.state.collapsed.Remote ? {} : await this.getServerData();
            const signalingData = this.getSignalingData();

            // Tranports data
            const transportsData = {};
            transportsData[TransportType.SEND] = await this.getTransportData(TransportType.SEND);
            transportsData[TransportType.RECEIVE] = await this.getTransportData(TransportType.RECEIVE);

            // Populate graph, speed and stats data
            const statsData = {};
            if (APP.dialog._micProducer) {
              const id = APP.dialog._micProducer.id;
              const peer = APP.dialog._micProducer;
              const speedData = this.getPeerSpeed(id, "bytesSent");
              const rtpStatsData = await this.getRtpStatsData(peer, StatsType.OUTBOUND_RTP);
              const { lastStats, graphData } = this.getGraphData(id, rtpStatsData);
              statsData[id] = {};
              statsData[id]["speed"] = speedData;
              statsData[id]["graph"] = graphData;
              statsData[id]["last"] = lastStats;
              statsData[id]["rtpStats"] = rtpStatsData;
            }
            if (APP.dialog._cameraProducer) {
              const id = APP.dialog._cameraProducer.id;
              const peer = APP.dialog._cameraProducer;
              const speedData = this.getPeerSpeed(id, "bytesSent");
              const rtpStatsData = await this.getRtpStatsData(peer, StatsType.OUTBOUND_RTP);
              const { lastStats, graphData } = this.getGraphData(id, rtpStatsData);
              statsData[id] = {};
              statsData[id]["speed"] = speedData;
              statsData[id]["graph"] = graphData;
              statsData[id]["last"] = lastStats;
              statsData[id]["rtpStats"] = rtpStatsData;
            }
            if (APP.dialog._shareProducer) {
              const id = APP.dialog._shareProducer.id;
              const peer = APP.dialog._shareProducer;
              const speedData = this.getPeerSpeed(id, "bytesSent");
              const rtpStatsData = await this.getRtpStatsData(peer, StatsType.OUTBOUND_RTP);
              const { lastStats, graphData } = this.getGraphData(id, rtpStatsData);
              statsData[id] = {};
              statsData[id]["speed"] = speedData;
              statsData[id]["graph"] = graphData;
              statsData[id]["last"] = lastStats;
              statsData[id]["rtpStats"] = rtpStatsData;
            }
            for (const consumer of APP.dialog._consumers) {
              const id = consumer[0];
              const peer = consumer[1];
              const speedData = this.getPeerSpeed(id, "bytesReceived");
              const rtpStatsData = await this.getRtpStatsData(peer, StatsType.INBOUND_RTP);
              const { lastStats, graphData } = this.getGraphData(id, rtpStatsData);
              statsData[id] = {};
              statsData[id]["speed"] = speedData;
              statsData[id]["graph"] = graphData;
              statsData[id]["last"] = lastStats;
              statsData[id]["rtpStats"] = rtpStatsData;
            }

            // Update state
            this.setState({
              signalingData,
              serverData,
              deviceData,
              statsData,
              transportsData
            });
          } catch (e) {
            console.log(`Run Stats error: ${e}`);
          }
        })();
      }, STATS_REFRESH_TIME);
      this.setState({ taskId: taskId });
    } else {
      clearInterval(this.state.taskId);
    }
  }

  restartSendICE = () => {
    APP.dialog.restartSendICE();
  };

  restartRecvICE = () => {
    APP.dialog.restartRecvICE();
  };

  connectSignaling = () => {
    APP.dialog.connect();
  };

  disconnectSignaling = () => {
    APP.dialog.disconnect();
  };

  colorForLevel = level => {
    switch (level) {
      case "error":
        return "red";
      case "warn":
        return "orange";
      default:
        return "white";
    }
  };

  createLogMsgs = () => {
    const logLines = [];
    this.state.log
      ?.slice()
      .reverse()
      .forEach((log, index) => {
        logLines.push(<span key={index << 2} className={classNames(styles.rtcLogTime)}>{`[${log.time}] `}</span>);
        logLines.push(
          <span key={(index << 2) | 0x01} className={classNames(styles.rtcLogTag)}>{`[${log.tag}] `}</span>
        );
        logLines.push(
          <span
            key={(index << 2) | 0x02}
            className={classNames(styles.rtcLogMsg)}
            style={{ color: this.colorForLevel(log.level) }}
          >
            {log.msg}
          </span>
        );
        logLines.push(<br key={(index << 2) | 0x03} />);
      });
    return logLines;
  };

  createLog = () => {
    const logLines = [];
    this.state.log
      ?.slice()
      .reverse()
      .forEach(log => {
        logLines.push(`[${log.time}] [${log.tag}] ${log.msg}`);
      });
    return logLines.join("\r");
  };

  createCandidates(candidates) {
    const components = [];
    if (candidates) {
      candidates[StatsType.LOCAL_CANDIDATE] &&
        components.push(
          <DataPanel
            key={StatsType.LOCAL_CANDIDATE}
            data={candidates[StatsType.LOCAL_CANDIDATE]}
            title={
              <FormattedMessage id="rtc-debug-panel.local-candidate-panel-title" defaultMessage="Local Candidate" />
            }
          />
        );
      candidates[StatsType.REMOTE_CANDIDATE] &&
        components.push(
          <DataPanel
            key={StatsType.REMOTE_CANDIDATE}
            data={candidates[StatsType.REMOTE_CANDIDATE]}
            title={
              <FormattedMessage id="rtc-debug-panel.remote-candidate-panel-title" defaultMessage="Remote Candidate" />
            }
          />
        );
    }
    return components;
  }

  createProducers(producers = [], stats) {
    return producers.map(producer => {
      return (
        <TrackStatsPanel
          key={producer.id}
          title={
            <FormattedMessage
              id="rtc-debug-panel.producer-panel-title"
              defaultMessage="{kind} Producer"
              values={{ kind: capitalize(producer?.kind) }}
            />
          }
          data={producer}
          xAxis={"timeDelta"}
          yAxis={"bytesSent"}
          stats={stats[producer.id]}
        />
      );
    });
  }

  createConsumers(consumers, stats) {
    const reducedConsumers =
      consumers?.reduce((map, consumer) => {
        map[consumer.peerId] = map[consumer.peerId] || {};
        map[consumer.peerId]["name"] = consumer.name;
        map[consumer.peerId]["peerId"] = consumer.peerId;
        map[consumer.peerId]["consumers"] = map[consumer.peerId]["consumers"] || [];
        map[consumer.peerId]["consumers"].push(consumer);
        return map;
      }, []) || [];
    const components = [];
    for (const [, reducedConsumer] of Object.entries(reducedConsumers)) {
      const consumerPanels = reducedConsumer.consumers.map(consumer => {
        return (
          <TrackStatsPanel
            key={consumer.id}
            title={
              <FormattedMessage
                id="rtc-debug-panel.consumer-panel-title"
                defaultMessage="{kind} Consumer"
                values={{ kind: capitalize(consumer?.kind) }}
              />
            }
            data={consumer}
            xAxis={"timeDelta"}
            yAxis={"bytesReceived"}
            stats={stats[consumer.id]}
          />
        );
      });
      const error = reducedConsumer?.consumers?.some(consumer => {
        return !consumer.opened || !stats[consumer.id]?.speed;
      });
      const backgroundColor = error ? ERROR_COLOR : null;
      components.push(
        <CollapsiblePanel
          key={reducedConsumer.name}
          title={reducedConsumer.name}
          url={`${MEDIASOUP_DOC_BASE_URL}#Consumer`}
          data={{ peerId: reducedConsumer.peerId }}
          border
          collapsed
          backgroundColor={backgroundColor}
        >
          <CollapsiblePanel row>{consumerPanels}</CollapsiblePanel>
        </CollapsiblePanel>
      );
    }
    return components;
  }

  createRemoteTransports(data) {
    const transports = [];
    if (data) {
      for (const transportId in data) {
        const transport = data[transportId];
        const producers = [];
        if (transport?.producers) {
          for (const producerId in transport.producers) {
            const stats = transport.producers[producerId];
            stats.forEach((stat, index) => {
              producers.push(
                <DataPanel
                  key={`${producerId}${index}`}
                  data={stat}
                  title={
                    <FormattedMessage
                      id="rtc-debug-panel.producer-transport-stats-title"
                      defaultMessage="{kind} Stats"
                      values={{ kind: capitalize(stat.kind) }}
                    />
                  }
                />
              );
            });
          }
        }
        const consumers = [];
        if (transport?.consumers) {
          for (const consumerId in transport.consumers) {
            const stats = transport.consumers[consumerId];
            stats.forEach((stat, index) => {
              consumers.push(
                <DataPanel
                  key={`${consumerId}${index}`}
                  data={stat}
                  title={
                    <FormattedMessage
                      id="rtc-debug-panel.consumer-transport-stats-title"
                      defaultMessage="{kind} Stats"
                      values={{ kind: capitalize(stat.kind) }}
                    />
                  }
                />
              );
            });
          }
        }
        transports.push(
          <CollapsiblePanel
            key={transportId}
            title={`${transport.name} Transport`}
            url={`${MDN_DOC_BASE_URL}RTCStatsReport`}
            data={{ id: transportId }}
            border
          >
            {(producers?.length && (
              <CollapsiblePanel
                key={`producers`}
                title={
                  <FormattedMessage
                    id="rtc-debug-panel.producer-transport-stats-panel-title"
                    defaultMessage="Producer Stats"
                  />
                }
                row
                wrap
                url={`${MDN_DOC_BASE_URL}RTCStatsReport`}
                border
              >
                {producers}
              </CollapsiblePanel>
            )) ||
              null}
            {(consumers?.length && (
              <CollapsiblePanel
                key={`consumers`}
                title={
                  <FormattedMessage
                    id="rtc-debug-panel.consumer-transport-stats-panel-title"
                    defaultMessage="Consumer Stats"
                  />
                }
                row
                wrap
                url={`${MDN_DOC_BASE_URL}RTCStatsReport`}
                border
              >
                {consumers}
              </CollapsiblePanel>
            )) ||
              null}
          </CollapsiblePanel>
        );
      }
    }
    return transports;
  }

  onCollapse = (id, isCollapsed) => {
    const title = id?.props["defaultMessage"];
    const collapsed = { ...this.state.collapsed };
    if (isMobile || window.innerWidth < 500) {
      for (const key of Object.keys(collapsed)) {
        if (title === key) {
          collapsed[key] = isCollapsed;
        } else {
          if (!isCollapsed) {
            collapsed[key] = true;
          }
        }
      }
    } else {
      collapsed[title] = isCollapsed;
    }
    this.setState({
      collapsed
    });
  };

  render() {
    const { signalingData, serverData, statsData, deviceData, transportsData, collapsed } = this.state;
    const isNarrow = isMobile || window.innerWidth < 500;
    return (
      <div>
        <div className={classNames(styles.rtcDebugPanelRoot)}>
          <div
            className={classNames(styles.rtcStatusContainerLeft)}
            style={{
              height: isNarrow && !collapsed.Local && "80%",
              maxHeight: isNarrow && !collapsed.Local && "80%"
            }}
          >
            {this.props.showRtcDebug && (
              <CollapsiblePanel
                title={<FormattedMessage id="rtc-debug-panel.local-panel-title" defaultMessage="Local" />}
                isRoot
                border
                grow
                collapsed={collapsed.Local}
                onCollapse={this.onCollapse}
              >
                {deviceData && (
                  <CollapsiblePanel
                    title={<FormattedMessage id="rtc-debug-panel.device-panel-title" defaultMessage="Device" />}
                    border
                    url={`${MEDIASOUP_DOC_BASE_URL}#Device`}
                    data={deviceData}
                  />
                )}
                {signalingData && (
                  <SignalingPanel
                    data={signalingData}
                    onConnect={this.connectSignaling}
                    onDisconnect={this.disconnectSignaling}
                  />
                )}
                <div style={{ display: "flex", flexFlow: "column" }}>
                  <TransportPanel
                    title={
                      <FormattedMessage
                        id="rtc-debug-panel.send-transport-panel-title"
                        defaultMessage="Send Transport"
                      />
                    }
                    data={{
                      id: transportsData?.[TransportType.SEND]?.id,
                      opened: transportsData?.[TransportType.SEND]?.opened,
                      state: transportsData?.[TransportType.SEND]?.state
                    }}
                    candidates={this.createCandidates(transportsData?.[TransportType.SEND]?.candidates)}
                    producers={this.createProducers(transportsData?.[TransportType.SEND]?.producers, statsData)}
                    onRestart={this.restartSendICE}
                    isButtonEnabled={transportsData?.[TransportType.SEND]?.opened}
                  />
                </div>
                <div style={{ display: "flex", flexFlow: "column" }}>
                  <TransportPanel
                    title={
                      <FormattedMessage
                        id="rtc-debug-panel.receive-transport-panel-title"
                        defaultMessage="Receive Transport"
                      />
                    }
                    data={{
                      id: transportsData?.[TransportType.RECEIVE]?.id,
                      opened: transportsData?.[TransportType.RECEIVE]?.opened,
                      state: transportsData?.[TransportType.RECEIVE]?.state
                    }}
                    candidates={this.createCandidates(transportsData?.[TransportType.RECEIVE]?.candidates)}
                    consumers={this.createConsumers(transportsData?.[TransportType.RECEIVE]?.consumers, statsData)}
                    onRestart={this.restartRecvICE}
                    isButtonEnabled={transportsData?.[TransportType.RECEIVE]?.opened}
                  />
                </div>
              </CollapsiblePanel>
            )}
          </div>
          <div className={classNames(styles.statusContainerMiddle)}>
            {this.props.showAudioDebug && (
              <AudioDebugPanel isNarrow collapsed={collapsed.Audio} onCollapsed={this.onCollapse} />
            )}
            {this.props.showRtcDebug && (
              <div
                className={classNames(styles.rtcLogContainer)}
                style={{
                  height: isNarrow && !collapsed.Log && "80%",
                  maxHeight: isNarrow && !collapsed.Log && "80%"
                }}
              >
                <CollapsiblePanel
                  title={<FormattedMessage id="rtc-debug-panel.log-panel-title" defaultMessage="Log" />}
                  isRoot
                  border
                  grow
                  collapsed={collapsed.Log}
                  onCollapse={this.onCollapse}
                  clear={() => {
                    this.setState({
                      log: []
                    });
                  }}
                  download={() => {
                    download("rtc_log.txt", this.createLog());
                  }}
                >
                  <p className={classNames(styles.rtcLogMsgContainer)}>{this.createLogMsgs()}</p>
                </CollapsiblePanel>
              </div>
            )}
          </div>
          <div
            className={classNames(styles.rtcStatusContainerRight)}
            style={{
              height: isNarrow && !collapsed.Remote && "80%",
              maxHeight: isNarrow && !collapsed.Remote && "80%"
            }}
          >
            {this.props.showRtcDebug && (
              <CollapsiblePanel
                title={<FormattedMessage id="rtc-debug-panel.remote-panel-title" defaultMessage="Remote" />}
                isRoot
                border
                grow
                collapsed={collapsed.Remote}
                onCollapse={this.onCollapse}
              >
                {this.createRemoteTransports(serverData)}
              </CollapsiblePanel>
            )}
          </div>
        </div>
      </div>
    );
  }
}
