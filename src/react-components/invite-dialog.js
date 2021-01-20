import React, { Component } from "react";
import PropTypes from "prop-types";
import copy from "copy-to-clipboard";
import classNames from "classnames";
import { injectIntl, FormattedMessage } from "react-intl";
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import configs from "../utils/configs";

import { getMessages } from "../utils/i18n";
import { share, canShare } from "../utils/share";

import { WithHoverSound } from "./wrap-with-audio";
import styles from "../assets/stylesheets/invite-dialog.scss";

function pad(num, size) {
  let s = `${num}`;
  while (s.length < size) s = `0${s}`;
  return s;
}

class InviteDialog extends Component {
  static propTypes = {
    intl: PropTypes.object,
    entryCode: PropTypes.number,
    hubId: PropTypes.string,
    allowShare: PropTypes.bool,
    isModal: PropTypes.bool,
    onClose: PropTypes.func,
    hasPush: PropTypes.bool,
    isSubscribed: PropTypes.bool,
    onSubscribeChanged: PropTypes.func,
    embedUrl: PropTypes.string
  };

  state = {
    copyButtonActive: false,
    shareButtonActive: false
  };

  shareClicked = url => {
    this.setState({ shareButtonActive: true });
    share({ url, title: `Join me now in ${getMessages()["share-hashtag"]}!` }).then(() => {
      this.setState({ shareButtonActive: false });
    });
  };

  copyClicked = link => {
    this.setState({ copyButtonActive: true });
    setTimeout(() => this.setState({ copyButtonActive: false }), 5000);

    copy(link);
  };

  render() {
    const { formatMessage } = this.props.intl;
    const { entryCode, embedUrl } = this.props;

    const entryCodeString = pad(entryCode, 6);
    const shortLinkText = `${configs.SHORTLINK_DOMAIN}/${this.props.hubId}`;
    const shortLink = "https://" + shortLinkText;
    const embedText = `<iframe src="${embedUrl}" style="width: 1024px; height: 768px;" allow="microphone; camera; vr; speaker;"></iframe>`;

    return (
      <div className={classNames({ [styles.dialog]: true, [styles.modal]: this.props.isModal })}>
        {!this.props.isModal && <div className={styles.attachPoint} />}
        <div>
          <FormattedMessage id={`invite.or_visit${this.props.isModal ? "_modal" : ""}`} />
        </div>
        <div className={styles.domain}>
          <input type="text" readOnly onFocus={e => e.target.select()} value={shortLinkText} />
        </div>
        <div className={styles.buttons}>
          <WithHoverSound>
            <button className={styles.linkButton} onClick={this.copyClicked.bind(this, shortLink)}>
              <span>
                {this.state.copyButtonActive
                  ? formatMessage({ id: "support.copied" })
                  : formatMessage({ id: "support.copy" })}
              </span>
            </button>
          </WithHoverSound>
          {this.props.allowShare &&
            canShare() && (
              <WithHoverSound>
                <button className={styles.linkButton} onClick={this.shareClicked.bind(this, shortLink)}>
                  <span>{this.state.shareButtonActive ? "sharing..." : "share"}</span>
                </button>
              </WithHoverSound>
            )}
          {this.props.allowShare &&
            !canShare() && (
              <WithHoverSound>
                <button className={styles.linkButton} onClick={this.shareClicked.bind(this, shortLink)}>
                  <FormattedMessage id="invite.tweet" />
                </button>
              </WithHoverSound>
            )}
        </div>
        <WithHoverSound>
          <button className={styles.close} title="close" onClick={() => this.props.onClose()}>
            <i>
              <FontAwesomeIcon icon={faTimes} />
            </i>
          </button>
        </WithHoverSound>
        <div className={styles.linkCode}>
          <FormattedMessage id={`invite.enter_via${this.props.isModal ? "_modal" : ""}`} />
          <a
            href={`https://${configs.SHORTLINK_DOMAIN}`}
            target="_blank"
            className={styles.hubLinkLink}
            rel="noopener noreferrer"
          >
            {configs.SHORTLINK_DOMAIN}
          </a>
          {/* <div className={styles.linkcode}> */}
          <FormattedMessage id="invite.and_enter_code" />
          {/* </div> */}
        </div>
        <div className={styles.code}>
          {entryCodeString.split("").map((d, i) => (
            <div className={classNames({ [styles.digit]: true, [styles[`digit_${i}`]]: true })} key={`link_code_${i}`}>
              {d}
            </div>
          ))}
        </div>
        <div className={styles.codeDuration}>
          <FormattedMessage id="invite.duration_of_code" />
        </div>
        {embedUrl && (
          <div className={styles.embed}>
            <div>
              <FormattedMessage id={`invite.embed`} />
            </div>
            <div className={styles.embedText}>
              <input
                type="text"
                readOnly
                onFocus={e => {
                  e.target.select();
                  this.setState({ showEmbedTip: true });
                }}
                onBlur={() => this.setState({ showEmbedTip: false })}
                value={embedText}
              />
            </div>
            {this.state.showEmbedTip && (
              <div className={styles.embedTipWrap}>
                <div className={styles.embedTip}>
                  <div className={styles.embedTipAttachPoint} />
                  <FormattedMessage id="invite.embed-tip" />
                </div>
              </div>
            )}
          </div>
        )}
        {this.props.hasPush && (
          <div className={styles.subscribe}>
            <input
              id="subscribe"
              type="checkbox"
              onChange={() => this.props.onSubscribeChanged()}
              checked={this.props.isSubscribed}
            />
            <label htmlFor="subscribe">
              <FormattedMessage id="entry.notify_me" />
            </label>
          </div>
        )}

        {this.props.isModal && (
          <button className={styles.enterVrButton} onClick={() => this.props.onClose()}>
            <FormattedMessage id="entry.return-to-vr" />
          </button>
        )}
      </div>
    );
  }
}

export default injectIntl(InviteDialog);
