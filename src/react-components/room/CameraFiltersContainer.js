import React, { useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { FormattedMessage, useIntl } from "react-intl";
import { CloseButton } from "../input/CloseButton";
import { Sidebar } from "../sidebar/Sidebar";
import { Swiper, SwiperSlide } from "swiper/react";
import { FilterType } from "../../utils/media-devices-manager";
import classNames from "classnames";
import styles from "./CameraFilters.scss";

import "swiper/swiper.min.css";
import "swiper/components/lazy/lazy.min.css";
import "swiper/components/pagination/pagination.min.css";

import none_thumb from "../../assets/images/camera/none_thumb.jpg";
import blur_thumb from "../../assets/images/camera/blur_thumb.jpg";
import blur_face_thumb from "../../assets/images/camera/blur_face_thumb.jpg";
import bg_ufck_1 from "../../assets/images/camera/firefox_unfck_zoom_bg_1.jpg";
import bg_ufck_1_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_1_thumb.jpg";
import bg_ufck_2 from "../../assets/images/camera/firefox_unfck_zoom_bg_2.jpg";
import bg_ufck_2_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_2_thumb.jpg";
import bg_ufck_3 from "../../assets/images/camera/firefox_unfck_zoom_bg_3.jpg";
import bg_ufck_3_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_3_thumb.jpg";
import bg_ufck_4 from "../../assets/images/camera/firefox_unfck_zoom_bg_4.jpg";
import bg_ufck_4_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_4_thumb.jpg";
import bg_ufck_5 from "../../assets/images/camera/firefox_unfck_zoom_bg_5.jpg";
import bg_ufck_5_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_5_thumb.jpg";
import bg_ufck_6 from "../../assets/images/camera/firefox_unfck_zoom_bg_6.jpg";
import bg_ufck_6_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_6_thumb.jpg";
import bg_ufck_7 from "../../assets/images/camera/firefox_unfck_zoom_bg_7.jpg";
import bg_ufck_7_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_7_thumb.jpg";
import bg_ufck_8 from "../../assets/images/camera/firefox_unfck_zoom_bg_8.jpg";
import bg_ufck_8_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_8_thumb.jpg";
import bg_ufck_9 from "../../assets/images/camera/firefox_unfck_zoom_bg_9.jpg";
import bg_ufck_9_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_9_thumb.jpg";
import bg_ufck_10 from "../../assets/images/camera/firefox_unfck_zoom_bg_10.jpg";
import bg_ufck_10_thumb from "../../assets/images/camera/firefox_unfck_zoom_bg_10_thumb.jpg";

const filters = [
  {
    type: FilterType.NONE,
    thumbnail: none_thumb
  },
  {
    type: FilterType.BACKGROUND_BLUR,
    thumbnail: blur_thumb
  },
  {
    type: FilterType.BLUR_FACE,
    thumbnail: blur_face_thumb
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_1_thumb,
    src: bg_ufck_1
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_2_thumb,
    src: bg_ufck_2
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_3_thumb,
    src: bg_ufck_3
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_4_thumb,
    src: bg_ufck_4
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_5_thumb,
    src: bg_ufck_5
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_6_thumb,
    src: bg_ufck_6
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_7_thumb,
    src: bg_ufck_7
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_8_thumb,
    src: bg_ufck_8
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_9_thumb,
    src: bg_ufck_9
  },
  {
    type: FilterType.REPLACE_BACKGROUND,
    thumbnail: bg_ufck_10_thumb,
    src: bg_ufck_10
  }
];

// import Swiper core and required modules
import SwiperCore, { Pagination, Mousewheel } from "swiper/core";

SwiperCore.use([Pagination, Mousewheel]);

export function CameraFiltersContainer({ onClose, store }) {
  const onChangeBackground = useCallback(
    swiperCore => {
      const { realIndex } = swiperCore;
      store.update({
        preferences: {
          cameraFilter: {
            index: realIndex
          }
        }
      });
      window.APP.mediaDevicesManager.switchFilter(filters[realIndex]);
    },
    [store]
  );

  return (
    <Sidebar
      title={<FormattedMessage id="camera-filters-sidebar.title" defaultMessage="Camera Filters" />}
      beforeTitle={<CloseButton onClick={onClose} />}
    >
      <Swiper
        init={true}
        initialSlide={store.state.preferences?.cameraFilter?.index || 0}
        centeredSlides={true}
        direction={"vertical"}
        slidesPerView={3}
        pagination={{
          clickable: true
        }}
        onActiveIndexChange={onChangeBackground}
        slideToClickedSlide={true}
        mousewheel={true}
        onSwiper={swiper => {
          const className = classNames(styles.wrapper);
          if (!swiper.wrapperEl.classList.contains(className)) {
            swiper.wrapperEl.classList.add(className);
          }
          const containerClassName = classNames(styles.container);
          if (!swiper.el.classList.contains(containerClassName)) {
            swiper.el.classList.add(containerClassName);
          }
        }}
      >
        {filters.map((filter, index) => {
          return (
            <SwiperSlide key={`slide_${index}`}>
              {({ isActive }) => (
                <div className={classNames(isActive ? styles.slideContentActive : styles.slideContent)}>
                  <img key={index} src={filter.thumbnail} />
                </div>
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </Sidebar>
  );
}

CameraFiltersContainer.propTypes = {
  store: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired
};
