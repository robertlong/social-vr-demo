import "./webxr-bypass-hacks";
import configs from "./utils/configs";
import ReactDOM from "react-dom";
import React, { Component } from "react";
import { Route } from "react-router-dom";
import PropTypes from "prop-types";
import toml from "@iarna/toml";
import {
  schemaByCategories,
  schemaCategories,
  getSchemas as getItaSchemas,
  setAuthToken as setItaAuthToken,
  getAdminInfo
} from "./utils/ita";
import { detectIdle } from "./utils/idle-detector";
import { connectToReticulum } from "hubs/src/utils/phoenix-utils";
import { AppBar, Admin, Layout, Resource } from "react-admin";
import { postgrestClient, postgrestAuthenticatior } from "./utils/postgrest-data-provider";
import { AdminMenu } from "./react-components/admin-menu";
import { SceneList, SceneEdit } from "./react-components/scenes";
import { SceneListingList, SceneListingEdit } from "./react-components/scene-listings";
import { AvatarList, AvatarEdit } from "./react-components/avatars";
import { IdentityList, IdentityCreate, IdentityEdit } from "./react-components/identities";
import { AvatarListingList, AvatarListingEdit } from "./react-components/avatar-listings";
import { FeaturedSceneListingList, FeaturedSceneListingEdit } from "./react-components/featured-scene-listings";
import { PendingSceneList } from "./react-components/pending-scenes";
import { AccountList, AccountEdit } from "./react-components/accounts";
import { ProjectList, ProjectShow } from "./react-components/projects";
import { SystemEditor } from "./react-components/system-editor";
import { ServiceEditor, AppConfigEditor } from "./react-components/service-editor";
import { ServerAccess } from "./react-components/server-access";
import { ContentCDN } from "./react-components/content-cdn";
import { ImportContent } from "./react-components/import-content";
import { AutoEndSessionDialog } from "./react-components/auto-end-session-dialog";
import Store from "hubs/src/storage/store";
import registerTelemetry from "hubs/src/telemetry";
import { createMuiTheme, withStyles } from "@material-ui/core/styles";
import { UnauthorizedPage } from "./react-components/unauthorized";

const qs = new URLSearchParams(location.hash.split("?")[1]);

const store = new Store();
window.APP = { store };

registerTelemetry("/admin", "Hubs Admin");

let itaSchemas;

const theme = createMuiTheme({
  overrides: {
    MuiDrawer: {
      docked: {
        background: "#222222",
        minHeight: "100vh"
      }
    }
  },
  palette: {
    primary: {
      main: "#FF3464"
    },
    secondary: {
      main: "#000000"
    }
  },
  typography: {
    fontFamily: "Open Sans, sans-serif"
  }
});

class AdminUI extends Component {
  static propTypes = {
    dataProvider: PropTypes.func,
    authProvider: PropTypes.func,
    onEndSession: PropTypes.func
  };

  state = {
    showAutoEndSessionDialog: false,
    isAdmin: true
  };

  async componentDidMount() {
    if (process.env.NODE_ENV !== "development" || qs.get("idle_timeout")) detectIdle();
    window.addEventListener("idle_detected", this.onIdleDetected);
    window.addEventListener("activity_detected", this.onActivityDetected);
    const adminInfo = await getAdminInfo();
    // Unauthorized account
    if (adminInfo.error && adminInfo.code === 401) this.setState({ isAdmin: false });
  }

  componentWillUnmount() {
    window.removeEventListener("idle_detected", this.onIdleDetected);
    window.removeEventListener("activity_detected", this.onActivityDetected);
  }

  onIdleDetected = () => {
    if (this.state.showAutoEndSessionDialog) return;
    this.setState({ showAutoEndSessionDialog: true });
  };

  onActivityDetected = () => {
    if (!this.state.showAutoEndSessionDialog || this.state.sessionEnded) return;
    this.setState({ showAutoEndSessionDialog: false });
  };

  render() {
    return (
      <>
        {this.state.isAdmin ? (
          <>
            <Admin
              dashboard={SystemEditor}
              layout={this.props.layout}
              customRoutes={this.props.customRoutes}
              dataProvider={this.props.dataProvider}
              authProvider={this.props.authProvider}
              loginPage={false}
              logoutButton={() => <span />}
              theme={theme}
            >
              <Resource name="pending_scenes" list={PendingSceneList} />
              <Resource
                name="scene_listings"
                list={SceneListingList}
                edit={SceneListingEdit}
                options={{ label: "Approved scenes" }}
              />
              <Resource
                name="featured_scene_listings"
                list={FeaturedSceneListingList}
                edit={FeaturedSceneListingEdit}
                options={{ label: "Featured scenes" }}
              />

              <Resource name="pending_avatars" list={AvatarList} />
              <Resource
                name="avatar_listings"
                list={AvatarListingList}
                edit={AvatarListingEdit}
                options={{ label: "Approved avatars" }}
              />
              <Resource
                name="featured_avatar_listings"
                list={AvatarListingList}
                edit={AvatarListingEdit}
                options={{ label: "Featured avatars" }}
              />

              <Resource name="accounts" list={AccountList} edit={AccountEdit} />
              <Resource name="identities" list={IdentityList} create={IdentityCreate} edit={IdentityEdit} />
              <Resource name="scenes" list={SceneList} edit={SceneEdit} />
              <Resource name="avatars" list={AvatarList} edit={AvatarEdit} />
              <Resource name="owned_files" />

              <Resource name="projects" list={ProjectList} show={ProjectShow} />
            </Admin>
            {this.state.showAutoEndSessionDialog && (
              <AutoEndSessionDialog
                onCancel={() => this.setState({ showAutoEndSessionDialog: false })}
                onEndSession={() => {
                  this.props.onEndSession();
                  this.setState({ sessionEnded: true });
                }}
              />
            )}
          </>
        ) : (
          <UnauthorizedPage />
        )}
      </>
    );
  }
}

