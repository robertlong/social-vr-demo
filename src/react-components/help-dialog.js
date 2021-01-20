import React, { Component } from "react";
import DialogContainer from "./dialog-container.js";
import PropTypes from "prop-types";
import { injectIntl, FormattedMessage } from "react-intl";
import styles from "../assets/stylesheets/help-dialog.scss";
import configs from "../utils/configs";
import { resetTips } from "../systems/tips";

class HelpDialog extends Component {
  static propTypes = {
    intl: PropTypes.object,
    onClose: PropTypes.func
  };
  render() {
    const { formatMessage } = this.props.intl;

    return (
      <DialogContainer title={formatMessage({ id: "help-dialog.title" })} {...this.props}>
        <div className={styles.helpDialog}>
          <div>
            <FormattedMessage id="help-dialog.subtitle-pre" />
          </div>
          <div>
            <FormattedMessage id="help-dialog.subtitle-or" />{" "}
            <a href={configs.link("docs", "https://hubs.mozilla.com/docs")} rel="noreferrer noopener" target="_blank">
              <FormattedMessage id="help-dialog.docs-link" />
            </a>{" "}
            <FormattedMessage id="help-dialog.subtitle-post" />
          </div>
          <button
            className={styles.tourButton}
            onClick={e => {
              e.preventDefault();
              resetTips();
              this.props.onClose();
            }}
          >
            <FormattedMessage id="help-dialog.tour-button" />
          </button>
          <a
            className={styles.docsLink}
            href={configs.link("docs", "https://hubs.mozilla.com/docs")}
            rel="noreferrer noopener"
            target="_blank"
          >
            <FormattedMessage id="help-dialog.docs-button" />
          </a>
        </div>
      </DialogContainer>
    );
  }
}

export default injectIntl(HelpDialog);
