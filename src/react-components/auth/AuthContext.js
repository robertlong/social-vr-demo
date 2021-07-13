import React, { createContext, useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import configs from "../../utils/configs";

// TODO: We really shouldn't include these dependencies on every page. A dynamic import would work better.
import jwtDecode from "jwt-decode";
import AuthChannel from "../../utils/auth-channel";
import { connectToReticulum } from "../../utils/phoenix-utils";

export const AuthContext = createContext();

async function checkIsAdmin(socket, store) {
  // TODO: Doing all of this just to determine if the user is an admin seems unnecessary. The auth callback should have the isAdmin flag.
  const retPhxChannel = socket.channel("ret", { hub_id: "index", token: store.state.credentials.token });

  const perms = await new Promise(resolve => {
    retPhxChannel
      .join()
      .receive("ok", () => {
        retPhxChannel
          .push("refresh_perms_token")
          .receive("ok", ({ perms_token }) => {
            const perms = jwtDecode(perms_token);
            retPhxChannel.leave();
            resolve(perms);
          })
          .receive("error", error => {
            console.error("Error sending refresh_perms_token message", error);
          })
          .receive("timeout", () => {
            console.error("Sending refresh_perms_token timed out");
          });
      })
      .receive("error", error => {
        console.error("Error joining Phoenix Channel", error);
      })
      .receive("timeout", () => {
        console.error("Phoenix Channel join timed out");
      });
  });

  const isAdmin = perms.postgrest_role === "ret_admin";

  configs.setIsAdmin(isAdmin);

  return isAdmin;
}

const noop = () => {};

export function StorybookAuthContextProvider({ children }) {
  const [context] = useState({
    initialized: true,
    isSignedIn: true,
    isAdmin: true,
    token: "abc123",
    email: "foo@bar.baz",
    userId: "00000000",
    signIn: noop,
    verify: noop,
    signOut: noop
  });
  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

StorybookAuthContextProvider.propTypes = {
  children: PropTypes.node,
  store: PropTypes.object.isRequired
};

export function AuthContextProvider({ children, store }) {
  const signIn = useCallback(
    async email => {
      const authChannel = new AuthChannel(store);
      const socket = await connectToReticulum();
      authChannel.setSocket(socket);
      const { authComplete } = await authChannel.startAuthentication(email);
      await authComplete;
      await checkIsAdmin(socket, store);
    },
    [store]
  );

  const verify = useCallback(
    async authParams => {
      const authChannel = new AuthChannel(store);
      const socket = await connectToReticulum();
      authChannel.setSocket(socket);
      await authChannel.verifyAuthentication(authParams.topic, authParams.token, authParams.payload);
    },
    [store]
  );

  const signOut = useCallback(
    async () => {
      configs.setIsAdmin(false);
      store.update({ credentials: { token: null, email: null } });
      await store.resetToRandomDefaultAvatar();
    },
    [store]
  );

  const [context, setContext] = useState({
    initialized: false,
    isSignedIn: !!store.state.credentials && !!store.state.credentials.token,
    isAdmin: configs.isAdmin(),
    email: store.state.credentials && store.state.credentials.email,
    userId: store.credentialsAccountId,
    signIn,
    verify,
    signOut
  });

  // Trigger re-renders when the store updates
  useEffect(
    () => {
      const onStoreChanged = () => {
        setContext(state => ({
          ...state,
          isSignedIn: !!store.state.credentials && !!store.state.credentials.token,
          isAdmin: configs.isAdmin(),
          email: store.state.credentials && store.state.credentials.email,
          userId: store.credentialsAccountId
        }));
      };

      store.addEventListener("statechanged", onStoreChanged);

      // Check if the user is an admin on page load
      const runAsync = async () => {
        if (store.state.credentials && store.state.credentials.token) {
          const socket = await connectToReticulum();
          return checkIsAdmin(socket, store);
        }

        return false;
      };

      runAsync()
        .then(isAdmin => {
          setContext(state => ({ ...state, isAdmin }));
        })
        .catch(error => {
          console.error(error);
          setContext(state => ({ ...state, isAdmin: false }));
        });

      return () => {
        store.removeEventListener("statechanged", onStoreChanged);
      };
    },
    [store, setContext]
  );

  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

AuthContextProvider.propTypes = {
  children: PropTypes.node,
  store: PropTypes.object.isRequired
};
