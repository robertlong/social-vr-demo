import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { Modal } from "../modal/Modal";
import { Button } from "../input/Button";
import { ReactComponent as MicrophoneIcon } from "../icons/Microphone.svg";
import { ReactComponent as MicrophoneMutedIcon } from "../icons/MicrophoneMuted.svg";
import { ReactComponent as VolumeHighIcon } from "../icons/VolumeHigh.svg";
import { ReactComponent as VolumeOffIcon } from "../icons/VolumeOff.svg";
import styles from "./MicSetupModal.scss";
import { BackButton } from "../input/BackButton";
import { SelectInputField } from "../input/SelectInputField";
import { ToggleInput } from "../input/ToggleInput";
import { ToolbarButton } from "../input/ToolbarButton";
import { Column } from "../layout/Column";

const micButtonDiameter = 96;

export function MicSetupModal({
  className,
  onPromptMicrophone,
  selectedMicrophone,
  microphoneOptions,
  onChangeMicrophone,
  microphoneEnabled,
  micLevel,
  soundPlaying,
  onPlaySound,
  microphoneMuted,
  onChangeMicrophoneMuted,
  onEnterRoom,
  onBack,
  ...rest
}) {
  return (
    <Modal
      title="Microphone Setup"
      beforeTitle={<BackButton onClick={onBack} />}
      onEscape={onBack}
      className={className}
      {...rest}
    >
      <Column center padding className={styles.content}>
        <p>Check your microphone and audio before entering.</p>
        <div className={styles.audioCheckContainer}>
          <ToolbarButton
            icon={
              microphoneEnabled && !microphoneMuted ? (
                <MicrophoneIcon width={48} height={48} />
              ) : (
                <MicrophoneMutedIcon width={48} height={48} />
              )
            }
            label={microphoneEnabled ? "Talk to Test Microphone" : "Microphone Disabled"}
            className={classNames(styles.largeToolbarButton, styles.micButton)}
            iconContainerClassName={styles.micButtonContainer}
            onClick={onPromptMicrophone}
            disabled={microphoneEnabled}
            large
          >
            <div
              className={styles.micLevelIcon}
              style={{
                clip: `rect(${micButtonDiameter -
                  Math.floor(micLevel * micButtonDiameter)}px, ${micButtonDiameter}px, ${micButtonDiameter}px, 0px)`
              }}
            >
              {microphoneEnabled && !microphoneMuted ? (
                <MicrophoneIcon className={styles.clippedIcon} width={48} height={48} />
              ) : (
                <MicrophoneMutedIcon className={styles.clippedIcon} width={48} height={48} />
              )}
            </div>
            <div
              className={styles.micLevel}
              style={{
                clip: `rect(${micButtonDiameter -
                  Math.floor(micLevel * micButtonDiameter)}px, ${micButtonDiameter}px, ${micButtonDiameter}px, 0px)`
              }}
            >
              <svg
                width={micButtonDiameter}
                height={micButtonDiameter}
                viewBox={`0 0 ${micButtonDiameter} ${micButtonDiameter}`}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx={micButtonDiameter / 2}
                  cy={micButtonDiameter / 2}
                  r={micButtonDiameter / 2}
                  fill="currentColor"
                  fillOpacity="0.8"
                />
              </svg>
            </div>
          </ToolbarButton>
          <ToolbarButton
            icon={soundPlaying ? <VolumeHighIcon width={48} height={48} /> : <VolumeOffIcon width={48} height={48} />}
            label="Click to Test Audio"
            preset={soundPlaying ? "blue" : "basic"}
            className={styles.largeToolbarButton}
            onClick={onPlaySound}
            large
          />
        </div>
        {microphoneEnabled && (
          <>
            <SelectInputField value={selectedMicrophone} options={microphoneOptions} onChange={onChangeMicrophone} />
            <ToggleInput label="Mute My Microphone" checked={microphoneMuted} onChange={onChangeMicrophoneMuted} />
          </>
        )}
        <Button preset="green" onClick={onEnterRoom}>
          Enter Room
        </Button>
      </Column>
    </Modal>
  );
}

MicSetupModal.propTypes = {
  className: PropTypes.string,
  soundPlaying: PropTypes.bool,
  onPlaySound: PropTypes.func,
  micLevel: PropTypes.number,
  microphoneEnabled: PropTypes.bool,
  microphoneMuted: PropTypes.bool,
  onChangeMicrophoneMuted: PropTypes.func,
  selectedMicrophone: PropTypes.string,
  microphoneOptions: PropTypes.array,
  onChangeMicrophone: PropTypes.func,
  onPromptMicrophone: PropTypes.func,
  onEnterRoom: PropTypes.func,
  onBack: PropTypes.func
};

MicSetupModal.defaultProps = {
  micLevel: 0
};
