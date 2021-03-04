import React, { Component, useState, useEffect, createRef } from "react";
import PropTypes from "prop-types";
import styles from "./FloatingShareVideo.scss";
import clsx from "classnames";

const TOTAL_WEBCAMS_TO_RENDER = 3;

export function FloatingShareVideo(props) {
  const [webcams, setWebcams] = useState([]);

  useEffect(
    () => {
      // TODO sort by audio here
      const webcamsChanged = () => {
        console.log("webcamsChanged");
        const nafWebcams = NAF.connection.adapter._webcams;
        console.log(nafWebcams);
        const webcamList = Object.keys(nafWebcams).map(consumerId => nafWebcams[consumerId]);
        console.log(webcamList);
        setWebcams(webcamList);
      };
      props.scene.addEventListener("webcams-changed", webcamsChanged);
    },
    [props.scene, webcams]
  );
  return (
    <div className={styles.videoGrid}>
      {/* <div className={clsx(styles.videoContainer, styles.roundTopBorders)}>
        <video
          // ref={video => {
          //   this.video = video;
          // }}
          className={styles.video}
          // key={consumerId}
          // id={`webcam-feed-${consumerId}`}
        />
      </div>
      <div className={styles.videoContainer}>
        <video
          // ref={video => {
          //   this.video = video;
          // }}
          className={clsx(styles.roundTopBorders, styles.video)}
          // className={styles.video}
          // key={consumerId}
          // id={`webcam-feed-${consumerId}`}
        />
      </div>
      <div className={clsx(styles.videoContainer, styles.roundBottomBorders)}>
        <video
          // ref={video => {
          //   this.video = video;
          // }}
          className={styles.video}
          // key={consumerId}
          // id={`webcam-feed-${consumerId}`}
        />
      </div> */}
      {webcams &&
        webcams.map((webcam, idx) => {
          const { consumerId, stream } = webcam;
          return (
            <Video
              key={consumerId}
              nth={idx}
              length={webcams.length <= TOTAL_WEBCAMS_TO_RENDER ? webcams.length : TOTAL_WEBCAMS_TO_RENDER}
              consumerId={consumerId}
              stream={stream}
            />
          );
        })}
    </div>
  );
}

FloatingShareVideo.propTypes = {
  scene: PropTypes.object.isRequired
};

class Video extends Component {
  static propTypes = {
    consumerId: PropTypes.string.isRequired,
    stream: PropTypes.any.isRequired,
    nth: PropTypes.number,
    length: PropTypes.number,
    isSpeaking: PropTypes.bool
  };
  constructor(props) {
    super(props);
    this.video = createRef();
  }

  componentDidMount() {
    this.video.srcObject = this.props.stream;
    this.video.play();
  }

  render() {
    const { consumerId, nth, length } = this.props;
    // check if small screen, if small screen the nth === 1 has both bottom + top round borders
    console.log("inside video");
    console.log(nth);
    console.log(nth === 0);
    console.log(nth === length - 1);
    return (
      <div
        className={clsx({
          [styles.videoContainer]: true,
          [styles.roundTopBorders]: nth === 0,
          [styles.roundBottomBorders]: nth === length - 1,
          [styles.speaking]: nth === 0 // TODO remove to integrate speaking consumer
        })}
      >
        <video
          ref={video => {
            this.video = video;
          }}
          className={clsx({
            [styles.video]: true
            // [styles.roundTopBorders]: nth === 0,
            // [styles.roundBottomBorders]: nth === length - 1
          })}
          key={consumerId}
          id={`webcam-feed-${consumerId}`}
        />
      </div>
    );
  }
}
