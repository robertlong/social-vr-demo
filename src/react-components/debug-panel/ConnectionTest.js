import React from "react";
import { Button } from "../input/Button";
import {
  getReticulumMeta,
  connectToReticulum,
  createAndRedirectToNewHub,
} from "../../utils/phoenix-utils";
import HubChannel from "../../utils/hub-channel";
import "aframe";
import "networked-aframe";
import { DialogAdapter } from "../../naf-dialog-adapter";

import { App } from "../../App";
window.APP = new App();
const store = window.APP.store;

import styles from "../../assets/stylesheets/connection-test.scss";

class TestState {
  constructor(name) {
    this.name = name;
    this.state = "";
    this.notes = "";
  }

  start() {
    this.state = "Running";
    this._startMs = performance.now();
  }

  stop(success) {
    this.state = success ? "OK" : "Error";
    this._endMs = performance.now();
  }

  durationMs() {
    if(this._startMs && this._endMs) {
      return this._endMs - this._startMs;
    }
    return null;
  }
}

export class ConnectionTest extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      isStarted: false,
      copyButtonLabel: "Copy results to clipboard",
      tests: {
        metadataTest: new TestState("Fetch Metadata"),
        roomTest: new TestState("Open Room"),
        reticulumTest: new TestState("Connect to Reticulum"),
        retChannelTest: new TestState("Open RET Channel"),
        hubChannelTest: new TestState("Open HUB Channel"),
        joinTest: new TestState("Join Room"),
        enterTest: new TestState("Enter Room"),
        micTest: new TestState("Open Microphone"),
      },
      hubId: null,
    };

    // Uncomment to test with existing room ID rather than creating a new one each time
    //this._roomId = "3z2zcE3";
  }

  dowloadMetadata = async () => {
    console.info("Called dowloadMetadata");
    const test = this.state.tests.metadataTest;
    test.start();
    this.setState(state => state.tests.metadataTest = test);
    getReticulumMeta().then(reticulumMeta => {
      test.stop(true);
      test.notes = `Reticulum @ ${reticulumMeta.phx_host}: v${reticulumMeta.version} on ${reticulumMeta.pool}`;
      this.openNewRoom();
     }).catch(error => {
      test.stop(false);
      test.notes = error.toString();
    }).finally(() => {
      this.setState(state => state.tests.metadataTest = test);
    });
    this.setState({ isStarted: true });
  };

  openNewRoom = async () => {
    console.info("Called openNewRoom");
    const test = this.state.tests.roomTest;
    if(this._roomId) {
      test.state = "Skipped";
      test.notes = `Room ID ${this._roomId}`;
      this.connectToReticulum();
    } else {
      test.start();
      this.setState(state => state.tests.roomTest = test);
      try {
        const hub = await createAndRedirectToNewHub(null, null, false, false);
        test.stop(true);
        test.notes = `Room ID ${hub.hub_id}`;
        this._roomId = hub.hub_id;
        this.connectToReticulum();
      } catch (error) {
        test.stop(false);
        test.notes = error.toString();
      } finally {
        this.setState(state => state.tests.roomTest = test);
      }
    }
  };

  connectToReticulum = async () => {
    console.info("Called connectToReticulum");
    const test = this.state.tests.reticulumTest;
    test.start();
    const socket = await connectToReticulum(true);
    test.notes = socket.endPointURL();
    this.setState(state => state.tests.reticulumTest = test);
    socket.onOpen(() => {
      test.stop(true);
      this._socket = socket;
      this.setState(state => state.tests.reticulumTest = test);
      this.openRetChannel();
    });  
    socket.onError(error => {
      test.stop(false);
      this.setState(state => state.tests.reticulumTest = test);
    });  
  }

  openRetChannel = async () => {
    console.info("Called openRetChannel");
    const test = this.state.tests.retChannelTest;
    test.start();
    this.setState(state => state.tests.retChannelTest = test);
    const retPhxChannel = this._socket.channel(`ret`, { hub_id: this._roomId });
    retPhxChannel
      .join()
      .receive("ok", async data => {
        test.stop(true);
        console.info(data);
        this._clientId = data.session_id;
        test.notes = `Session ID ${data.session_id}`;
        this.setState(state => state.tests.retChannelTest = test);
        this.openHubChannel();
      })
      .receive("error", error => {
        test.stop(false);
        test.notes = error.reason;
        this.setState(state => state.tests.retChannelTest = test);
      });  
  }

  openHubChannel = async () => {
    console.info("Called openHubChannel");
    const test = this.state.tests.hubChannelTest;
    test.start();
    this.setState(state => state.tests.hubChannelTest = test);
    const params = {
      profile: { 
        displayName: "CONNECTION_TEST",
      },
      context: {
        mobile: false,
        embed: false
      },
      push_subscription_endpoint: null,
      perms_token: null,
      hub_invite_id: null,
    };
    const hubPhxChannel = this._socket.channel(`hub:${this._roomId}`, params);
    const hubChannel = new HubChannel(store, this._roomId);
    this._hubChannel = hubChannel
    window.APP.hubChannel = hubChannel;
    hubChannel.setPhoenixChannel(hubPhxChannel);
    hubPhxChannel
      .join()
      .receive("ok", async data => {
        test.stop(true);
        console.info(data);
        this.setState(state => state.tests.hubChannelTest = test);
        this._hub = data.hubs[0];
        this._perms_token = data.perms_token;
        this.joinRoom();
      })
      .receive("error", error => {
        console.error(error);
        test.stop(false);
        test.notes = error.reason;
        this.setState(state => state.tests.hubChannelTest = test);
      });  
  }

  joinRoom = async () => {
    console.info("Called joinRoom");
    const connectionUrl = `wss://${this._hub.host}:${this._hub.port}`;
    const test = this.state.tests.joinTest;
    test.notes = connectionUrl;
    test.start();
    this.setState(state => state.tests.joinTest = test);

    try {
      // This mimics what happens in NAF::networked-scene::setupNetworkAdapter
      var adapter = NAF.adapters.make("dialog");
      this._adapter = adapter;
      NAF.connection.setNetworkAdapter(adapter);

      // Normally set in hubs.js in response to the adapter-ready event
      adapter.setClientId(this._clientId);
      adapter.setRoom(this._roomId);
      adapter.setJoinToken(this._perms_token);

      // Normally hubs.js links these up to the phoenix hub channel
      adapter.reliableTransport = (clientId, dataType, data) => {
        console.info(`adapter.reliableTransport: ${clientId} ${dataType} ${data}}`);
      };
      adapter.unreliableTransport = (clientId, dataType, data) => {
        console.info(`adapter.unreliableTransport: ${clientId} ${dataType} ${data}}`);
      };

      // Calls NAF::NetworkConnection::connect, which in turn calls DialogAdapter::connect
      NAF.connection.connect(connectionUrl, "default", this._roomId, true).then(async () => {
        test.stop(true);
        this.setState(state => state.tests.joinTest = test);
        this.enterRoom();
      }).catch(error => {
        console.error(error);
        test.stop(false);
        test.notes = error.reason;
        this.setState(state => state.tests.joinTest = test);
      });
    } catch (error) {
      console.error(error);
      test.stop(false);
      test.notes = error.toString();
      this.setState(state => state.tests.joinTest = test);
    }
  }

  enterRoom = async () => {
    console.info("Called enterRoom");
    const test = this.state.tests.enterTest;
    test.start();
    this.setState(state => state.tests.enterTest = test);

    try {
      this._hubChannel.sendEnteredEvent();
      test.stop(true);
      this.openMic()
    } catch (error) {
      console.error(error);
      test.stop(false);
      test.notes = error.toString();
    } finally {
      this.setState(state => state.tests.enterTest = test);
    }

  }

  openMic = async () => {
    console.info("Called openMic");
    const test = this.state.tests.micTest;
    test.start();
    this.setState(state => state.tests.micTest = test);

    try {
      // Normally handled by the hubs media-devices-manager
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._adapter.setLocalMediaStream(newStream);
      this._adapter.enableMicrophone(true);
      newStream.getAudioTracks().forEach(track => {
        test.notes = `Microphone: ${track.label}`;
      });
      test.stop(true);
    } catch (error) {
      console.error(error);
      test.stop(false);
      test.notes = error.toString();
    } finally {
      this.setState(state => state.tests.micTest = test);
    }

    // Comment out to keep connection open after test
    this.disconnectAll();
  }

  disconnectAll = async () => {
    console.info("Called disconnectAll");
    this._socket.disconnect();
  }

  copyTable = () => {
    const html = document.getElementById('resultsTable').outerHTML;
    var data = [new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) })];
    navigator.clipboard.write(data).then(() => {
      this.setState({copyButtonLabel: "Copied!"})
    }, function(reason) {
      alert("Clipboard error: " + reason);
    });
}

  render() {
    if (this.state.isStarted) {
      return (
        <div className={styles.resultsContainer}>
          <table id="resultsTable" className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Test</th>
                <th>State</th>
                <th>Latency (ms)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(this.state.tests).map(test => (
                <tr key={test.name}>
                  <td className={styles.testName}>{test.name}</td>
                  <td>{test.state}</td>
                  <td className={styles.numeric}>{test.durationMs()?.toFixed(0)}</td>
                  <td>{test.notes}</td>
                </tr>
                
              ))}
            </tbody>
          </table>
          <Button preset="blue" className={styles.actionButton} onClick={this.copyTable}>{this.state.copyButtonLabel}</Button>
        </div>

      );
    } else {
      return (
        <Button preset="blue" className={styles.actionButton} onClick={this.dowloadMetadata}>Start Connection Test</Button>
      );
    }
  }
}
