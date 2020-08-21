import React, { Component } from "react";
import PropTypes from "prop-types";
import styles from "../assets/stylesheets/chat-command-help.scss";
import classNames from "classnames";
import { FormattedMessage } from "react-intl";
import qsTruthy from "../utils/qs_truthy";

export default class ChatCommandHelp extends Component {
  static propTypes = {
    matchingPrefix: PropTypes.string,
    onTop: PropTypes.bool
  };

  render() {
    const commands = [
      "leave",
      "grow",
      "shrink",
      "duck",
      "debug",
      "vrstats",
      "scene <scene url>",
      "rename <new name>",
      "audiomode",
      "audioRolloff <factor>"
    ];

    if (window.APP.hubChannel && window.APP.hubChannel.can("fly")) {
      commands.push("fly");
    }

    if (qsTruthy("video_capture")) {
      commands.push("capture [stop]");
    }

    return (
      <div className={classNames({ [styles.commandHelp]: true, [styles.commandHelpOnTop]: this.props.onTop })}>
        {commands.map(
          c =>
            (this.props.matchingPrefix === "" ||
              c.split(" ")[0].startsWith(this.props.matchingPrefix.split(" ")[0])) && (
              <div className={styles.entry} key={c}>
                <div className={styles.command}>/{c}</div>
                <div>
                  <FormattedMessage id={`commands.${c.split(" ")[0]}`} />
                </div>
              </div>
            )
        )}
      </div>
    );
  }
}
