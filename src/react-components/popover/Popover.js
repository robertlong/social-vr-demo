import React, { useState, useCallback, useEffect, useRef } from "react";
// Note react-popper-2 is just an alias to react-popper@2.2.3 because storybook is depending on an old version.
// https://github.com/storybookjs/storybook/issues/10982
import { usePopper } from "react-popper-2";
import useFocusLock from "focus-layers";
import styles from "./Popover.scss";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useCssBreakpoints } from "react-use-css-breakpoints";
import classNames from "classnames";
import { ReactComponent as CloseIcon } from "../icons/Close.svg";
import { ReactComponent as PopoverArrow } from "./PopoverArrow.svg";

function ContentContainer({ closePopover, title, children }) {
  const containerRef = useRef();

  useFocusLock(containerRef);

  return (
    <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true">
      <div className={styles.header}>
        <button onClick={closePopover}>
          <CloseIcon width={16} height={16} />
        </button>
        <h5>{title}</h5>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function Popover({
  content: Content,
  children,
  title,
  placement,
  offsetSkidding,
  offsetDistance,
  initiallyVisible,
  disableFullscreen,
  isVisible,
  onChangeVisible,
  popoverApiRef
}) {
  const [_visible, _setVisible] = useState(initiallyVisible);
  const visible = isVisible === undefined ? _visible : isVisible;
  const setVisible = onChangeVisible || _setVisible;
  const [referenceElement, setReferenceElement] = useState(null);
  const [popperElement, setPopperElement] = useState(null);
  const [arrowElement, setArrowElement] = useState(null);
  const {
    styles: { popper: popperStyles, arrow: arrowStyles },
    attributes
  } = usePopper(referenceElement, popperElement, {
    placement,
    modifiers: [
      { name: "arrow", options: { element: arrowElement } }, // https://popper.js.org/docs/v2/modifiers/arrow/
      { name: "offset", options: { offset: [offsetSkidding, offsetDistance] } } // https://popper.js.org/docs/v2/modifiers/offset/
    ]
  });
  const breakpoint = useCssBreakpoints();
  const fullscreen = !disableFullscreen && (breakpoint === "sm" || breakpoint === "md");
  const openPopover = useCallback(() => setVisible(true), [setVisible]);
  const closePopover = useCallback(() => setVisible(false), [setVisible]);
  const togglePopover = useCallback(() => setVisible(visible => !visible), [setVisible]);

  useEffect(
    () => {
      if (!popoverApiRef) {
        return;
      }

      popoverApiRef.current = {
        openPopover,
        closePopover,
        togglePopover
      };
    },
    [popoverApiRef, openPopover, closePopover, togglePopover]
  );

  useEffect(
    () => {
      const onClick = e => {
        if (
          (referenceElement && referenceElement.contains(e.target)) ||
          (popperElement && popperElement.contains(e.target))
        ) {
          return;
        }

        setVisible(false);
      };

      const onKeyDown = e => {
        if (e.key === "Escape") {
          setVisible(false);
        }
      };

      if (visible) {
        window.addEventListener("mousedown", onClick);
        window.addEventListener("keydown", onKeyDown);
      }

      return () => {
        window.removeEventListener("mousedown", onClick);
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [visible, popperElement, referenceElement, setVisible]
  );

  useEffect(
    () => {
      if (visible && fullscreen) {
        document.body.classList.add(styles.fullscreenBody);
      } else {
        document.body.classList.remove(styles.fullscreenBody);
      }

      return () => {
        document.body.classList.remove(styles.fullscreenBody);
      };
    },
    [fullscreen, visible]
  );

  return (
    <>
      {children({
        togglePopover,
        popoverVisible: visible,
        triggerRef: setReferenceElement
      })}
      {visible &&
        createPortal(
          <div
            ref={setPopperElement}
            className={classNames(styles.popover, { [styles.fullscreen]: fullscreen })}
            style={fullscreen ? undefined : popperStyles}
            {...attributes.popper}
          >
            <ContentContainer closePopover={closePopover} title={title}>
              {typeof Content === "function" ? (
                <Content fullscreen={fullscreen} closePopover={closePopover} />
              ) : (
                Content
              )}
            </ContentContainer>
            {!fullscreen && (
              <div ref={setArrowElement} className={styles.arrow} style={arrowStyles}>
                <PopoverArrow />
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

Popover.propTypes = {
  initiallyVisible: PropTypes.bool,
  placement: PropTypes.string,
  title: PropTypes.string.isRequired,
  children: PropTypes.func.isRequired,
  content: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
  disableFullscreen: PropTypes.bool,
  popoverApiRef: PropTypes.object
};

Popover.defaultProps = {
  initiallyVisible: false,
  placement: "auto",
  offsetSkidding: 0,
  offsetDistance: 8
};
