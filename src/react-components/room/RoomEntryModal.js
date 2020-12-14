import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { Modal } from "../modal/Modal";
import { Button } from "../input/Button";
import { ReactComponent as EnterIcon } from "../icons/Enter.svg";
import { ReactComponent as VRIcon } from "../icons/VR.svg";
import { ReactComponent as ShowIcon } from "../icons/Show.svg";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import styles from "./RoomEntryModal.scss";
import styleUtils from "../styles/style-utils.scss";
import { useCssBreakpoints } from "react-use-css-breakpoints";
import { Column } from "../layout/Column";

export function RoomEntryModal({
  appName,
  logoSrc,
  className,
  roomName,
  showJoinRoom,
  onJoinRoom,
  showEnterOnDevice,
  onEnterOnDevice,
  showSpectate,
  onSpectate,
  showOptions,
  onOptions,
  ...rest
}) {
  const breakpoint = useCssBreakpoints();
  return (
    <Modal className={classNames(styles.roomEntryModal, className)} disableFullscreen disableFocusLock {...rest}>
      <Column center className={styles.content}>
        {breakpoint !== "sm" &&
          breakpoint !== "md" && (
            <div className={styles.logoContainer}>
              <img src={logoSrc} alt={appName} />
            </div>
          )}
        <div className={styles.roomName}>
          <h5>Room Name</h5>
          <p>{roomName}</p>
        </div>
        <Column center className={styles.buttons}>
          {showJoinRoom && (
            <Button preset="blue" onClick={onJoinRoom}>
              <EnterIcon /> Join Room
            </Button>
          )}
          {showEnterOnDevice && (
            <Button preset="purple" onClick={onEnterOnDevice}>
              <VRIcon /> Enter On Device
            </Button>
          )}
          {showSpectate && (
            <Button preset="orange" onClick={onSpectate}>
              <ShowIcon /> Spectate
            </Button>
          )}
          {showOptions &&
            breakpoint !== "sm" && (
              <>
                <hr className={styleUtils.showLg} />
                <Button preset="transparent" className={styleUtils.showLg} onClick={onOptions}>
                  <SettingsIcon /> Options
                </Button>
              </>
            )}
        </Column>
      </Column>
    </Modal>
  );
}

RoomEntryModal.propTypes = {
  appName: PropTypes.string,
  logoSrc: PropTypes.string,
  className: PropTypes.string,
  roomName: PropTypes.string.isRequired,
  showJoinRoom: PropTypes.bool,
  onJoinRoom: PropTypes.func,
  showEnterOnDevice: PropTypes.bool,
  onEnterOnDevice: PropTypes.func,
  showSpectate: PropTypes.bool,
  onSpectate: PropTypes.func,
  showOptions: PropTypes.bool,
  onOptions: PropTypes.func
};

RoomEntryModal.defaultProps = {
  showJoinRoom: true,
  showEnterOnDevice: true,
  showSpectate: true,
  showOptions: true
};
