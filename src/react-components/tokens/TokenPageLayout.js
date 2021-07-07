import React from "react";
import PropTypes from "prop-types";
import { PageContainer } from "../layout/PageContainer";
import { StorybookAuthContextProvider } from "../auth/AuthContext";
import { Column } from "../layout/Column";
import classNames from "classnames";
import styleUtils from "../styles/style-utils.scss";
import styles from "./Tokens.scss";

export const TokenPageLayout = ({ children }) => (
  <PageContainer className={styles.tokenContainer}>
    <Column gap="xl" className={classNames(styles.centerPaddingSides, styleUtils.xlPadding)}>
      {children}
    </Column>
  </PageContainer>
);

TokenPageLayout.propTypes = {
  children: PropTypes.node
};
