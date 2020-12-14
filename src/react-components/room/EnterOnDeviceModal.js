import React from "react";
import PropTypes from "prop-types";
import { Modal } from "../modal/Modal";
import { Button } from "../input/Button";
import { ReactComponent as VRIcon } from "../icons/VR.svg";
import styles from "./EnterOnDeviceModal.scss";
import { BackButton } from "../input/BackButton";
import { Column } from "../layout/Column";

export function EnterOnDeviceModal({
  className,
  shortUrl,
  loadingCode,
  code,
  headsetConnected,
  unsupportedBrowser,
  onEnterOnConnectedHeadset,
  onBack,
  ...rest
}) {
  return (
    <Modal
      title="Enter on Device"
      beforeTitle={<BackButton onClick={onBack} />}
      className={className}
      {...rest}
      onEscape={onBack}
    >
      <Column center={loadingCode ? "both" : true} padding grow>
        {loadingCode ? (
          <b>Generating join code...</b>
        ) : (
          <>
            <b>Enter on Wireless Headset / Phone</b>
            <small>{"In your device's web browser, go to:"}</small>
            <div className={styles.shortUrlContainer}>{shortUrl}</div>
            <small>Then, enter this one-time code:</small>
            <div className={styles.codeContainer}>
              {code.split("").map((char, i) => (
                <div key={i} className={styles.codeLetter}>
                  {char}
                </div>
              ))}
            </div>
            <strong>Your account and avatar will be transferred to the device.</strong>
            <strong>Keep this page open to use this code.</strong>
            {headsetConnected && (
              <>
                <hr data-or-text="or" />
                <b>Enter on Connected Headset</b>
                {unsupportedBrowser ? (
                  <>
                    <small>
                      {"WebVR isn't supported in this browser, to enter with Oculus or SteamVR, use Firefox."}
                    </small>
                    <Button
                      as="a"
                      preset="orange"
                      href="https://www.mozilla.org/firefox/"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <span>Download Firefox</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <small>You have a VR headset connected to this device.</small>
                    <Button preset="purple" onClick={onEnterOnConnectedHeadset}>
                      <VRIcon />
                      <span>Enter in VR</span>
                    </Button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </Column>
    </Modal>
  );
}

EnterOnDeviceModal.propTypes = {
  className: PropTypes.string,
  shortUrl: PropTypes.string.isRequired,
  loadingCode: PropTypes.bool,
  code: PropTypes.string,
  headsetConnected: PropTypes.bool,
  unsupportedBrowser: PropTypes.bool,
  onEnterOnConnectedHeadset: PropTypes.func,
  onBack: PropTypes.func
};
