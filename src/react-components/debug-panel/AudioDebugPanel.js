import React, { useCallback, useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { FormattedMessage } from "react-intl";
import styles from "./AudioDebugPanel.scss";
import { CollapsiblePanel } from ".//CollapsiblePanel";
import classNames from "classnames";
import {
  CLIPPING_THRESHOLD_ENABLED,
  CLIPPING_THRESHOLD_MIN,
  CLIPPING_THRESHOLD_MAX,
  CLIPPING_THRESHOLD_STEP,
  CLIPPING_THRESHOLD_DEFAULT,
  GLOBAL_VOLUME_MIN,
  GLOBAL_VOLUME_MAX,
  GLOBAL_VOLUME_STEP,
  GLOBAL_VOLUME_DEFAULT
} from "../../react-components/preferences-screen";
import { SelectInputField } from "../input/SelectInputField";
import { DISTANCE_MODEL_OPTIONS, DistanceModelType } from "../../components/audio-params";

const ROLLOFF_MIN = 0.0;
const ROLLOFF_MAX = 20.0;
const ROLLOFF_STEP = 0.5;
const ROLLOFF_LIN_MIN = 0.0;
const ROLLOFF_LIN_MAX = 1.0;
const ROLLOFF_LIN_STEP = 0.01;
const DISTANCE_MIN = 1.0;
const DISTANCE_MAX = 100.0;
const DISTANCE_STEP = 1.0;
const ANGLE_MIN = 0.0;
const ANGLE_MAX = 360.0;
const ANGLE_STEP = 1.0;
const GAIN_MIN = 0.0;
const GAIN_MAX = 1.0;
const GAIN_STEP = 0.1;

function SelectProperty({ defaultValue, options, onChange, children }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className={classNames(styles.audioDebugRow)}>
      <span style={{ flex: "none", padEnd: "10px" }}>{children}</span>
      <SelectInputField
        value={value}
        options={options}
        onChange={newValue => {
          setValue(newValue);
          onChange(newValue);
        }}
      />
    </div>
  );
}

SelectProperty.propTypes = {
  defaultValue: PropTypes.string,
  options: PropTypes.array,
  onChange: PropTypes.func,
  children: PropTypes.node
};

function SliderProperty({ defaultValue, step, min, max, onChange, children }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className={classNames(styles.audioDebugRow)}>
      <span style={{ flex: "none", padEnd: "10px" }}>{children}</span>
      <input
        type="range"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const parsedValue = parseFloat(e.target.value);
          setValue(parsedValue);
          onChange(parsedValue);
        }}
      />
      <span className={classNames(styles.valueText)}>{value}</span>
    </div>
  );
}

SliderProperty.propTypes = {
  defaultValue: PropTypes.number,
  step: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  onChange: PropTypes.func,
  children: PropTypes.node
};

