import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import styles from "./Modal.scss";
import useFocusLock from "focus-layers";

export function Modal({
  title,
  beforeTitle,
  afterTitle,
  children,
  contentClassName,
  className,
  disableFullscreen,
  disableFocusLock,
  onEscape
}) {
  const modalRef = useRef();

  useFocusLock(modalRef, { disable: disableFocusLock });

  useEffect(
    () => {
      const onKeyDown = e => {
        if (e.key === "Escape" && onEscape && modalRef.current.contains(document.activeElement)) {
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
    <div
      className={classNames(styles.modal, { [styles.smFullscreen]: !disableFullscreen }, className)}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
    >
      {(title || beforeTitle || afterTitle) && (
        <div className={styles.header}>
          <div className={styles.beforeTitle}>{beforeTitle}</div>
          <h5>{title}</h5>
          <div className={styles.afterTitle}>{afterTitle}</div>
        </div>
      )}
      <div className={classNames(styles.content, contentClassName)}>{children}</div>
    </div>
  );
}

Modal.propTypes = {
  title: PropTypes.string,
  beforeTitle: PropTypes.node,
  afterTitle: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
  contentClassName: PropTypes.string,
  disableFullscreen: PropTypes.bool,
  disableFocusLock: PropTypes.bool,
  onEscape: PropTypes.func
};
