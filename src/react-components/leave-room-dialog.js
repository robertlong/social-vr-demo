import React, { Component } from "react";
import DialogContainer from "./dialog-container.js";
import styles from "../assets/stylesheets/leave-room-dialog.scss";
import { injectIntl, FormattedMessage } from "react-intl";
import PropTypes from "prop-types";

class LeaveRoomDialog extends Component {
  static propTypes = {
    intl: PropTypes.object,
    messageType: PropTypes.string,
    destinationUrl: PropTypes.string
  };

  render() {
    const { formatMessage } = this.props.intl;

    return (
      <DialogContainer title={formatMessage({ id: "leave-room-dialog.title" })} {...this.props}>
        <div className={styles.leaveRoom}>
          <div>
            <FormattedMessage id={`leave-room-dialog.${this.props.messageType}.message`} />
          </div>
          <a href={this.props.destinationUrl} rel="noopener noreferrer">
            <FormattedMessage id={`leave-room-dialog.${this.props.messageType}.confirm`} />
          </a>
        </div>
      </DialogContainer>
    );
  }
}

export default injectIntl(LeaveRoomDialog);
