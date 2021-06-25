import React, { Component } from "react";
import { withStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import { Title } from "react-admin";
import Button from "@material-ui/core/Button";
import withCommonStyles from "../utils/with-common-styles";
import { getAdminInfo } from "../utils/ita";

const styles = withCommonStyles(() => ({}));

class ServerAccessComponent extends Component {
  state = {
    qrCodeData: null,
    serverDomain: "",
    showQrCode: false
  };

  async componentDidMount() {
    const adminInfo = await getAdminInfo();
    this.setState({
      qrCodeData: adminInfo.ssh_totp_qr_data,
      serverDomain: adminInfo.server_domain,
      provider: adminInfo.provider
    });
  }

  render() {
    return (
      <Card className={this.props.classes.container}>
        <Title title="Server Access" />
        <CardContent className={this.props.classes.info}>
          <Typography variant="body2" gutterBottom>
            Hubs Cloud sets up your servers with SSH access and Two-Factor Authentication.
          </Typography>
          <Typography variant="h6" className={this.props.classes.section} gutterBottom>
            Connecting to Servers
          </Typography>
          <Typography variant="body1" gutterBottom>
            To SSH into your server(s), you will use the SSH private key file you created before deploying Hubs Cloud.
          </Typography>
          {this.state.provider !== "arbortect" && (
            <Typography variant="body1" gutterBottom>
              Each of your servers has a name. The name can be found in your cloud provider&apos;s console in the server
              list. (For example, on AWS Console, go to EC2 -&gt; Instances.)
            </Typography>
          )}
          <Typography variant="body1" gutterBottom component="div">
            To connect to a server, run the following command:
            {this.state.provider === "arbortect" && (
              <div className={this.props.classes.command}>ssh -i &lt;key file&gt; root@{this.state.serverDomain}</div>
            )}
            {this.state.provider === "aws" && (
              <div className={this.props.classes.command}>
                ssh -i &lt;key file&gt; ubuntu@&lt;server name&gt;.{this.state.serverDomain}
              </div>
            )}
          </Typography>
          {this.state.qrCodeData && (
            <div>
              <Typography variant="h6" className={this.props.classes.section} gutterBottom>
                Two-Factor Verification
              </Typography>
              <Typography variant="body1" gutterBottom>
                Upon connecting, if 2FA has been configured on your servers you&apos;ll need a one-time Verification
                Code. This is a two-factor security measure and is a rotating six digit number.
              </Typography>
              <Typography variant="body1" gutterBottom>
                First, you will need to set up a device by installing a two-factor app such as Google Authenticator.
              </Typography>
              <Typography variant="body1" gutterBottom>
                To generate a code, open the authenticator app and scan the QR code below.
              </Typography>
              {this.state.showQrCode ? (
                <img style={{ width: "256px", height: "256px" }} src={this.state.qrCodeData} />
              ) : (
                <Button
                  className={this.props.classes.button}
                  variant="outlined"
                  onClick={() => this.setState({ showQrCode: true })}
                >
                  Show QR Code
                </Button>
              )}
            </div>
          )}
          <Typography variant="h6" className={this.props.classes.section} gutterBottom>
            More Information
          </Typography>
          <Typography variant="body1" gutterBottom>
            Documentation about server setup and tips for common tasks can be found in the{" "}
            <a
              href="https://hubs.mozilla.com/docs/hubs-cloud-accessing-servers.html"
              rel="noopener noreferrer"
              target="_blank"
            >
              Server Guide
            </a>
            .
          </Typography>
        </CardContent>
      </Card>
    );
  }
}

export const ServerAccess = withStyles(styles)(ServerAccessComponent);
