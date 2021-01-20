import configs from "../utils/configs";
import { getMicrophonePresences } from "../utils/microphone-presence";
import React, { Component } from "react";
import PropTypes from "prop-types";
import { FormattedMessage } from "react-intl";
import classNames from "classnames";

import rootStyles from "../assets/stylesheets/ui-root.scss";
import styles from "../assets/stylesheets/presence-list.scss";
import StateLink from "./state-link.js";
import { WithHoverSound } from "./wrap-with-audio";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers } from "@fortawesome/free-solid-svg-icons/faUsers";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons/faPencilAlt";
import { faDesktop } from "@fortawesome/free-solid-svg-icons/faDesktop";
import { faVideo } from "@fortawesome/free-solid-svg-icons/faVideo";
import discordIcon from "../assets/images/discord.svgi";
import hmdIcon from "../assets/images/hmd-icon.svgi";
import { faMobileAlt } from "@fortawesome/free-solid-svg-icons/faMobileAlt";
import { pushHistoryPath, withSlug } from "../utils/history";
import { hasReticulumServer } from "../utils/phoenix-utils";
import { InlineSVG } from "./svgi";
import { faVolumeMute } from "@fortawesome/free-solid-svg-icons/faVolumeMute";
import { faVolumeOff } from "@fortawesome/free-solid-svg-icons/faVolumeOff";
import { faVolumeUp } from "@fortawesome/free-solid-svg-icons/faVolumeUp";

const MIC_PRESENCE_UPDATE_FREQUENCY = 500;

function getPresenceIcon(ctx) {
  if (ctx && ctx.hmd) {
    return <InlineSVG src={hmdIcon} />;
  } else if (ctx && ctx.mobile) {
    return <FontAwesomeIcon icon={faMobileAlt} />;
  } else if (ctx && ctx.discord) {
    return <InlineSVG src={discordIcon} />;
  } else {
    return <FontAwesomeIcon icon={faDesktop} />;
  }
}

function getMicrophonePresenceIcon(microphonePresence) {
  if (microphonePresence.muted) {
    return <FontAwesomeIcon icon={faVolumeMute} />;
  } else if (microphonePresence.talking) {
    return <FontAwesomeIcon icon={faVolumeUp} />;
  } else {
    return <FontAwesomeIcon icon={faVolumeOff} />;
  }
}

export function navigateToClientInfo(history, clientId) {
  const currentParams = new URLSearchParams(history.location.search);

  if (hasReticulumServer() && document.location.host !== configs.RETICULUM_SERVER) {
    currentParams.set("client_id", clientId);
    pushHistoryPath(history, history.location.pathname, currentParams.toString());
  } else {
    pushHistoryPath(history, withSlug(history.location, `/clients/${clientId}`), currentParams.toString());
  }
}

export default class PresenceList extends Component {
  static propTypes = {
    hubChannel: PropTypes.object,
    presences: PropTypes.object,
    history: PropTypes.object,
    sessionId: PropTypes.string,
    signedIn: PropTypes.bool,
    displayName: PropTypes.string,
    onSignIn: PropTypes.func,
    onSignOut: PropTypes.func,
    expanded: PropTypes.bool,
    onExpand: PropTypes.func
  };

  updateMicrophoneState = () => {
    if (this.props.expanded) {
      const microphonePresences = getMicrophonePresences(AFRAME.scenes[0]);
      this.setState({ microphonePresences });
    }
    this.timeout = setTimeout(this.updateMicrophoneState, MIC_PRESENCE_UPDATE_FREQUENCY);
  };

  navigateToClientInfo = clientId => {
    navigateToClientInfo(this.props.history, clientId);
  };

  mute = clientId => {
    this.props.hubChannel.mute(clientId);
  };

  muteAll = () => {
    const presences = this.props.presences;
    for (const [clientId, presence] of Object.entries(presences)) {
      if (clientId !== this.props.sessionId) {
        const meta = presence.metas[0];
        if (meta.presence === "room" && meta.permissions && !meta.permissions.mute_users) {
          this.mute(clientId);
        }
      }
    }
  };