import { IntlProvider } from "react-intl";
import { lang, messages } from "./utils/i18n";

const mountUI = async (retPhxChannel, customRoutes, layout) => {
  let dataProvider;
  let authProvider;

  // If POSTGREST_SERVER is set, we're talking directly to PostgREST over a tunnel, and will be managing the
  // perms token ourselves. If we're not, we talk to reticulum and presume it will handle perms token forwarding.

  let permsTokenRefreshInterval;

  if (configs.POSTGREST_SERVER) {
    dataProvider = postgrestClient(configs.POSTGREST_SERVER);
    authProvider = postgrestAuthenticatior.createAuthProvider(retPhxChannel);
    await postgrestAuthenticatior.refreshPermsToken();

    // Refresh perms regularly
    permsTokenRefreshInterval = setInterval(() => postgrestAuthenticatior.refreshPermsToken(), 60000);
  } else {
    const server = configs.RETICULUM_SERVER || document.location.host;
    dataProvider = postgrestClient("//" + server + "/api/postgrest");
    authProvider = postgrestAuthenticatior.createAuthProvider();
    postgrestAuthenticatior.setAuthToken(store.state.credentials.token);
  }

  window.APP.dataProvider = dataProvider;
  window.APP.authProvider = authProvider;

  const onEndSession = () => {
    if (permsTokenRefreshInterval) clearInterval(permsTokenRefreshInterval);
    retPhxChannel.socket.disconnect();
  };

  ReactDOM.render(
    <IntlProvider locale={lang} messages={messages}>
      <AdminUI
        dataProvider={dataProvider}
        authProvider={authProvider}
        customRoutes={customRoutes}
        layout={layout}
        onEndSession={onEndSession}
      />
    </IntlProvider>,
    document.getElementById("ui-root")
  );
};
const HiddenAppBar = withStyles({
  hideOnDesktop: {
    "@media (min-width: 768px) and (min-height: 480px)": {
      display: "none"
    }
  }
})(props => {
  const { classes, ...other } = props;
  return <AppBar {...other} className={classes.hideOnDesktop} />;
});

document.addEventListener("DOMContentLoaded", async () => {
  const socket = await connectToReticulum();

  if (store.state && store.state.credentials && store.state.credentials.token) {
    setItaAuthToken(store.state.credentials.token);
    try {
      itaSchemas = schemaByCategories(await getItaSchemas());
    } catch (e) {
      // Let the admin console run but skip showing configs.
    }
  }

  const homeRoute = <Route exact path="/home" component={SystemEditor} />;
  const importRoute = <Route exact path="/import" component={ImportContent} />;
  const accessRoute = <Route exact path="/server-access" component={ServerAccess} />;
  const cdnRoute = <Route exact path="/content-cdn" component={ContentCDN} />;

  const customRoutes = [homeRoute, importRoute, accessRoute, cdnRoute];

  try {
    const appConfigSchema = schemaByCategories({
      hubs: toml.parse(await fetch("/hubs/schema.toml").then(r => r.text()))
    });
    const appConfigRoute = (
      <Route path="/app-settings" render={props => <AppConfigEditor {...props} schema={appConfigSchema} />} />
    );
    customRoutes.push(appConfigRoute);
  } catch (e) {
    console.error("Could not initialize app config.", e);
  }

  if (itaSchemas) {
    customRoutes.push(
      <Route path="/server-setup" render={props => <ServiceEditor {...props} schema={itaSchemas} />} />
    );
  }

  const layout = props => (
    <Layout
      {...props}
      className="no-margin"
      appBar={HiddenAppBar}
      menu={props => <AdminMenu {...props} services={schemaCategories} />}
    />
  );

  const redirectToLogin = () => (document.location = "/?sign_in&sign_in_destination=admin");

  if (store.state.credentials && store.state.credentials.token) {
    // Reticulum global channel
    const retPhxChannel = socket.channel(`ret`, { hub_id: "admin", token: store.state.credentials.token });
    retPhxChannel
      .join()
      .receive("ok", async () => {
        mountUI(retPhxChannel, customRoutes, layout);
      })
      .receive("error", res => {
        document.location = "/?sign_in&sign_in_destination=admin";
        console.error(res);
      });
  } else {
    redirectToLogin();
  }
});
