import React from "react";
import PropTypes from "prop-types";
import { InputField } from "./InputField";
import classNames from "classnames";
import styles from "./SelectInputField.scss";
import { ReactComponent as CaretDownIcon } from "../icons/CaretDown.svg";
import { useSelect } from "downshift";
import { FormattedMessage } from "react-intl";

function getItemValue(item) {
  return typeof item === "object" ? item.value : item;
}

function getSelectedItem(value, options) {
  const selectedItemValue = getItemValue(value);

  if (options.length > 0 && typeof options[0] === "object") {
    return options.find(item => item.value === selectedItemValue);
  }

  return selectedItemValue;
}

function getItemLabel(item) {
  return typeof item === "object" ? item.label || item.value : item;
}

export function SelectInputField({
  className,
  error,
  description,
  inputClassName,
  label,
  onChange,
  value,
  options,
  fullWidth,
  ...rest
}) {
  const {
    isOpen,
    selectedItem,
    getToggleButtonProps,
    getMenuProps,
    getLabelProps,
    highlightedIndex,
    getItemProps
  } = useSelect({
    items: options,
    selectedItem: getSelectedItem(value, options),
    ...rest,
    onSelectedItemChange: ({ selectedItem }) => {
      if (onChange) {
        onChange(getItemValue(selectedItem));
      }
    }
  });

  const selectedItemLabel = getItemLabel(selectedItem);

  return (
    <InputField
      {...getLabelProps()}
      className={className}
      label={label}
      error={error}
      description={description}
      fullWidth={fullWidth}
    >
      <div className={classNames(styles.selectInput, { [styles.open]: isOpen }, inputClassName)}>
        <button className={styles.dropdownButton} type="button" {...getToggleButtonProps()}>
          <span>
            {selectedItemLabel !== undefined ? (
              selectedItemLabel
            ) : (
              <FormattedMessage id="select-input-field.placeholder" defaultMessage="Select..." />
            )}
          </span>
          <CaretDownIcon />
        </button>
        {options.length > 0 && (
          <ul {...getMenuProps()} className={styles.dropdown}>
            {isOpen &&
              options.map((item, index) => (
                <li
                  className={classNames(styles.dropdownItem, { [styles.highlightedItem]: highlightedIndex === index })}
                  key={getItemValue(item)}
                  {...getItemProps({ item, index })}
                >
                  {getItemLabel(item)}
                </li>
              ))}
          </ul>
        )}
      </div>
    </InputField>
  );
}

SelectInputField.propTypes = {
  className: PropTypes.string,
  label: PropTypes.node,
  error: PropTypes.node,
  description: PropTypes.node,
  labelClassName: PropTypes.string,
  inputClassName: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.shape({
        // id: PropTypes.string.isRequired,
        label: PropTypes.string,
        value: PropTypes.any.isRequired
      })
    ])
  ).isRequired,
  onChange: PropTypes.func,
  fullWidth: PropTypes.bool
};

SelectInputField.defaultProps = {
  options: []
};