export function AudioDebugPanel({ isNarrow, collapsed, onCollapsed }) {
  const scene = useRef(document.querySelector("a-scene"));
  const audioSettings = useRef(scene.current.systems["hubs-systems"].audioSettingsSystem);
  const store = useRef(window.APP.store);

  const {
    enableAudioClipping,
    audioClippingThreshold,
    globalVoiceVolume,
    globalMediaVolume
  } = store.current.state.preferences;
  const [clippingEnabled, setClippingEnabled] = useState(
    enableAudioClipping !== undefined ? enableAudioClipping : CLIPPING_THRESHOLD_ENABLED
  );
  const [clippingThreshold, setClippingThreshold] = useState(
    audioClippingThreshold !== undefined ? audioClippingThreshold : CLIPPING_THRESHOLD_DEFAULT
  );
  const [voiceVolume, setVoiceVolume] = useState(
    globalVoiceVolume !== undefined ? globalVoiceVolume : GLOBAL_VOLUME_DEFAULT
  );
  const [mediaVolume, setMediaVolume] = useState(
    globalMediaVolume !== undefined ? globalMediaVolume : GLOBAL_VOLUME_DEFAULT
  );
  const [avatarDistanceModel, setAvatarDistanceModel] = useState(
    audioSettings.current.defaultSettings.avatarDistanceModel
  );
  const [avatarRolloffFactor, setAvatarRolloffFactor] = useState(
    audioSettings.current.defaultSettings.avatarRolloffFactor
  );
  const [avatarRefDistance, setAvatarRefDistance] = useState(audioSettings.current.defaultSettings.avatarRefDistance);
  const [avatarMaxDistance, setAvatarMaxDistance] = useState(audioSettings.current.defaultSettings.avatarMaxDistance);
  const [avatarConeInnerAngle, setAvatarConeInnerAngle] = useState(
    audioSettings.current.defaultSettings.avatarConeInnerAngle
  );
  const [avatarConeOuterAngle, setAvatarConeOuterAngle] = useState(
    audioSettings.current.defaultSettings.avatarConeOuterAngle
  );
  const [avatarConeOuterGain, setAvatarConeOuterGain] = useState(
    audioSettings.current.defaultSettings.avatarConeOuterGain
  );
  const [mediaDistanceModel, setMediaDistanceModel] = useState(
    audioSettings.current.defaultSettings.mediaDistanceModel
  );
  const [mediaRolloffFactor, setMediaRolloffFactor] = useState(
    audioSettings.current.defaultSettings.mediaRolloffFactor
  );
  const [mediaRefDistance, setMediaRefDistance] = useState(audioSettings.current.defaultSettings.mediaRefDistance);
  const [mediaMaxDistance, setMediaMaxDistance] = useState(audioSettings.current.defaultSettings.mediaMaxDistance);
  const [mediaConeInnerAngle, setMediaConeInnerAngle] = useState(
    audioSettings.current.defaultSettings.mediaConeInnerAngle
  );
  const [mediaConeOuterAngle, setMediaConeOuterAngle] = useState(
    audioSettings.current.defaultSettings.mediaConeOuterAngle
  );
  const [mediaConeOuterGain, setMediaConeOuterGain] = useState(
    audioSettings.current.defaultSettings.mediaConeOuterGain
  );

  const onPreferencesUpdated = useCallback(
    () => {
      const {
        enableAudioClipping,
        audioClippingThreshold,
        globalVoiceVolume,
        globalMediaVolume
      } = store.current.state.preferences;
      const clippingEnabled = enableAudioClipping !== undefined ? enableAudioClipping : CLIPPING_THRESHOLD_DEFAULT;
      const clippingThreshold =
        audioClippingThreshold !== undefined ? audioClippingThreshold : CLIPPING_THRESHOLD_DEFAULT;
      setClippingEnabled(enableAudioClipping);
      setClippingThreshold(clippingThreshold);
      setVoiceVolume(globalVoiceVolume);
      setMediaVolume(globalMediaVolume);
      const audioParams = scene.current.querySelectorAll("[audio-params]");
      audioParams.forEach(source => {
        source.setAttribute("audio-params", {
          clippingThreshold,
          clippingEnabled
        });
      });
    },
    [setClippingEnabled, setClippingThreshold, setVoiceVolume, setMediaVolume]
  );

  useEffect(
    () => {
      onPreferencesUpdated();
      store.current.addEventListener("statechanged", onPreferencesUpdated);

      const currentStore = store.current;
      return () => {
        currentStore.removeEventListener("statechanged", onPreferencesUpdated);
      };
    },
    [store, onPreferencesUpdated]
  );

  const updateAudioSettings = newSettings => {
    const prevSettings = {
      avatarDistanceModel,
      avatarRefDistance,
      avatarMaxDistance,
      avatarRolloffFactor,
      avatarConeInnerAngle,
      avatarConeOuterAngle,
      avatarConeOuterGain,
      mediaDistanceModel,
      mediaRefDistance,
      mediaMaxDistance,
      mediaRolloffFactor,
      mediaConeInnerAngle,
      mediaConeOuterAngle,
      mediaConeOuterGain
    };
    const settings = Object.assign({}, prevSettings, newSettings);
    audioSettings.current.updateAudioSettings(settings);
  };

  return (
    <div
      className={classNames(styles.audioDebugContainer)}
      style={{
        height: isNarrow && !collapsed && "80%",
        maxHeight: isNarrow && !collapsed && "80%"
      }}
    >
      <CollapsiblePanel
        title={<FormattedMessage id="audio-debug-panel.audio-debug-title" defaultMessage="Audio Debug" />}
        isRoot
        border
        collapsed={collapsed}
        onCollapse={onCollapsed}
      >
        <CollapsiblePanel
          title={<FormattedMessage id="audio-debug-panel.audio-debug-global-title" defaultMessage="Globals" />}
          border
          grow
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              tabIndex="0"
              type="checkbox"
              checked={clippingEnabled}
              onChange={() => {
                store.current.update({
                  preferences: {
                    enableAudioClipping: !clippingEnabled
                  }
                });
              }}
              style={{ marginLeft: "10px" }}
            />
            <SliderProperty
              defaultValue={clippingThreshold}
              step={CLIPPING_THRESHOLD_STEP}
              min={CLIPPING_THRESHOLD_MIN}
              max={CLIPPING_THRESHOLD_MAX}
              onChange={value => {
                store.current.update({
                  preferences: {
                    audioClippingThreshold: value
                  }
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.global.clippingThreshold" defaultMessage="Clipping" />
              </p>
            </SliderProperty>
          </div>
          <SliderProperty
            defaultValue={voiceVolume}
            step={GLOBAL_VOLUME_STEP}
            min={GLOBAL_VOLUME_MIN}
            max={GLOBAL_VOLUME_MAX}
            onChange={value => {
              store.current.update({
                preferences: {
                  globalVoiceVolume: value
                }
              });
            }}
          >
            <p className={classNames(styles.propText)}>
              <FormattedMessage id="audio-debug-view.global.voiceVolume" defaultMessage="Voice Volume" />
            </p>
          </SliderProperty>
          <SliderProperty
            defaultValue={mediaVolume}
            step={GLOBAL_VOLUME_STEP}
            min={GLOBAL_VOLUME_MIN}
            max={GLOBAL_VOLUME_MAX}
            onChange={value => {
              store.current.update({
                preferences: {
                  globalMediaVolume: value
                }
              });
            }}
          >
            <p className={classNames(styles.propText)}>
              <FormattedMessage id="audio-debug-view.global.mediaVolume" defaultMessage="Media Volume" />
            </p>
          </SliderProperty>
        </CollapsiblePanel>
        <div style={{ display: "flex" }}>
          <CollapsiblePanel
            title={<FormattedMessage id="audio-debug-panel.audio-debug-avatar-title" defaultMessage="Avatar" />}
            border
            grow
          >
            <SelectProperty
              defaultValue={audioSettings.current.defaultSettings.avatarDistanceModel}
              options={DISTANCE_MODEL_OPTIONS}
              onChange={value => {
                setAvatarDistanceModel(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    distanceModel: value
                  });
                });
                if (value === DistanceModelType.Linear && avatarRolloffFactor > 1.0) {
                  setAvatarRolloffFactor(1.0);
                }
                updateAudioSettings({
                  avatarDistanceModel: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.distanceModel" defaultMessage="Distance Model" />
              </p>
            </SelectProperty>
            <SliderProperty
              defaultValue={avatarRolloffFactor}
              step={avatarDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_STEP : ROLLOFF_STEP}
              min={avatarDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_MIN : ROLLOFF_MIN}
              max={avatarDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_MAX : ROLLOFF_MAX}
              onChange={value => {
                setAvatarRolloffFactor(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    rolloffFactor: value
                  });
                });
                updateAudioSettings({
                  avatarRolloffFactor: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.rolloffFactor" defaultMessage="Rolloff" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={avatarRefDistance}
              step={DISTANCE_STEP}
              min={DISTANCE_MIN}
              max={DISTANCE_MAX}
              onChange={value => {
                setAvatarRefDistance(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    refDistance: value
                  });
                });
                updateAudioSettings({
                  avatarRefDistance: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.refDistance" defaultMessage="Ref Distance" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={avatarMaxDistance}
              step={DISTANCE_STEP}
              min={DISTANCE_MIN}
              max={DISTANCE_MAX}
              onChange={value => {
                setAvatarMaxDistance(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    maxDistance: value
                  });
                });
                updateAudioSettings({
                  avatarMaxDistance: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.maxDistance" defaultMessage="Max Distance" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={avatarConeInnerAngle}
              step={ANGLE_STEP}
              min={ANGLE_MIN}
              max={ANGLE_MAX}
              onChange={value => {
                setAvatarConeInnerAngle(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneInnerAngle: value
                  });
                });
                updateAudioSettings({
                  avatarConeInnerAngle: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.innerAngle" defaultMessage="Inner Angle" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={avatarConeOuterAngle}
              step={ANGLE_STEP}
              min={ANGLE_MIN}
              max={ANGLE_MAX}
              onChange={value => {
                setAvatarConeOuterAngle(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneOuterAngle: value
                  });
                });
                updateAudioSettings({
                  avatarConeOuterAngle: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.outerAngle" defaultMessage="Outer Angle" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={avatarConeOuterGain}
              step={GAIN_STEP}
              min={GAIN_MIN}
              max={GAIN_MAX}
              onChange={value => {
                setAvatarConeOuterGain(value);
                const avatarAudioSources = scene.current.querySelectorAll("[avatar-audio-source]");
                avatarAudioSources.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneOuterGain: value
                  });
                });
                updateAudioSettings({
                  avatarConeOuterGain: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.avatar.outerGain" defaultMessage="Outer Gain" />
              </p>
            </SliderProperty>
          </CollapsiblePanel>
          <CollapsiblePanel
            title={<FormattedMessage id="audio-debug-panel.audio-debug-media-title" defaultMessage="Media" />}
            border
            grow
          >
            <SelectProperty
              defaultValue={audioSettings.current.defaultSettings.mediaDistanceModel}
              options={DISTANCE_MODEL_OPTIONS}
              onChange={value => {
                setMediaDistanceModel(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    distanceModel: value
                  });
                });
                if (value === DistanceModelType.Linear && mediaRolloffFactor > 1.0) {
                  setMediaRolloffFactor(1.0);
                }
                updateAudioSettings({
                  mediaDistanceModel: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.distanceModel" defaultMessage="Distance Model" />
              </p>
            </SelectProperty>
            <SliderProperty
              defaultValue={mediaRolloffFactor}
              step={mediaDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_STEP : ROLLOFF_STEP}
              min={mediaDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_MIN : ROLLOFF_MIN}
              max={mediaDistanceModel === DistanceModelType.Linear ? ROLLOFF_LIN_MAX : ROLLOFF_MAX}
              onChange={value => {
                setMediaRolloffFactor(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    rolloffFactor: value
                  });
                });
                updateAudioSettings({
                  mediaRolloffFactor: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.rolloffFactor" defaultMessage="Rolloff" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={mediaRefDistance}
              step={DISTANCE_STEP}
              min={DISTANCE_MIN}
              max={DISTANCE_MAX}
              onChange={value => {
                setMediaRefDistance(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    refDistance: value
                  });
                });
                updateAudioSettings({
                  mediaRefDistance: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.refDistance" defaultMessage="Ref Distance" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={mediaMaxDistance}
              step={DISTANCE_STEP}
              min={DISTANCE_MIN}
              max={DISTANCE_MAX}
              onChange={value => {
                setMediaMaxDistance(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    maxDistance: value
                  });
                });
                updateAudioSettings({
                  mediaMaxDistance: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.maxDistance" defaultMessage="Max Distance" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={mediaConeInnerAngle}
              step={ANGLE_STEP}
              min={ANGLE_MIN}
              max={ANGLE_MAX}
              onChange={value => {
                setMediaConeInnerAngle(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneInnerAngle: value
                  });
                });
                updateAudioSettings({
                  mediaConeInnerAngle: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.innerAngle" defaultMessage="Inner Angle" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={mediaConeOuterAngle}
              step={ANGLE_STEP}
              min={ANGLE_MIN}
              max={ANGLE_MAX}
              onChange={value => {
                setMediaConeOuterAngle(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneOuterAngle: value
                  });
                });
                updateAudioSettings({
                  mediaConeOuterAngle: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.outerAngle" defaultMessage="Outer Angle" />
              </p>
            </SliderProperty>
            <SliderProperty
              defaultValue={mediaConeOuterGain}
              step={GAIN_STEP}
              min={GAIN_MIN}
              max={GAIN_MAX}
              onChange={value => {
                setMediaConeOuterGain(value);
                const elements = scene.current.querySelectorAll("[media-video], [audio-target]");
                elements.forEach(source => {
                  source.setAttribute("audio-params", {
                    coneOuterGain: value
                  });
                });
                updateAudioSettings({
                  mediaConeOuterGain: value
                });
              }}
            >
              <p className={classNames(styles.propText)}>
                <FormattedMessage id="audio-debug-view.media.outerGain" defaultMessage="Outer Gain" />
              </p>
            </SliderProperty>
          </CollapsiblePanel>
        </div>
      </CollapsiblePanel>
    </div>
  );
}

AudioDebugPanel.propTypes = {
  isNarrow: PropTypes.bool,
  collapsed: PropTypes.bool,
  onCollapsed: PropTypes.func,
  children: PropTypes.node
};
