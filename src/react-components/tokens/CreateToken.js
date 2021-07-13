import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import { FormattedMessage } from "react-intl";
import { Divider } from "../layout/Divider";
import { Column } from "../layout/Column";
import styles from "./Tokens.scss";
import styleUtils from "../styles/style-utils.scss";
import { Button } from "../input/Button";
import { Row } from "../layout/Row";
import { CheckboxInput } from "../input/CheckboxInput";
import { RadioInputField } from "../input/RadioInputField";
import { RadioInputOption } from "../input/RadioInput";

export const CreateToken = ({ scopes, scopeInfo, selectedScopes }) => (
  <div>
    <h1>
      <FormattedMessage id="new-token.title" defaultMessage="New Token" />
    </h1>
    <Row gap="xl" breakpointColumn="md" topMargin="sm">
      <h2 className={styleUtils.flexBasis40}>
        <FormattedMessage id="new-token.token-type" defaultMessage="Token type" />
      </h2>
      <Row className={styleUtils.flexBasis60}>
        <RadioInputField className={styles.flexDirectionRow} inputClassName={styles.flexDirectionRow}>
          <RadioInputOption
            className={classNames(styleUtils.flexBasis50, styleUtils.margin0)}
            labelClassName={styles.radioLabel}
            value={1}
            label={<FormattedMessage id="new-token.account" defaultMessage="Account" />}
          />
          <RadioInputOption
            labelClassName={styles.radioLabel}
            className={classNames(styleUtils.flexBasis50, styleUtils.margin0)}
            value={2}
            label={<FormattedMessage id="new-token.app" defaultMessage="App" />}
          />
        </RadioInputField>
      </Row>
    </Row>
    <Divider />
    <Column gap="xl">
      <h2>
        <FormattedMessage id="new-token.select-scopes-title" defaultMessage="Select scopes" />
      </h2>
      <p>
        <FormattedMessage
          id="new-token.select-scopes-description"
          defaultMessage="Set the level of access this token will have by choosing from the scopes list."
        />
      </p>
    </Column>
    <Column>
      {scopes.map(scopeName => {
        const curScopeInfo = scopeInfo[scopeName];
        return (
          <SelectScope
            key={scopeName}
            scopeName={scopeName}
            curScopeInfo={curScopeInfo}
            selected={selectedScopes.includes(scopeName)}
          />
        );
      })}
    </Column>
    <Row spaceBetween className={styleUtils.xlMarginBottom}>
      <Button sm preset="basic">
        <FormattedMessage id="new-token.back" defaultMessage="Back" />
      </Button>
      <Button sm preset="primary">
        <FormattedMessage id="new-token.generate" defaultMessage="Generate" />
      </Button>
    </Row>
  </div>
);

CreateToken.propTypes = {
  scopes: PropTypes.array,
  scopeInfo: PropTypes.object,
  selectedScopes: PropTypes.selectedScopes
};

const SelectScope = ({ scopeName, curScopeInfo: scopeInfo, selected }) => {
  return (
    <Row
      padding="sm"
      breakpointColumn="md"
      className={classNames(styles.backgroundWhite, { [styles.selectedBorder]: selected })}
      topMargin="md"
    >
      <Row className={classNames(styleUtils.flexBasis40, styles.wordWrap)}>
        <CheckboxInput label={scopeName} checked={selected} labelClassName={styles.checkboxLabel} />
      </Row>
      <Column className={styleUtils.flexBasis60}>
        <p>{scopeInfo && scopeInfo.description}</p>
        <Row topMargin="sm" childrenMarginR="xs">
          {scopeInfo &&
            scopeInfo.tags.map(tag => (
              <div key={`${scopeName}-${tag}`} className={styles.tag}>
                {tag}
              </div>
            ))}
        </Row>
      </Column>
    </Row>
  );
};

SelectScope.propTypes = {
  scopeName: PropTypes.string,
  curScopeInfo: PropTypes.object,
  selected: PropTypes.bool
};
