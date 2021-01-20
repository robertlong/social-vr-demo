import React, { Component } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { injectIntl } from "react-intl";
import styles from "../assets/stylesheets/message-entry.scss";
import { WithHoverSound } from "./wrap-with-audio";
import { handleTextFieldFocus, handleTextFieldBlur } from "../utils/focus-utils";
import sendMessageIcon from "../assets/images/send_message.svgi";
import { InlineSVGButton } from "./svgi";

class LobbyChatBox extends Component {
  static propTypes = {
    intl: PropTypes.object,
    discordBridges: PropTypes.array,
    occupantCount: PropTypes.number,
    onSendMessage: PropTypes.func
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
    const occupantSnippet = formatMessage(
      { id: "lobby-chat-box.occupant-snippet" },
      { occupantCount: this.props.occupantCount - 1 }
    );
    const messageEntryPlaceholder =
      this.props.occupantCount <= 1
        ? formatMessage({ id: "lobby-chat-box.placeholder-nobody" })
        : this.props.discordBridges.length
          ? formatMessage({ id: "lobby-chat-box.placeholder-occupant-discord" }, { occupantSnippet, discordSnippet })
          : formatMessage({ id: "lobby-chat-box.placeholder-occupant" }, { occupantSnippet });

    return (
      <form onSubmit={this.sendMessage}>
        <div
          className={classNames({
            [styles.messageEntry]: true,
            [styles.messageEntryDisabled]: this.props.occupantCount <= 1
          })}
          style={{ height: pendingMessageFieldHeight }}
        >
          <textarea
            className={classNames([styles.messageEntryInput, "chat-focus-target"])}
            value={this.state.pendingMessage}
            rows={textRows}
            style={{ height: pendingMessageTextareaHeight }}
            onFocus={e => handleTextFieldFocus(e.target)}
            onBlur={() => handleTextFieldBlur()}
            onChange={e => this.setState({ pendingMessage: e.target.value })}
            disabled={this.props.occupantCount <= 1 ? true : false}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                this.sendMessage(e);
              } else if (e.key === "Escape") {
                e.target.blur();
              }
            }}
            placeholder={messageEntryPlaceholder}
          />
          <WithHoverSound>
            <InlineSVGButton
              className={classNames([styles.messageEntryButton, styles.messageEntrySubmit])}
              disabled={this.props.occupantCount <= 1 ? true : false}
              type="submit"
              src={sendMessageIcon}
            />
          </WithHoverSound>
        </div>
      </form>
    );
  }
}

export default injectIntl(LobbyChatBox);
