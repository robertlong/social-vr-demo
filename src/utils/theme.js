import { waitForDOMContentLoaded } from "./async-utils";
import configs from "./configs";

// Node these should be synchronized with the top of shared.scss
const DEFAULT_ACTION_COLOR = "#FF3464";
const DEFAULT_ACTION_COLOR_LIGHT = "#FF74A4";

const DEFAULT_COLORS = {
  "action-color": DEFAULT_ACTION_COLOR,
  "action-label-color": DEFAULT_ACTION_COLOR,
  "action-color-disabled": DEFAULT_ACTION_COLOR_LIGHT,
  "action-color-highlight": DEFAULT_ACTION_COLOR_LIGHT,
  "action-text-color": "#FFFFFF",
  "action-subtitle-color": "#F0F0F0",
  "notice-background-color": "#2F80ED",
  "notice-text-color": "#FFFFFF",
  "favorited-color": "#FFC000"
};

// Note: duplicated logic in react-components/styles/theme.js
const darkmodeQuery = window.matchMedia("(prefers-color-scheme: dark)");
let isDarkMode = darkmodeQuery.matches;
darkmodeQuery.addEventListener("change", event => {
  isDarkMode = event.matches;
});

function getTheme() {
  const themes = configs.APP_CONFIG?.theme?.themes;
  if (!Array.isArray(themes)) return;

  const themeId = window.APP?.store?.state?.preferences?.theme;

  let theme;
  if (themeId) {
    theme = themes.find(t => t.id === themeId);
  }
  if (!theme && isDarkMode) {
    theme = themes.find(t => t.darkModeDefault);
  }
  if (!theme) {
    theme = themes.find(t => t.default);
  }
  return theme;
}

function getThemeColor(name) {
  return getTheme()?.variables?.[name] || DEFAULT_COLORS[name];
}

function activateTheme() {
  const actionColor = getThemeColor("action-color");
  const actionHoverColor = getThemeColor("action-color-highlight");

  if (document.querySelector("#rounded-text-button")) {
    // NOTE, using the object-based {} setAttribute variant in a-frame
    // seems to not work in Firefox here -- the entities with the mixins are not
    // updated.
    document
      .querySelector("#rounded-text-button")
      .setAttribute(
        "text-button",
        `textHoverColor: ${actionHoverColor}; textColor: ${actionColor}; backgroundColor: #fff; backgroundHoverColor: #aaa;`
      );

    document
      .querySelector("#rounded-button")
      .setAttribute(
        "text-button",
        `textHoverColor: ${actionHoverColor}; textColor: ${actionColor}; backgroundColor: #fff; backgroundHoverColor: #aaa;`
      );

    document
      .querySelector("#rounded-text-action-button")
      .setAttribute(
        "text-button",
        `textHoverColor: #fff; textColor: #fff; backgroundColor: ${actionColor}; backgroundHoverColor: ${actionHoverColor}`
      );

    document
      .querySelector("#rounded-action-button")
      .setAttribute(
        "text-button",
        `textHoverColor: #fff; textColor: #fff; backgroundColor: ${actionColor}; backgroundHoverColor: ${actionHoverColor}`
      );
  }
}

const onStoreChanged = (function() {
  let themeId;
  return function onStoreChanged() {
    const newThemeId = window.APP?.store?.state?.preferences?.theme;
    if (themeId !== newThemeId) {
      themeId = newThemeId;
      activateTheme();
    }
  };
})();

waitForDOMContentLoaded().then(() => {
  if (configs.APP_CONFIG && configs.APP_CONFIG.theme && configs.APP_CONFIG.theme["dark-theme"]) {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.add("light-theme");
  }
  activateTheme();
  window.APP?.store?.addEventListener("statechanged", onStoreChanged);
});

function applyThemeToTextButton(el, highlighted) {
  el.setAttribute(
    "text-button",
    "backgroundColor",
    highlighted ? getThemeColor("action-color-highlight") : getThemeColor("action-color")
  );
  el.setAttribute(
    "text-button",
    "backgroundHoverColor",
    highlighted ? "#aaa" : getThemeColor("action-color-highlight")
  );
}

export { applyThemeToTextButton, getThemeColor };
