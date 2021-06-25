import React, { Component } from "react";
import { Title } from "react-admin";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import { withStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";

import LockIcon from "@material-ui/icons/Lock";
import PaletteIcon from "@material-ui/icons/Palette";
import VpnKeyIcon from "@material-ui/icons/VpnKey";
import CodeIcon from "@material-ui/icons/Code";
import DeveloperModeIcon from "@material-ui/icons/DeveloperMode";

import Warning from "@material-ui/icons/Warning";
import Info from "@material-ui/icons/Info";
import { fetchReticulumAuthenticated } from "hubs/src/utils/phoenix-utils";
import withCommonStyles from "../utils/with-common-styles";
import { getAdminInfo, getEditableConfig } from "../utils/ita";

// Send quota to use as heuristic for checking if in SES sandbox
// https://forums.aws.amazon.com/thread.jspa?threadID=61090
const MAX_AWS_SES_QUOTA_FOR_SANDBOX = 200;

const styles = withCommonStyles(() => ({}));

class SystemEditorComponent extends Component {
  state = {
    reticulumMeta: {}
  };

  async componentDidMount() {
    const adminInfo = await getAdminInfo();
    const retConfig = await getEditableConfig("reticulum");

    this.setState({ adminInfo, retConfig });
    this.updateReticulumMeta();
  }

  async updateReticulumMeta() {
    const reticulumMeta = await fetchReticulumAuthenticated(`/api/v1/meta?include_repo`);
    this.setState({ reticulumMeta });
  }

  render() {
    const needsAvatars = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.avatar_listings.any;
    const needsScenes = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.scene_listings.any;
    const exceededStorageQuota = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.storage.in_quota;

    const isInSESSandbox =
      this.state.adminInfo &&
      this.state.adminInfo.using_ses &&
      this.state.adminInfo.ses_max_24_hour_send <= MAX_AWS_SES_QUOTA_FOR_SANDBOX;

    const isUsingCloudflare =
      this.state.adminInfo &&
      this.state.retConfig &&
      this.state.retConfig.phx &&
      this.state.retConfig.phx.cors_proxy_url_host === `cors-proxy.${this.state.adminInfo.worker_domain}`;

    return (
      <>
        <Card className={this.props.classes.container}>
          <Title title="Hubs Cloud" />
          <CardContent className={this.props.classes.info}>
            <Typography variant="title" gutterBottom>
              🐣 Hubs Cloud is live
            </Typography>
            <Typography variant="body1" gutterBottom>
              Need help? Check out the{" "}
              <a
                href="https://hubs.mozilla.com/docs/hubs-cloud-getting-started.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                Getting Started
              </a>{" "}
              guide.
            </Typography>
            <Typography variant="body1" gutterBottom>
              Hubs Cloud updates automatically, see the{" "}
              <a
                href="https://github.com/mozilla/hubs-cloud/blob/master/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hubs Cloud Changelog
              </a>
              .
            </Typography>
            <Typography variant="body1" gutterBottom>
              <b>Questions or issues?</b> Visit the{" "}
              <a href="https://hubs.mozilla.com/docs/welcome.html" target="_blank" rel="noopener noreferrer">
                Hubs Docs
              </a>{" "}
              or create a{" "}
              <a href="https://github.com/mozilla/hubs/discussions" target="_blank" rel="noopener noreferrer">
                question in discussions
              </a>{" "}
              or{" "}
              <a href="https://github.com/mozilla/hubs" target="_blank" rel="noopener noreferrer">
                issue in github
              </a>
              .
            </Typography>
            {this.state.reticulumMeta &&
              this.state.adminInfo &&
              (needsAvatars || needsScenes || isInSESSandbox || exceededStorageQuota) && (
                <List>
                  {isInSESSandbox && (
                    <ListItem>
                      <ListItemIcon className={this.props.classes.warningIcon}>
                        <Warning />
                      </ListItemIcon>
                      <ListItemText
                        inset
                        primary={
                          <span>
                            Your AWS account is in the{" "}
                            <a
                              href="https://docs.aws.amazon.com/ses/latest/DeveloperGuide/request-production-access.html"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              AWS Simple Email Service Sandbox.
                            </a>{" "}
                            Follow instructions in{" "}
                            <a
                              href="https://hubs.mozilla.com/docs/hubs-cloud-aws-troubleshooting.html#youre-in-the-aws-sandbox-and-people-dont-receive-magic-link-emails"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {" "}
                              You&apos;re in the AWS SES Sandbox and people don&apos;t receive magic link emails:
                            </a>
                            Solution #1, #2, #3, or{" "}
                            <a
                              href="https://hubs.mozilla.com/docs/hubs-cloud-aws-existing-email-provider.html"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Using an Existing Email Provider
                            </a>
                          </span>
                        }
                        secondary={
                          <span>
                            Users will not be able to log in until the system can send email. You&apos;ll need to either{" "}
                            <a
                              href="https://docs.aws.amazon.com/ses/latest/DeveloperGuide/request-production-access.html"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              follow the instructions
                            </a>{" "}
                            to request a limit increase, or set custom email settings in{" "}
                            <a href="/admin#/server-setup">Server Settings</a>
                          </span>
                        }
                      />
                    </ListItem>
                  )}
                  {exceededStorageQuota && (
                    <ListItem>
                      <ListItemIcon className={this.props.classes.warningIcon}>
                        <Warning />
                      </ListItemIcon>
                      <ListItemText
                        inset
                        primary={<span>You have exceeded your specified storage limit.</span>}
                        secondary={
                          <span>
                            Visitors will not be able to upload new scenes, avatars, or files until you increase the
                            &apos;Storage Limit&apos; in your stack settings.
                          </span>
                        }
                      />
                    </ListItem>
                  )}
                  {needsAvatars && (
                    <ListItem>
                      <ListItemIcon className={this.props.classes.warningIcon}>
                        <Warning />
                      </ListItemIcon>
                      <ListItemText
                        inset
                        primary="Your system has no avatars."
                        secondary="Choose 'Import Content' on the left to load avatars."
                      />
                    </ListItem>
                  )}
                  {needsScenes && (
                    <ListItem>
                      <ListItemIcon className={this.props.classes.warningIcon}>
                        <Warning />
                      </ListItemIcon>
                      <ListItemText
                        inset
                        primary="Your system has no scenes."
                        secondary="Choose 'Import Content' on the left to load scenes."
                      />
                    </ListItem>
                  )}
                  {!isUsingCloudflare && (
                    <ListItem>
                      <ListItemIcon className={this.props.classes.infoIcon}>
                        <Info />
                      </ListItemIcon>
                      <ListItemText
                        inset
                        primary={
                          this.state.adminInfo.provider === "arbortect"
                            ? "You are not using a CDN."
                            : "You are using your cloud provider to serve content."
                        }
                        secondary="You can reduce costs and improve performance by using Cloudflare's CDN to serve content. Choose 'Content CDN' on the left for more info."
                      />
                    </ListItem>
                  )}
                </List>
              )}
          </CardContent>
        </Card>
        <Card className={this.props.classes.container}>
          <Typography variant="title" gutterBottom>
            In the Admin Panel, you can:
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <PaletteIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <span>
                    Customize the{" "}
                    <a
                      href="https://hubs.mozilla.com/docs/hubs-cloud-customizing-look-and-feel.html"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      look and feel of your hub
                    </a>{" "}
                    in the <i>App Settings menu</i>
                  </span>
                }
              />
            </ListItem>
            <ListItem style={{ paddingLeft: "100px", paddingTop: "0px" }}>
              <ListItemText
                primary={
                  <span>
                    Change images, favicon, and logos - <i>Images tab</i>
                  </span>
                }
              />
            </ListItem>
            <ListItem style={{ paddingLeft: "100px", paddingTop: "0px" }}>
              <ListItemText
                primary={
                  <span>
                    Set the theme colors - <i>Themes tab</i>
                  </span>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <LockIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <span>
                    Lockdown your instance to specific users via the&nbsp;
                    <a
                      href="https://hubs.mozilla.com/docs/hubs-cloud-limiting-user-access.html"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Limiting Access Guide
                    </a>
                  </span>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <VpnKeyIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <span>
                    Add your API keys for Google Analytics, Sketchfab, Discord, etc. - &nbsp;
                    <i>Server Settings menu &nbsp;&gt;&nbsp;API Keys tab</i>
                  </span>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <DeveloperModeIcon />
              </ListItemIcon>

              <ListItemText
                primary={
                  <span>
                    Add extra Javascript, CSS, Headers, HTML, Cors origins - &nbsp;
                    <i>Server Settings menu &nbsp;&gt;&nbsp;Advanced tab</i>
                  </span>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CodeIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <span>
                    Not enough customizations? You can modify the client code directly by&nbsp;
                    <a
                      href="https://hubs.mozilla.com/docs/hubs-cloud-custom-clients.html"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      deploying a custom client
                    </a>
                  </span>
                }
              />
            </ListItem>
          </List>
        </Card>
      </>
    );
  }
}

export const SystemEditor = withStyles(styles)(SystemEditorComponent);
