import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import styles from "./FullscreenLayout.scss";
import useFocusLock from "focus-layers";

export function FullscreenLayout({
  className,
  headerLeft,
  headerCenter,
  headerRight,
  contentClassName,
  onEscape,
  children
}) {
  const fullscreenLayoutRef = useRef();

  useFocusLock(fullscreenLayoutRef);

  useEffect(
    () => {
      const onKeyDown = e => {
        if (e.key === "Escape" && onEscape && fullscreenLayoutRef.current.contains(document.activeElement)) {
          onEscape();
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [onEscape]
  );

  return (
    <div className={classNames(styles.fullscreenLayout, className)} ref={fullscreenLayoutRef}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>{headerLeft}</div>
        <div className={styles.headerCenter}>{headerCenter}</div>
        <div className={styles.headerRight}>{headerRight}</div>
      </div>
      <div className={classNames(styles.content, contentClassName)}>{children}</div>
    </div>
  );
}

FullscreenLayout.propTypes = {
  className: PropTypes.string,
  headerLeft: PropTypes.node,
  headerCenter: PropTypes.node,
  headerRight: PropTypes.node,
  contentClassName: PropTypes.string,
  onEscape: PropTypes.func,
  children: PropTypes.node
};