  domForPresence = ([sessionId, data]) => {
    const meta = data.metas[data.metas.length - 1];
    const context = meta.context;
    const profile = meta.profile;
    const recording = meta.streaming || meta.recording;
    const icon = recording ? <FontAwesomeIcon icon={faVideo} /> : getPresenceIcon(context);
    const isBot = context && context.discord;
    const isEntering = context && context.entering;
    const isOwner = meta.roles && meta.roles.owner;
    const messageId = isEntering ? "presence.entering" : `presence.in_${meta.presence}`;
    const badge = isOwner && (
      <span className={styles.moderatorBadge} title="Moderator">
        &#x2605;
      </span>
    );
    const microphonePresence =
      this.state && this.state.microphonePresences && this.state.microphonePresences.get(sessionId);
    const micState =
      microphonePresence && meta.presence === "room" ? getMicrophonePresenceIcon(microphonePresence) : "";
    const canMuteUsers = this.props.hubChannel.can("mute_users");
    const isMe = sessionId === this.props.sessionId;
    const muted = microphonePresence && microphonePresence.muted;
    const canMuteIndividual = canMuteUsers && !isMe && microphonePresence && !microphonePresence.muted;

    return (
      <WithHoverSound key={sessionId}>
        <div className={styles.row}>
          <div className={styles.icon}>
            <i>{icon}</i>
          </div>
          <div
            className={classNames({
              [styles.iconRed]: muted,
              [styles.icon]: !muted,
              [styles.iconButton]: canMuteIndividual
            })}
            onClick={() => (canMuteUsers ? this.mute(sessionId) : null)}
          >
            <i>{micState}</i>
          </div>
          <div
            className={classNames({
              [styles.listItem]: true
            })}
          >
            {sessionId === this.props.sessionId ? (
              <StateLink className={styles.self} stateKey="overlay" stateValue="profile" history={this.props.history}>
                {profile && profile.displayName}
                {badge}
                <i>
                  <FontAwesomeIcon icon={faPencilAlt} />
                </i>
              </StateLink>
            ) : (
              <div>
                {!isBot ? (
                  <button className={styles.clientLink} onClick={() => this.navigateToClientInfo(sessionId)}>
                    {profile && profile.displayName}
                  </button>
                ) : (
                  <span>{profile && profile.displayName}</span>
                )}
                {badge}
              </div>
            )}
          </div>
          <div className={styles.presence}>
            <FormattedMessage id={messageId} />
          </div>
        </div>
      </WithHoverSound>
    );
  };

  componentDidMount() {
    this.updateMicrophoneState();
    document.querySelector(".a-canvas").addEventListener(
      "mouseup",
      () => {
        this.props.onExpand(false);
      },
      { once: true }
    );
  }

  componentWillUnmount() {
    clearTimeout(this.timeout);
  }

  renderExpandedList() {
    const canMuteUsers = this.props.hubChannel.can("mute_users");
    const muteAll = canMuteUsers && (
      <div className={styles.muteAll}>
        <button title="Mute All" onClick={this.muteAll} className={styles.muteButton}>
          <FormattedMessage id="presence.mute_all" />
        </button>
      </div>
    );

    return (
      <div className={styles.presenceList}>
        <div className={styles.attachPoint} />
        <div className={styles.contents}>
          {muteAll}
          <div className={styles.rows}>
            {Object.entries(this.props.presences || {})
              .filter(([k]) => k === this.props.sessionId)
              .map(this.domForPresence)}
            {Object.entries(this.props.presences || {})
              .filter(([k]) => k !== this.props.sessionId)
              .map(this.domForPresence)}
          </div>
          <div className={styles.signIn}>
            {this.props.signedIn ? (
              <div>
                <span>
                  <FormattedMessage id="sign-in.as" /> {this.props.displayName}
                </span>{" "}
                <a onClick={this.props.onSignOut}>
                  <FormattedMessage id="sign-in.out" />
                </a>
              </div>
            ) : (
              <a onClick={this.props.onSignIn}>
                <FormattedMessage id="sign-in.in" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const occupantCount = this.props.presences ? Object.entries(this.props.presences).length : 0;
    return (
      <div>
        <button
          title="Members"
          aria-label={`Toggle list of ${occupantCount} member${occupantCount === 1 ? "" : "s"}`}
          onClick={() => {
            this.props.onExpand(!this.props.expanded);
          }}
          className={classNames({
            [rootStyles.presenceListButton]: true,
            [rootStyles.presenceInfoSelected]: this.props.expanded
          })}
        >
          <FontAwesomeIcon icon={faUsers} />
          <span className={rootStyles.occupantCount}>{occupantCount}</span>
        </button>
        {this.props.expanded && this.renderExpandedList()}
      </div>
    );
  }
}
