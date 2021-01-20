import React, { Component } from "react";
import PropTypes from "prop-types";
import { injectIntl, FormattedMessage } from "react-intl";
import classNames from "classnames";

import styles from "../assets/stylesheets/close-room-dialog.scss";
import DialogContainer from "./dialog-container";

class CloseRoomDialog extends Component {
  static propTypes = {
    intl: PropTypes.object,
    onConfirm: PropTypes.func,
    onClose: PropTypes.func,
    roomName: PropTypes.string
  };

  state = {
    confirmText: "",
    showIsNotMatchError: false
  };

  render() {
    const { formatMessage } = this.props.intl;
    const isMatch = this.state.confirmText.toLowerCase() === this.props.roomName.toLowerCase();
    return (
      <DialogContainer title={formatMessage({ id: "close-room.title" })} {...this.props}>
        <div className={styles.message}>
          <FormattedMessage id="close-room.message" />
        </div>
        <div>
          <FormattedMessage id="close-room.type-to-confirm" />
        </div>
        <span className={styles.roomName}>{this.props.roomName}</span>
        <input
          className={classNames(
            styles.formFieldText,
            !isMatch && this.state.showIsNotMatchError ? styles.errorBorder : ""
          )}
          value={this.state.confirmText}
          onChange={e => this.setState({ confirmText: e.target.value })}
          required
          spellCheck="false"
        />
        <button
          className={classNames(styles.confirmButton, isMatch ? "" : styles.notMatch)}
          onClick={() => {
            if (isMatch) {
              this.props.onConfirm();
              this.props.onClose();
            } else {
              this.setState({ showIsNotMatchError: true });
            }
          }}
        >
          <FormattedMessage id="close-room.confirm" />
        </button>
        <button className={styles.cancelButton} onClick={() => this.props.onClose()}>
          <FormattedMessage id="close-room.cancel" />
        </button>
      </DialogContainer>
    );
  }
}

export default injectIntl(CloseRoomDialog);
