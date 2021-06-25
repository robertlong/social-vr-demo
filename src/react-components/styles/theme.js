import { useEffect, useState } from "react";
import PropTypes from "prop-types";

let config = process.env.APP_CONFIG;

// Note: duplicated logic in utils/theme.js

// Storybook includes environment variables as a string
// https://storybook.js.org/docs/react/configure/environment-variables
if (!config && process.env.STORYBOOK_APP_CONFIG) {
  config = JSON.parse(process.env.STORYBOOK_APP_CONFIG);
}

if (!config) {
  config = window.APP_CONFIG;
}

if (config?.theme?.error) {
  console.error(
    `Custom themes failed to load.\n${
      config.theme.error
    }\nIf you are an admin, reconfigure your themes in the admin panel.`
  );
}

export const defaultTheme = "default";

export const themes = config?.theme?.themes || [];

function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const darkmodeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    setDarkMode(darkmodeQuery.matches);

    darkmodeQuery.addEventListener("change", event => {
      setDarkMode(event.matches);
    });
  }, []);

  return darkMode;
}

export function useTheme(themeId) {
  const darkMode = useDarkMode();

  useEffect(
    () => {
      // Themes can come from an external source. Ensure it is an array.
      if (!Array.isArray(themes)) return;

      let theme;

      if (themeId) {
        theme = themes.find(t => t.id === themeId);
      }

      if (!theme && darkMode) {
        theme = themes.find(t => t.darkModeDefault);
      }

      if (!theme) {
        theme = themes.find(t => t.default);
      }

      if (!theme) {
        return;
      }

      const variables = [];

      for (const key in theme.variables) {
        if (!theme.variables.hasOwnProperty(key)) continue;
        variables.push(`--${key}: ${theme.variables[key]};`);
      }

      const styleTag = document.createElement("style");

      styleTag.innerHTML = `:root {
        ${variables.join("\n")}
      }`;

      document.head.appendChild(styleTag);

      return () => {
        document.head.removeChild(styleTag);
      };
    },
    [themeId, darkMode]
  );
}

export function useThemeFromStore(store) {
  const [themeId, setThemeId] = useState(store?.state?.preferences?.theme);

  useEffect(() => {
    function onStoreChanged() {
      const nextThemeId = store.state?.preferences?.theme;

      if (themeId !== nextThemeId) {
        setThemeId(nextThemeId);
      }
    }

    if (store) {
      store.addEventListener("statechanged", onStoreChanged);
    }

    return () => {
      if (store) {
        store.removeEventListener("statechanged", onStoreChanged);
      }
    };
  });

  useTheme(themeId);
}

export function ThemeProvider({ store, children }) {
  useThemeFromStore(store);
  return children;
}

ThemeProvider.propTypes = {
  store: PropTypes.object,
  children: PropTypes.node
};
