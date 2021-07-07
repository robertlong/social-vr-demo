import React, { forwardRef, memo } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import styles from "./TextInput.scss";
import { ReactComponent as WarningIcon } from "../icons/Warning.svg";
import buttonStyles from "./Button.scss";
import iconButtonStyles from "./IconButton.scss";
import { handleTextFieldFocus, handleTextFieldBlur } from "../../utils/focus-utils";

export const TextInput = memo(
  forwardRef(
    (
      {
        id,
        disabled,
        invalid,
        className,
        beforeInput,
        afterInput,
        onFocus,
        onBlur,
        textInputStyles,
        as: InputElement,
        ...rest
      },
      ref
    ) => {
      // TODO: This is REALLY bad. We're overriding default behavior of text inputs to get a fullscreen behavior to work on Firefox.
      // It also selects the contents of the text input which is not always something you want to do. If we can remove this, we absolutely should.
      const handleFocus = e => {
        handleTextFieldFocus(e.target);

        if (onFocus) {
          onFocus(e);
        }
      };

      const handleBlur = e => {
        handleTextFieldBlur();

        if (onBlur) {
          onBlur(e);
        }
      };

      return (
        <div
          className={classNames(
            styles.outerWrapper,
            buttonStyles.inputGroup,
            iconButtonStyles.inputGroup,
            { [styles.invalid]: invalid, [styles.disabled]: disabled },
            className
          )}
        >
          <div className={styles.beforeInput}>{beforeInput}</div>
          <div className={styles.inputWrapper}>
            <InputElement
              id={id}
              className={classNames(styles.textInput, textInputStyles)}
              disabled={disabled}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...rest}
              ref={ref}
            />
          </div>
          <div className={styles.afterInput}>
            {invalid && <WarningIcon className={styles.invalidIcon} />}
            {afterInput}
          </div>
        </div>
      );
    }
  )
);

TextInput.propTypes = {
  id: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  invalid: PropTypes.bool,
  className: PropTypes.string,
  onChange: PropTypes.func,
  beforeInput: PropTypes.node,
  afterInput: PropTypes.node,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  textInputStyles: PropTypes.string,
  as: PropTypes.elementType
};

TextInput.defaultProps = {
  onChange: () => {},
  as: "input"
};
