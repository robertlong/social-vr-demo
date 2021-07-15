// We should technically be able to just include three here, but our dependancies are tangled such that not having aframe is a bit difficult
import "./utils/theme";
console.log(`Hubs version: ${process.env.BUILD_VERSION || "?"}`);

import "aframe";
import "./utils/logging";

import ReactDOM from "react-dom";
import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { FormattedMessage } from "react-intl";
import { WrappedIntlProvider } from "./react-components/wrapped-intl-provider";

import configs from "./utils/configs";

import { disableiOSZoom } from "./utils/disable-ios-zoom";
disableiOSZoom();

import { App } from "./App";

import AvatarPreview from "./react-components/avatar-preview";

import { fetchAvatar, remixAvatar } from "./utils/avatar-utils";

import "./react-components/styles/global.scss";
import styles from "./assets/stylesheets/avatar.scss";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClone } from "@fortawesome/free-solid-svg-icons/faClone";
import { ThemeProvider } from "./react-components/styles/theme";

const qs = new URLSearchParams(location.search);
window.APP = new App();

class AvatarPage extends React.Component {
  static propTypes = {
    avatarId: PropTypes.string,
    store: PropTypes.object,
    intl: PropTypes.object
  };

  constructor(props) {
    super(props);
    this.state = { copyMessage: null };
  }

  componentDidMount() {
    this.props.store.addEventListener("statechanged", this.storeUpdated);
    this.refetchAvatar();
  }

  componentWillUnmount() {
    this.props.store.removeEventListener("statechanged", this.storeUpdated);
  }

  storeUpdated = () => this.forceUpdate();

  refetchAvatar = async () => {
    const avatar = await fetchAvatar(this.props.avatarId);
    this.setState({ avatar });
  };

  setAvatar = e => {
    e && e.preventDefault();
    this.props.store.update({
      profile: { avatarId: this.state.avatar.avatar_id }
    });
  };

  handleCopyAvatar = async e => {
    e.preventDefault();
    const { avatar } = this.state;
    this.setState({ copyState: "copying" });
    await remixAvatar(avatar.avatar_id, avatar.name);
    this.setState({ copyState: "copied" });
    setTimeout(() => this.setState({ copyMessage: null }), 2000);
  };

  render() {
    const { avatar, copyState } = this.state;
    if (!avatar) {
      return (
        <div className={styles.avatarLanding}>
          <div className={classNames([styles.box, styles.darkened])}>
            <FormattedMessage id="avatar-page.loading" defaultMessage="Loading" />
          </div>
        </div>
      );
    }

    const selectedAvatarId = this.props.store.state.profile.avatarId;
    const isSelected = avatar.avatar_id === selectedAvatarId;

    return (
      <form onSubmit={this.setAvatar} className={styles.avatarLanding}>
        <div className={classNames([styles.box, styles.darkened])}>
          <label className={styles.title}>
            <span>{avatar.name}</span>
          </label>
          <div className={styles.attributions}>
            {avatar.attributions && avatar.attributions.creator && <span>{`by ${avatar.attributions.creator}`}</span>}
          </div>
          <div className={styles.preview}>
            {avatar && <AvatarPreview avatarGltfUrl={avatar.gltf_url} />}
            {copyState ? (
              <div className={styles.copyTip}>
                {copyState === "copying" ? (
                  <FormattedMessage id="avatar-page.copying-avatar" defaultMessage="Copying..." />
                ) : (
                  <FormattedMessage id="avatar-page.copyied-avatar" defaultMessage="Copied" />
                )}
              </div>
            ) : (
              avatar &&
              avatar.type === "avatar_listing" &&
              avatar.allow_remixing && (
                <a
                  className={styles.editAvatar}
                  onClick={this.handleCopyAvatar}
                  title={<FormattedMessage id="avatar-page.copy-button" defaultMessage="Copy to my avatars" />}
                >
                  <FontAwesomeIcon icon={faClone} />
                </a>
              )
            )}
          </div>
          {isSelected ? (
            <span className={styles.selectedMessage}>
              <FormattedMessage id="avatar-page.selected" defaultMessage="This is your current avatar" />
            </span>
          ) : (
            <button disabled={isSelected} className={styles.formSubmit} type="submit">
              <FormattedMessage id="avatar-page.select" defaultMessage="Select" />
            </button>
          )}
        </div>
        <img
          className={styles.logo}
          src={configs.image("logo")}
          alt={<FormattedMessage id="avatar-page.logo" defaultMessage="Logo" />}
        />
      </form>
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const avatarId = qs.get("avatar_id") || document.location.pathname.substring(1).split("/")[1];
  console.log(`Avatar ID: ${avatarId}`);
  ReactDOM.render(
    <WrappedIntlProvider>
      <ThemeProvider store={window.APP.store}>
        <AvatarPage avatarId={avatarId} store={window.APP.store} />
      </ThemeProvider>
    </WrappedIntlProvider>,
    document.getElementById("ui-root")
  );
});
