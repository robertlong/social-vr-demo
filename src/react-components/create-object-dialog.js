import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { injectIntl, FormattedMessage } from "react-intl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip } from "@fortawesome/free-solid-svg-icons/faPaperclip";
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";

import configs from "../utils/configs";
import IfFeature from "./if-feature";
import giphyLogo from "../assets/images/giphy_logo.png";
import styles from "../assets/stylesheets/create-object-dialog.scss";
import ducky from "../assets/models/DuckyMesh.glb";
import DialogContainer from "./dialog-container.js";
import { handleTextFieldFocus, handleTextFieldBlur } from "../utils/focus-utils";
import { getAbsoluteHref } from "../utils/media-url-utils";
import { WithHoverSound } from "./wrap-with-audio";

const attributionHostnames = {
  "giphy.com": giphyLogo,
  "media.giphy.com": giphyLogo
};

const isMobile = AFRAME.utils.device.isMobile() || AFRAME.utils.device.isMobileVR();
const references = (
  <span>
    <FormattedMessage id="create-object-dialog.references.pre" />{" "}
    <a href="https://sketchfab.com/search?features=downloadable&type=models" target="_blank" rel="noopener noreferrer">
      <FormattedMessage id="create-object-dialog.references.sketchfab" />
    </a>{" "}
    <FormattedMessage id="create-object-dialog.references.and" />{" "}
    <a href="http://poly.google.com/" target="_blank" rel="noopener noreferrer">
      <FormattedMessage id="create-object-dialog.references.poly" />
    </a>{" "}
    <IfFeature name="show_model_collection_link">
      <FormattedMessage id="create-object-dialog.references.or-our" />{" "}
      <a
        href={configs.link("model_collection", "https://sketchfab.com/mozillareality")}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FormattedMessage id="create-object-dialog.references.collection" />
      </a>{" "}
    </IfFeature>
    <FormattedMessage id="create-object-dialog.references.post" />
  </span>
);

const mobileInstructions = (
  <div>
    <p>
      <FormattedMessage id="create-object-dialog.instructions" />
    </p>
    <p>{references}</p>
  </div>
);
const desktopInstructions = (
  <div>
    <p>
      <FormattedMessage id="create-object-dialog.instructions" />
    </p>
    <p>{references}</p>
    <p>
      <FormattedMessage id="create-object-dialog.desktop-tips" />
    </p>
  </div>
);

let lastUrl = "";
const fileInputId = "file-input";

class CreateObjectDialog extends Component {
  state = {
    url: "",
    file: null,
    fileName: ""
  };

  static propTypes = {
    intl: PropTypes.object,
    onCreate: PropTypes.func,
    onClose: PropTypes.func
  };

  componentDidMount() {
    this.setState({ url: lastUrl });
  }

  componentWillUnmount() {
    lastUrl = this.state.url;
  }

  onUrlChange = e => {
    let attributionImage = this.state.attributionImage;
    if (e.target && e.target.value && e.target.validity.valid) {
      const url = new URL(e.target.value);
      attributionImage = attributionHostnames[url.hostname];
    }
    this.setState({
      url: e.target && e.target.value,
      attributionImage: attributionImage
    });
  };

  onFileChange = e => {
    this.setState({
      file: e.target.files[0],
      fileName: e.target.files[0].name
    });
  };

  reset = e => {
    e.preventDefault();
    this.setState({
      url: "",
      file: null,
      fileName: ""
    });
    this.fileInput.value = null;
  };

  onCreateClicked = e => {
    e.preventDefault();
    this.props.onCreate(this.state.file || this.state.url || getAbsoluteHref(location.href, ducky));
    this.props.onClose();
  };

  render() {
    const { formatMessage } = this.props.intl;
    const { onCreate, onClose, ...other } = this.props; // eslint-disable-line no-unused-vars

    const cancelButton = (
      <WithHoverSound>
        <label className={cx(styles.smallButton, styles.cancelIcon)} onClick={this.reset}>
          <FontAwesomeIcon icon={faTimes} />
        </label>
      </WithHoverSound>
    );
    const uploadButton = (
      <WithHoverSound>
        <label htmlFor={fileInputId} className={cx(styles.smallButton, styles.uploadIcon)}>
          <FontAwesomeIcon icon={faPaperclip} />
        </label>
      </WithHoverSound>
    );
    const filenameLabel = <label className={cx(styles.leftSideOfInput)}>{this.state.fileName}</label>;
    const urlInput = (
      <input
        className={cx(styles.leftSideOfInput)}
        placeholder="Image/Video/glTF URL"
        onFocus={e => handleTextFieldFocus(e.target)}
        onBlur={() => handleTextFieldBlur()}
        onChange={this.onUrlChange}
        type="url"
        value={this.state.url}
      />
    );

    return (
      <DialogContainer
        title={formatMessage({ id: "create-object-dialog.title" })}
        onClose={this.props.onClose}
        {...other}
      >
        <div>
          {isMobile ? mobileInstructions : desktopInstructions}
          <form onSubmit={this.onCreateClicked}>
            <div className={styles.addMediaForm}>
              <input
                id={fileInputId}
                ref={f => (this.fileInput = f)}
                className={styles.hideFileInput}
                type="file"
                onChange={this.onFileChange}
              />
              <div className={styles.inputBorder}>
                {this.state.file ? filenameLabel : urlInput}
                {this.state.url || this.state.fileName ? cancelButton : uploadButton}
              </div>
              <div className={styles.buttons}>
                <WithHoverSound>
                  <button className={styles.actionButton}>
                    <span>
                      <FormattedMessage id="create-object-dialog.create" />
                    </span>
                  </button>
                </WithHoverSound>
              </div>
              {this.state.attributionImage ? (
                <div>
                  <img src={this.state.attributionImage} />
                </div>
              ) : null}
            </div>
          </form>
        </div>
      </DialogContainer>
    );
  }
}

export default injectIntl(CreateObjectDialog);
