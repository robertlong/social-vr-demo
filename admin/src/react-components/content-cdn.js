import React, { Component } from "react";
import { withStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Checkbox from "@material-ui/core/Checkbox";
import CircularProgress from "@material-ui/core/CircularProgress";
import LinearProgress from "@material-ui/core/LinearProgress";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { Title } from "react-admin";
import Button from "@material-ui/core/Button";
import withCommonStyles from "../utils/with-common-styles";
import { getAdminInfo, getEditableConfig, getConfig, putConfig } from "../utils/ita";
import Snackbar from "@material-ui/core/Snackbar";
import SnackbarContent from "@material-ui/core/SnackbarContent";
import Icon from "@material-ui/core/Icon";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import clsx from "classnames";
import configs from "../utils/configs";

// NOTE there's a mysterious uncaught exception in a promise when this component is shown, that seems
// to be coupled with the "All 3rd party content" typography block. It's a mystery.

const styles = withCommonStyles(() => ({
  worker: {
    width: "600px",
    height: "200px",
    fontFamily: "monospace",
    marginTop: "8px"
  },

  workerInput: {
    padding: "8px",
    width: "250px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    margin: "8px"
  }
}));

const workerScript = (workerDomain, workerInstanceName, assetsDomain) => {
  return `  const ALLOWED_ORIGINS = ["${document.location.origin}"];
  const CORS_PROXY_HOST = "https://${workerInstanceName}-cors-proxy.${workerDomain}";
  const PROXY_HOST = "https://${workerInstanceName}-proxy.${workerDomain}";
  const HUB_HOST = "${document.location.origin}";
  const ASSETS_HOST = "https://${assetsDomain}";

  addEventListener("fetch", e => {
    const request = e.request;
    const origin = request.headers.get("Origin");
    // eslint-disable-next-line no-useless-escape

    const isCorsProxy = request.url.indexOf(CORS_PROXY_HOST) === 0;
    const proxyUrl = new URL(isCorsProxy ? CORS_PROXY_HOST : PROXY_HOST);
    const targetPath = request.url.substring((isCorsProxy ? CORS_PROXY_HOST : PROXY_HOST).length + 1);
    let targetUrl;

    if (targetPath.startsWith("files/") || targetPath.startsWith("thumbnail/")) {
      targetUrl = \`\${HUB_HOST}/\${targetPath}\`;
    } else if (targetPath.startsWith("hubs/") || targetPath.startsWith("spoke/") || targetPath.startsWith("admin/") || targetPath.startsWith("assets/")) {
      targetUrl = \`\${ASSETS_HOST}/\${targetPath}\`;
    } else {
      if (!isCorsProxy) {
        // Do not allow cors proxying from main domain, always require cors-proxy. subdomain to ensure CSP stays sane.
        return;
      }
      // This is a weird workaround that seems to stem from the cloudflare worker receiving the wrong url
      targetUrl = targetPath.replace(/^http(s?):\\/([^/])/, "http$1://$2");

      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = proxyUrl.protocol + "//" + targetUrl;
      }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("Origin"); // Some domains disallow access from improper Origins

    e.respondWith((async () => {
      const res = await fetch(targetUrl, { headers: requestHeaders, method: request.method, redirect: "manual", referrer: request.referrer, referrerPolicy: request.referrerPolicy });
      const responseHeaders = new Headers(res.headers);
      const redirectLocation = responseHeaders.get("Location") || responseHeaders.get("location");

      if(redirectLocation) {
        if (!redirectLocation.startsWith("/")) {
          responseHeaders.set("Location",  proxyUrl.protocol + "//" + proxyUrl.host + "/" + redirectLocation);
        } else {
          const tUrl = new URL(targetUrl);
          responseHeaders.set("Location",  proxyUrl.protocol + "//" + proxyUrl.host + "/" + tUrl.origin + redirectLocation);
        }
      }

      if (origin && ALLOWED_ORIGINS.indexOf(origin) >= 0) {
        responseHeaders.set("Access-Control-Allow-Origin", origin);
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "Range");
        responseHeaders.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Encoding, Content-Length, Content-Range, Hub-Name, Hub-Entity-Type");
      }

      responseHeaders.set("Vary", "Origin");
      responseHeaders.set('X-Content-Type-Options', "nosniff");

      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: responseHeaders });
    })());
  });`;
};

class ContentCDNComponent extends Component {
  state = {
    workerDomain: "",
    workerInstanceName: "",
    assetsDomain: "",
    enableWorker: false,
    saving: false,
    saveError: false,
    loading: false
  };

  async componentDidMount() {
    const adminInfo = await getAdminInfo();
    const retConfig = await getEditableConfig("reticulum");
    let workerDomain = "";

    if (!!retConfig && !!retConfig.phx && retConfig.phx.cors_proxy_url_host.includes("workers.dev")) {
      const corsProxyUrlParts = retConfig.phx.cors_proxy_url_host.split(".");
      workerDomain = corsProxyUrlParts[corsProxyUrlParts.length - 3] + ".workers.dev";
    }

    const workerInstanceName =
      "hubs-" +
      adminInfo.server_domain
        .split(".")
        .join("-")
        .toLowerCase()
        .substring(0, 63 - "hubs-".length - "-cors-proxy".length);

    this.setState({
      assetsDomain: adminInfo.assets_domain,
      provider: adminInfo.provider,
      workerInstanceName,
      workerDomain,
      enableWorker: !!workerDomain,
      loading: false
    });
  }

  async onSubmit(e) {
    e.preventDefault();

    // Sanity check
    if (this.state.enableWorker) {
      const abort = () => {
        this.setState({
          saveError: "Your worker isn't working. Check that you've performed all of the above steps."
        });
      };

      try {
        // Need to CORS-proxy the CORS-proxy because CSP will block us otherwise!
        const res = await fetch(
          `https://${configs.CORS_PROXY_SERVER}/https://${this.state.workerInstanceName}-proxy.${this.state.workerDomain}/hubs/pages/latest/whats-new.html`
        );

        if (!res.ok) {
          abort();
          return;
        }
      } catch (e) {
        abort();
        return;
      }
    }

    this.setState({ saving: true }, async () => {
      const workerDomain = this.state.enableWorker ? this.state.workerDomain : "";
      const workerInstanceName = this.state.enableWorker ? this.state.workerInstanceName : "";
      const corsProxyDomain = `${workerInstanceName}-cors-proxy.${workerDomain}`;
      const proxyDomain = `${workerInstanceName}-proxy.${workerDomain}`;

      const hubsConfig = await getConfig("hubs");
      const spokeConfig = await getConfig("spoke");

      let hubsNonCorsProxyDomains = hubsConfig.general.non_cors_proxy_domains;
      let spokeNonCorsProxyDomains = spokeConfig.general.non_cors_proxy_domains;

      if (this.state.enableWorker) {
        if (!hubsNonCorsProxyDomains.includes(proxyDomain)) {
          hubsNonCorsProxyDomains = [...hubsNonCorsProxyDomains.split(",").filter(x => x.length), proxyDomain].join(
            ","
          );
        }
        if (!spokeNonCorsProxyDomains.includes(proxyDomain)) {
          spokeNonCorsProxyDomains = [...spokeNonCorsProxyDomains.split(",").filter(x => x.length), proxyDomain].join(
            ","
          );
        }
      }

      // For arbortect, we enable thumbnail CDN proxying
      const useWorkerForThumbnails = this.state.provider === "arbortect";

      const configs = {
        reticulum: {
          phx: {
            cors_proxy_url_host: workerDomain ? corsProxyDomain : ""
          },
          uploads: {
            host: workerDomain ? `https://${proxyDomain}` : ""
          }
        },
        hubs: {
          general: {
            cors_proxy_server: workerDomain ? corsProxyDomain : "",
            base_assets_path: workerDomain ? `https://${proxyDomain}/hubs/` : "",
            non_cors_proxy_domains: workerDomain ? hubsNonCorsProxyDomains : "",
            thumbnail_server: workerDomain && useWorkerForThumbnails ? proxyDomain : ""
          }
        },
        spoke: {
          general: {
            cors_proxy_server: workerDomain ? corsProxyDomain : "",
            base_assets_path: workerDomain ? `https://${proxyDomain}/spoke/` : "",
            non_cors_proxy_domains: workerDomain ? spokeNonCorsProxyDomains : "",
            thumbnail_server: workerDomain && useWorkerForThumbnails ? proxyDomain : ""
          }
        }
      };

      try {
        for (const [service, config] of Object.entries(configs)) {
          const res = await putConfig(service, config);

          if (res.error) {
            this.setState({ saveError: `Error saving: ${res.error}` });
            break;
          }
        }
      } catch (e) {
        this.setState({ saveError: e.toString() });
      }

      this.setState({ saving: false, saved: true, saveError: null });
    });
  }

  render() {
    if (this.state.loading) {
      return <LinearProgress />;
    }

    const hasValidWorkerDomain = (this.state.workerDomain || "").endsWith("workers.dev");

    return (
      <Card className={this.props.classes.container}>
        <Title title="Content CDN" />
        <form onSubmit={this.onSubmit.bind(this)}>
          <CardContent className={this.props.classes.info}>
            {this.state.provider === "arbortect" && (
              <Typography variant="body2" gutterBottom>
                You can greatly reduce load on your server and improve loading times by setting up Cloudflare as your
                CDN.
                <br />
                Once enabled, Cloudflare will cache content, reduce latency, and reduce bandwidth used by your server.
              </Typography>
            )}
            {this.state.provider && this.state.provider !== "arbortect" && (
              <Typography variant="body2" gutterBottom>
                Hubs Cloud uses bandwidth from your cloud provider to deliver content.
                <br />
                You can reduce your data transfer costs by switching your CDN to Cloudflare, which does not charge for
                data transfer costs to your users.
              </Typography>
            )}
            <Typography variant="h6" gutterBottom className={this.props.classes.section}>
              Worker Setup
            </Typography>
            <Typography variant="body1" gutterBottom>
              All 3rd party content (videos, images, models) in Hubs Cloud requires CORS proxying due to the{" "}
              <a href="https://www.codecademy.com/articles/what-is-cors" rel="noopener noreferrer" target="_blank">
                browser security model
              </a>
              . As such, you will be using data transfer to send all 3rd party content to your users.
            </Typography>
            {this.state.provider && this.state.provider !== "arbortect" && (
              <Typography variant="body1" gutterBottom>
                Additionally, you will incur data transfer costs for serving avatars, scenes, and other assets.
              </Typography>
            )}
            {this.state.provider && this.state.provider !== "arbortect" && (
              <Typography variant="body1" gutterBottom>
                You can minimize this data transfer cost by using a Cloudflare Worker to serve this content:
              </Typography>
            )}
            <Typography variant="body1" component="div" gutterBottom>
              <ol className={this.props.classes.steps}>
                <li>
                  Sign up for&nbsp;
                  <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer">
                    Cloudflare
                  </a>
                  .
                </li>
                <li>
                  Once you&apos;ve signed up, click Cloudflare logo to go to your <b>Home</b> tab. (
                  <b>WARNING - Do not &quot;add site&quot; to Cloudflare</b>, you only need to create workers)
                </li>
                <li>
                  In <b>Home</b> tab, click on <b>Workers</b> panel. You&apos;ll be asked to create a workers subdomain.
                </li>
                <li>
                  Enter your workers subdomain here:
                  <p />
                  <input
                    type="text"
                    placeholder="eg. mysite.workers.dev"
                    className={this.props.classes.workerInput}
                    value={this.state.workerDomain}
                    onChange={e => this.setState({ workerDomain: e.target.value })}
                  />
                </li>
                {hasValidWorkerDomain && (
                  <>
                    <li>
                      In the Workers Dashboard click <b>Create Worker</b>.
                    </li>
                    <li>
                      Enter the name for the worker (at the top, above the script) as:
                      <div className={this.props.classes.command}>{this.state.workerInstanceName}-proxy</div>
                    </li>
                    <li>
                      Paste, save, and deploy the following worker script for the worker.
                      <br />
                      <textarea
                        className={this.props.classes.worker}
                        value={workerScript(
                          this.state.workerDomain,
                          this.state.workerInstanceName,
                          this.state.assetsDomain
                        )}
                        readOnly
                        onFocus={e => e.target.select()}
                      />
                      <br />
                    </li>
                    <li>
                      Repeat the steps above and create and deploy a new worker with the same script. Name this new
                      worker:
                      <div className={this.props.classes.command}>{this.state.workerInstanceName}-cors-proxy</div>
                    </li>
                    <li>
                      Don&apos;t forget to save and <b>deploy</b> both scripts.
                    </li>
                    <li>
                      Verify your workers are working.{" "}
                      <a
                        href={`https://${this.state.workerInstanceName}-cors-proxy.${this.state.workerDomain}/https://www.mozilla.org`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        This link
                      </a>{" "}
                      should show the Mozilla homepage, and&nbsp;
                      <a
                        href={`https://${this.state.workerInstanceName}-proxy.${this.state.workerDomain}/hubs/pages/latest/whats-new.html`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        this link
                      </a>{" "}
                      should should the Hubs &quot;What&apos;s New&quot; page.
                    </li>
                    <li>
                      Once <b>both</b> links above are working, enable the &apos;Use Cloudflare Worker&apos; setting
                      below and click &apos;Save&apos; on this page.
                    </li>
                    <li>
                      If you need more than 100,000 requests per day for content, you&apos;ll need to add a Worker
                      Unlimited Subscription for an additional $5/mo.
                    </li>
                  </>
                )}
              </ol>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={this.state.enableWorker}
                    onChange={e => this.setState({ enableWorker: e.target.checked })}
                    value="enableWorker"
                  />
                }
                label="Use Cloudflare Worker"
              />
            </Typography>
            {this.state.saving ? (
              <CircularProgress />
            ) : (
              (!this.state.enableWorker || hasValidWorkerDomain) && (
                <Button
                  onClick={this.onSubmit.bind(this)}
                  className={this.props.classes.button}
                  variant="contained"
                  color="primary"
                >
                  Save
                </Button>
              )
            )}
          </CardContent>
        </form>
        <Snackbar
          anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
          open={this.state.saved || !!this.state.saveError}
          autoHideDuration={10000}
          onClose={() => this.setState({ saved: false, saveError: null })}
        >
          <SnackbarContent
            className={clsx({
              [this.props.classes.success]: !this.state.saveError,
              [this.props.classes.warning]: !!this.state.saveError
            })}
            message={
              <span id="import-snackbar" className={this.props.classes.message}>
                <Icon className={clsx(this.props.classes.icon, this.props.classes.iconVariant)} />
                {this.state.saveError || "Settings saved."}
              </span>
            }
            action={[
              <IconButton key="close" color="inherit" onClick={() => this.setState({ saved: false })}>
                <CloseIcon className={this.props.classes.icon} />
              </IconButton>
            ]}
          />
        </Snackbar>
      </Card>
    );
  }
}

export const ContentCDN = withStyles(styles)(ContentCDNComponent);
