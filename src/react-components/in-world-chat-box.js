import React, { Component } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { injectIntl } from "react-intl";
import styles from "../assets/stylesheets/message-entry.scss";
import ChatCommandHelp from "./chat-command-help";
import sendMessageIcon from "../assets/images/send_message.svgi";
import spawnMessageIcon from "../assets/images/spawn_message.svgi";
import { faCamera } from "@fortawesome/free-solid-svg-icons/faCamera";
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { handleTextFieldFocus, handleTextFieldBlur } from "../utils/focus-utils";
import { spawnChatMessage } from "./chat-message";
import { pushHistoryState } from "../utils/history";
import { InlineSVGButton } from "./svgi";

const isMobile = AFRAME.utils.device.isMobile();

class InWorldChatBox extends Component {
  static propTypes = {
    intl: PropTypes.object,
    discordBridges: PropTypes.array,
    onSendMessage: PropTypes.func,
    onObjectCreated: PropTypes.func,
    history: PropTypes.object,
    enableSpawning: PropTypes.bool
  };

  state = {
    pendingMessage: ""
  };

  sendMessage = e => {
    e.preventDefault();
    if (this.props.onSendMessage) {
      this.props.onSendMessage(this.state.pendingMessage);
    }
    this.setState({ pendingMessage: "" });
  };

  render() {
    const { formatMessage } = this.props.intl;
    const textRows = this.state.pendingMessage.split("\n").length;
    const pendingMessageTextareaHeight = textRows * 28 + "px";
    const pendingMessageFieldHeight = textRows * 28 + 20 + "px";
    const discordSnippet = this.props.discordBridges.map(ch => "#" + ch).join(", ");

    return (
      <form onSubmit={this.sendMessage}>
        <div
          className={classNames({ [styles.messageEntryInRoom]: true, [styles.messageEntryOnMobile]: isMobile })}
          style={{ height: pendingMessageFieldHeight }}
        >
          {this.state.pendingMessage.startsWith("/") && (
            <ChatCommandHelp matchingPrefix={this.state.pendingMessage.substring(1)} />
          )}
          <input
            id="message-entry-media-input"
            type="file"
            style={{ display: "none" }}
            accept={isMobile ? "image/*" : "*"}
            multiple
            onChange={e => {
              if (this.props.onObjectCreated) {
                for (const file of e.target.files) {
                  this.props.onObjectCreated(file);
                }
              }
            }}
          />
          {this.props.enableSpawning && (
            <label
              htmlFor="message-entry-media-input"
              title={"Upload"}
              role="button"
              className={classNames([
                styles.messageEntryButton,
                styles.messageEntryButtonInRoom,
                styles.messageEntryUpload
              ])}
            >
              <i>
                <FontAwesomeIcon icon={isMobile ? faCamera : faPlus} />
              </i>
            </label>
          )}
          <textarea
            style={{ height: pendingMessageTextareaHeight }}
            className={classNames([
              styles.messageEntryInput,
              styles.messageEntryInputInRoom,
              "chat-focus-target",
              !this.props.enableSpawning && styles.messageEntryInputNoSpawn
            ])}
            value={this.state.pendingMessage}
            rows={textRows}
            onFocus={e => {
              handleTextFieldFocus(e.target);
            }}
            onBlur={() => {
              handleTextFieldBlur();
            }}
            onChange={e => {
              e.stopPropagation();
              this.setState({ pendingMessage: e.target.value });
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                this.sendMessage(e);
              } else if (e.key === "Enter" && e.ctrlKey) {
                spawnChatMessage(e.target.value);
                this.setState({ pendingMessage: "" });
                e.target.blur();
              } else if (e.key === "Escape") {
                e.target.blur();
              }
            }}
            aria-label="chat message input"
            placeholder={
              this.props.discordBridges.length
                ? formatMessage({ id: "in-world-chat-box.placeholder-discord" }, { discordSnippet })
                : formatMessage({ id: "in-world-chat-box.placeholder" })
            }
          />
          {this.props.enableSpawning && (
            <InlineSVGButton
              title={"Create"}
              className={classNames([styles.messageEntrySpawn])}
              src={spawnMessageIcon}
              onClick={() => {
                if (this.state.pendingMessage.length > 0) {
                  spawnChatMessage(this.state.pendingMessage);
                  this.setState({ pendingMessage: "" });
                } else {
                  pushHistoryState(this.props.history, "modal", "create");
                }
              }}
            />
          )}
          <InlineSVGButton
            type="submit"
            title="send chat message"
            className={classNames([
              styles.messageEntryButton,
              styles.messageEntryButtonInRoom,
              styles.messageEntrySubmit
            ])}
            src={sendMessageIcon}
          />
        </div>
      </form>
    );
  }
}

export default injectIntl(InWorldChatBox);
