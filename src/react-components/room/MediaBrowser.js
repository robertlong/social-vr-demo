import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import styles from "./MediaBrowser.scss";
import { ReactComponent as SearchIcon } from "../icons/Search.svg";
import { ReactComponent as StarIcon } from "../icons/Star.svg";
import { ReactComponent as CloseIcon } from "../icons/Close.svg";
import { ReactComponent as ArrowForwardIcon } from "../icons/ArrowForward.svg";
import { ReactComponent as ArrowBackIcon } from "../icons/ArrowBack.svg";
import { FormattedMessage } from "react-intl";
import { TextInputField } from "../input/TextInputField";
import { IconButton } from "../input/IconButton";
import { FullscreenLayout } from "../layout/FullscreenLayout";
import { Button } from "../input/Button";
import { Column } from "../layout/Column";
import { MediaGrid } from "./MediaGrid";

export function MediaBrowser({
  onClose,
  browserRef,
  searchInputRef,
  autoFocusSearch,
  searchPlaceholder,
  searchDescription,
  onSearchKeyDown,
  onClearSearch,
  mediaSources,
  selectedSource,
  onSelectSource,
  activeFilter,
  facets,
  onSelectFacet,
  query,
  onChangeQuery,
  headerRight,
  hasNext,
  hasPrevious,
  onNextPage,
  onPreviousPage,
  noResultsMessage,
  children
}) {
  return (
    <FullscreenLayout
      onEscape={onClose}
      headerLeft={
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      }
      headerCenter={
        <>
          {selectedSource === "favorites" ? (
            <>
              <StarIcon className={styles.favoriteIcon} />
              <h3>
                <FormattedMessage id="media-browser.favorites-header" />
              </h3>
            </>
          ) : (
            <TextInputField
              value={query}
              onChange={onChangeQuery}
              autoFocus={autoFocusSearch}
              ref={searchInputRef}
              placeholder={searchPlaceholder}
              onKeyDown={onSearchKeyDown}
              beforeInput={<SearchIcon />}
              afterInput={
                <IconButton onClick={onClearSearch}>
                  <CloseIcon height={16} width={16} />
                </IconButton>
              }
              description={searchDescription}
            />
          )}
        </>
      }
      headerRight={headerRight}
    >
      {mediaSources && (
        <div className={styles.buttonNav}>
          {mediaSources.map(source => (
            <Button
              sm
              key={source}
              preset={selectedSource === source ? "blue" : "transparent"}
              onClick={() => onSelectSource(source)}
            >
              <FormattedMessage id={`media-browser.nav_title.${source}`} />
            </Button>
          ))}
        </div>
      )}
      {facets && (
        <div className={classNames(styles.buttonNav, styles.facetsNav)}>
          {facets.map((facet, i) => (
            <Button
              sm
              key={i}
              preset={activeFilter === facet.params.filter ? "blue" : "transparent"}
              onClick={() => onSelectFacet(facet)}
            >
              {facet.text}
            </Button>
          ))}
        </div>
      )}
      <div className={styles.content}>
        <Column grow ref={browserRef}>
          {children ? (
            <MediaGrid
              isVariableWidth={selectedSource === "gifs" || selectedSource === "images"}
              sm={selectedSource === "avatars"}
            >
              {children}
            </MediaGrid>
          ) : (
            <div className={styles.noResults}>{noResultsMessage}</div>
          )}
          {(hasNext || hasPrevious) && (
            <div className={styles.pager}>
              <button type="button" className={styles.pagerButton} disabled={!hasPrevious} onClick={onPreviousPage}>
                <ArrowBackIcon />
              </button>
              <button type="button" className={styles.pagerButton} disabled={!hasNext} onClick={onNextPage}>
                <ArrowForwardIcon />
              </button>
            </div>
          )}
        </Column>
      </div>
    </FullscreenLayout>
  );
}

MediaBrowser.propTypes = {
  onClose: PropTypes.func,
  browserRef: PropTypes.any,
  searchInputRef: PropTypes.any,
  autoFocusSearch: PropTypes.bool,
  searchPlaceholder: PropTypes.string,
  searchDescription: PropTypes.node,
  onSearchKeyDown: PropTypes.func,
  onClearSearch: PropTypes.func,
  mediaSources: PropTypes.array,
  selectedSource: PropTypes.string,
  onSelectSource: PropTypes.func,
  activeFilter: PropTypes.string,
  facets: PropTypes.array,
  onSelectFacet: PropTypes.func,
  query: PropTypes.string,
  onChangeQuery: PropTypes.func,
  headerRight: PropTypes.node,
  hasNext: PropTypes.bool,
  hasPrevious: PropTypes.bool,
  onNextPage: PropTypes.func,
  onPreviousPage: PropTypes.func,
  noResultsMessage: PropTypes.node,
  children: PropTypes.node
};

MediaBrowser.defaultProps = {
  noResultsMessage: "No Results"
};
