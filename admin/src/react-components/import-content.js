import React, { Component } from "react";
import { withStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CircularProgress from "@material-ui/core/CircularProgress";
import CardContent from "@material-ui/core/CardContent";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import Done from "@material-ui/icons/Done";
import Warning from "@material-ui/icons/Warning";
import Snackbar from "@material-ui/core/Snackbar";
import SnackbarContent from "@material-ui/core/SnackbarContent";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import FormControl from "@material-ui/core/FormControl";
import FormGroup from "@material-ui/core/FormGroup";
import Checkbox from "@material-ui/core/Checkbox";
import Icon from "@material-ui/core/Icon";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableHead from "@material-ui/core/TableHead";
import TableCell from "@material-ui/core/TableCell";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import { Title } from "react-admin";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import { fetchReticulumAuthenticated } from "hubs/src/utils/phoenix-utils";
import clsx from "classnames";
import { GET_MANY_REFERENCE } from "react-admin";
import { sceneApproveNew, sceneApproveExisting, sceneReviewed } from "./scene-actions";
import { avatarApproveNew, avatarApproveExisting, avatarReviewed } from "./avatar-actions";
import withCommonStyles from "../utils/with-common-styles";
import configs from "../utils/configs";

const RESULTS = {
  pending: "pending",
  importing: "importing",
  new_listing: "new_listing",
  existing_listing: "existing_listing",
  failed: "failed"
};

const styles = withCommonStyles(() => ({}));

class ImportContentComponent extends Component {
  state = {
    urls: "",
    imports: [],
    addBaseTag: false,
    addDefaultTag: false,
    reticulumMeta: {}
  };

  handleUrlChanged(ev) {
    this.setState({ urls: ev.target.value });
  }

  async componentDidMount() {
    this.updateReticulumMeta();
  }

  async updateReticulumMeta() {
    const reticulumMeta = await fetchReticulumAuthenticated(`/api/v1/meta?include_repo`);
    this.setState({ reticulumMeta });
  }

  apiInfoForSubmittedUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split("/");
      const isScene = pathParts[1] === "scenes";
      const type = isScene ? "scenes" : "avatars";
      return { url: `${parsedUrl.origin}/api/v1/${type}/${pathParts[2]}`, isScene };
    } catch (e) {
      return null;
    }
  }

  addImport(url, importUrl, type, asset, isDefault, isBase, isFeatured) {
    const { imports } = this.state;
    imports.push({
      url,
      importUrl,
      type,
      asset,
      result: RESULTS.pending,
      isDefault,
      isBase,
      isFeatured,
      isImported: false,
      isEnabled: true
    });
    this.setState({ imports });
  }

  setImportResult(url, result) {
    this.setImportFields(url, i => (i.result = result));

    if (result === RESULTS.new_listing || result === RESULTS.existing_listing || result === RESULTS.failed) {
      this.setImportFields(url, i => (i.isImported = true));
    }
  }

  setImportIsEnabled(url, isEnabled) {
    this.setImportFields(url, i => (i.isEnabled = isEnabled));
  }

  setImportIsDefault(url, isDefault) {
    this.setImportFields(url, i => (i.isDefault = isDefault));
  }

  setImportIsBase(url, isBase) {
    this.setImportFields(url, i => (i.isBase = isBase));
  }

  setImportIsFeatured(url, isFeatured) {
    this.setImportFields(url, i => (i.isFeatured = isFeatured));
  }

  setImportFields(url, setter) {
    const { imports } = this.state;

    for (let i = 0; i < imports.length; i++) {
      if (imports[i].url === url) {
        setter(imports[i]);
        break;
      }
    }

    this.setState({ imports });
  }

  async onPreviewImport(e) {
    if (e) e.preventDefault();

    const urls = this.state.urls.split(/[, ]+/);
    if (!urls.find(u => u.length !== 0)) return;

    const needsBaseAvatar = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.avatar_listings.base;
    const needsDefaultAvatar = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.avatar_listings.default;
    const needsDefaultScene = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.scene_listings.default;

    let hadUrl = false;
    await new Promise(r => this.setState({ imports: [] }, r));
    this.setState({ isLoading: true });

    const importableUrls = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (url.endsWith(".pack")) {
        const res = await fetch(`https://${configs.CORS_PROXY_SERVER}/${url}`);
        const packUrls = (await res.text()).split("\n");
        for (const u of packUrls) {
          if (u.trim() !== "") {
            importableUrls.push(u);
          }
        }
      } else {
        importableUrls.push(url);
      }
    }

    let first = true;

    for (let i = 0; i < importableUrls.length; i++) {
      const url = importableUrls[i];
      const apiInfo = this.apiInfoForSubmittedUrl(url);
      if (!apiInfo) continue;

      const { url: importUrl, isScene } = apiInfo;
      const isAvatar = !isScene;

      if (!importUrl) continue;

      const res = await fetch(`https://${configs.CORS_PROXY_SERVER}/${importUrl}`);
      const type = isScene ? "scenes" : "avatars";
      const asset = (await res.json())[type][0];
      const isDefault = (isScene && needsDefaultScene) || (isAvatar && needsDefaultAvatar);
      const isBase = isAvatar && needsBaseAvatar && first; // Only set first avatar to be base by default
      this.addImport(url, importUrl, type, asset, isDefault, isBase, true /* isFeatured */);
      first = false;
      hadUrl = true;
    }

    if (!hadUrl) {
      this.setState({ loadFailed: true });
    }

    this.setState({ urls: "", isLoading: false });
  }

  async onImport(e) {
    if (e) e.preventDefault();
    const { imports } = this.state;

    for (let i = 0; i < imports.length; i++) {
      const { url, type, importUrl, isEnabled, isImported, isBase, isDefault, isFeatured } = imports[i];
      if (isImported || !isEnabled) continue;

      this.setImportResult(url, RESULTS.importing);

      const isScene = type === "scenes";
      const isAvatar = !isScene;
      const columnPrefix = isScene ? "scene" : "avatar";
      let res;

      try {
        res = await fetchReticulumAuthenticated(`/api/v1/${type}`, "POST", { url: importUrl });
      } catch (e) {
        this.setImportResult(url, RESULTS.failed);
        continue;
      }

      const asset = res[type][0];
      const tags = [];

      if (isAvatar && isBase) {
        tags.push("base");
      }

      if (isDefault) {
        tags.push("default");
      }

      if (isFeatured) {
        tags.push("featured");
      }

      const approveNew = isScene ? sceneApproveNew : avatarApproveNew;
      const approveExisting = isScene ? sceneApproveExisting : avatarApproveExisting;
      const reviewed = isScene ? sceneReviewed : avatarReviewed;

      const dataProvider = window.APP.dataProvider;

      // Import API returns the sid, need to look up the asset by sid and then check for a listing.
      const sid = asset[`${columnPrefix}_id`];

      const objectRes = await dataProvider(GET_MANY_REFERENCE, type, {
        sort: { field: "id", order: "desc" },
        target: `${columnPrefix}_sid`,
        id: sid
      });
      const objId = objectRes.data[0].id;
      const listingRes = await dataProvider(GET_MANY_REFERENCE, `${columnPrefix}_listings`, {
        sort: { field: "id", order: "desc" },
        target: `_${columnPrefix}_id`,
        id: objId
      });

      // If there is an existing listing, object ends up in pending, otherwise create a listing.
      const isNew = listingRes.data.length === 0;
      const approve = isNew ? approveNew : approveExisting;
      const exec = async f => {
        const d = f();
        await dataProvider(d.meta.fetch, d.meta.resource, d.payload);
      };

      if (!isNew) {
        objectRes.data[0][`${columnPrefix}_listing_id`] = listingRes.data[0].id;
      }

      await exec(() => {
        const d = approve(objectRes.data[0]);
        d.payload.data.tags = { tags };

        return d;
      });

      if (isNew) {
        await exec(() => reviewed(objId));
      }

      this.setImportResult(url, isNew ? RESULTS.new_listing : RESULTS.existing_listing);

      this.updateReticulumMeta();
    }
  }

  renderImportTable() {
    const { imports } = this.state;
    const isImportingAny = imports ? !!imports.find(i => i.result === RESULTS.importing) : false;
    const hasNonImported = imports ? !!imports.find(i => !i.isImported) : false;

    const rowForImportRecord = r => {
      let icon = null;
      let status = null;
      const listingType = r.type === "scenes" ? "scene_listings" : "avatar_listings";

      switch (r.result) {
        case RESULTS.importing:
          icon = <CircularProgress size={18} />;
          break;
        case RESULTS.failed:
          icon = <Warning />;
          break;
        case RESULTS.new_listing:
          icon = <Done />;
          status = (
            <p>
              Import Successful.
              <br />
              Go to <a href={`/admin?#/${listingType}`}>approved {r.type}</a> to manage.
            </p>
          );
          break;
        case RESULTS.existing_listing:
          icon = <Done />;
          status = (
            <p>
              Update Successful.
              <br />
              Go to <a href={`/admin?#/${listingType}`}>approved {r.type}</a> to manage.
            </p>
          );
          break;
      }

      const screenshotUrl = `https://${configs.CORS_PROXY_SERVER}/${r.asset.screenshot_url || r.asset.files.thumbnail}`;

      return (
        <TableRow key={r.url}>
          <TableCell>
            {icon ||
              (!isImportingAny && (
                <Checkbox
                  checked={r.isEnabled}
                  onChange={e => this.setImportIsEnabled(r.url, e.target.checked)}
                  value="enabled"
                />
              ))}
          </TableCell>
          <TableCell>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={!r.isEnabled || isImportingAny || r.isImported}
                    checked={r.isDefault}
                    onChange={e => this.setImportIsDefault(r.url, e.target.checked)}
                    value="default"
                  />
                }
                label="Set to Default"
              />
              {r.type === "avatars" && (
                <FormControlLabel
                  control={
                    <Checkbox
                      disabled={!r.isEnabled || isImportingAny || r.isImported}
                      checked={r.isBase}
                      onChange={e => this.setImportIsBase(r.url, e.target.checked)}
                      value="base"
                    />
                  }
                  label="Set to Base"
                />
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={!r.isEnabled || isImportingAny || r.isImported}
                    checked={r.isFeatured}
                    onChange={e => this.setImportIsFeatured(r.url, e.target.checked)}
                    value="featured"
                  />
                }
                label="Featured"
              />
            </div>
          </TableCell>
          <TableCell>
            <img src={screenshotUrl} style={{ width: "100px" }} />
          </TableCell>
          <TableCell align="right">
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.asset.name}
            </a>
            {status}
          </TableCell>
        </TableRow>
      );
    };

    const numSelected = imports ? imports.filter(i => i.isEnabled && !i.isImported).length : 0;
    const rowCount = imports ? imports.length : 0;

    return (
      <CardContent>
        <Paper>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  {hasNonImported && !isImportingAny && (
                    <Checkbox
                      indeterminate={numSelected > 0 && numSelected < rowCount}
                      checked={numSelected === rowCount}
                      onChange={e => {
                        for (const { isImported, url } of imports) {
                          if (!isImported) {
                            this.setImportIsEnabled(url, e.target.checked);
                          }
                        }
                      }}
                    />
                  )}
                </TableCell>
                <TableCell>Info</TableCell>
                <TableCell>Preview</TableCell>
                <TableCell align="right">Name</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>{imports.map(rowForImportRecord)}</TableBody>
          </Table>
        </Paper>
      </CardContent>
    );
  }

  render() {
    const needsBaseAvatar = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.avatar_listings.base;
    const needsDefaultAvatar = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.avatar_listings.default;
    const needsDefaultScene = this.state.reticulumMeta.repo && !this.state.reticulumMeta.repo.scene_listings.default;
    const { urls, imports, loadFailed } = this.state;
    const unimportedCount = imports ? imports.filter(i => !i.isImported).length : 0;
    const readyToImportCount = imports ? imports.filter(i => i.isEnabled && !i.isImported).length : 0;
    const importCount = imports ? imports.length : 0;
    const isImportingAny = imports ? imports.find(i => i.result === RESULTS.importing) : false;

    return (
      <Card className={this.props.classes.container}>
        <Title title="Import Content" />
        <CardContent className={this.props.classes.info}>
          <Typography variant="body2" gutterBottom>
            You can import avatars and scenes from any other Hubs Cloud site, such as{" "}
            <a href="https://hubs.mozilla.com" target="_blank" rel="noopener noreferrer">
              hubs.mozilla.com
            </a>
            .<br />
            Please ensure the content you import has a permissible license (such as{" "}
            <a href="https://creativecommons.org/licenses/by/2.0/" rel="noopener noreferrer" target="_blank">
              CC-BY
            </a>
            ) or is licensed to you for redistribution.
          </Typography>
          <Button
            className={this.props.classes.button}
            variant="outlined"
            href="https://hubs.mozilla.com/docs/hubs-cloud-asset-packs.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Find Avatars &amp; Scenes
          </Button>
          <Typography variant="h6" gutterBottom className={this.props.classes.section}>
            Importing Content
          </Typography>
          <Typography variant="body1" gutterBottom>
            Enter a comma-separted list of URLs avatars or scenes to import them into your Hubs Cloud instance.
            <br />
            Or, specify a .pack file which contains a list of URLs, one per line.
          </Typography>
          {(needsBaseAvatar || needsDefaultAvatar || needsDefaultScene) && (
            <List>
              {needsBaseAvatar && (
                <ListItem>
                  <ListItemIcon className={this.props.classes.warningIcon}>
                    <Warning />
                  </ListItemIcon>
                  <ListItemText
                    inset
                    primary="You need to add a base avatar."
                    secondary="Base avatars will be provided as choices when customizing avatars."
                  />
                </ListItem>
              )}
              {needsDefaultAvatar && (
                <ListItem>
                  <ListItemIcon className={this.props.classes.warningIcon}>
                    <Warning />
                  </ListItemIcon>
                  <ListItemText
                    inset
                    primary="You need to add at least one default avatar."
                    secondary="New users will be assigned one of the default avatars."
                  />
                </ListItem>
              )}
              {needsDefaultScene && (
                <ListItem>
                  <ListItemIcon className={this.props.classes.warningIcon}>
                    <Warning />
                  </ListItemIcon>
                  <ListItemText
                    inset
                    primary="You need to add at least one default scene."
                    secondary="New rooms will be assigned a default scene, which can be changed after room creation."
                  />
                </ListItem>
              )}
            </List>
          )}
          <form className={this.props.classes.info}>
            <FormControl>
              <FormGroup>
                <TextField
                  key="url"
                  id="url"
                  label="Avatar or Scene URLs or .pack file"
                  value={urls}
                  onChange={this.handleUrlChanged.bind(this)}
                  type="text"
                  fullWidth
                  margin="normal"
                />
              </FormGroup>
            </FormControl>
            {!this.state.isLoading && (
              <Button
                onClick={this.onPreviewImport.bind(this)}
                className={this.props.classes.button}
                variant="contained"
                color="primary"
              >
                Preview Import
              </Button>
            )}
          </form>
          {this.state.isLoading && <CircularProgress />}
          {!this.state.isLoading && unimportedCount > 0 && (
            <div>
              <p />
              <Typography variant="h6" gutterBottom>
                Next, choose the content you&apos;d like to import, and which content flags to set. Then, click Import.
              </Typography>
            </div>
          )}
          {!this.state.isLoading && importCount > 0 && this.renderImportTable()}
          {!this.state.isLoading && readyToImportCount > 0 && !isImportingAny && (
            <Button
              onClick={this.onImport.bind(this)}
              className={this.props.classes.button}
              variant="contained"
              color="primary"
            >
              Import {readyToImportCount} Item{readyToImportCount > 1 && "s"}
            </Button>
          )}
          {isImportingAny && <CircularProgress />}
          <Snackbar
            anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
            open={!!loadFailed}
            autoHideDuration={10000}
            onClose={() => this.setState({ importFailed: false, lastImportedUrl: null })}
          >
            <SnackbarContent
              className={clsx({
                [this.props.classes.warning]: this.state.importFailed
              })}
              message={
                <span id="import-snackbar" className={this.props.classes.message}>
                  <Icon className={clsx(this.props.classes.icon, this.props.classes.iconVariant)} />
                  Failed to load specified URLs.
                </span>
              }
              action={[
                <IconButton
                  key="close"
                  color="inherit"
                  onClick={() => this.setState({ importFailed: false, lastImportedUrl: null })}
                >
                  <CloseIcon className={this.props.classes.icon} />
                </IconButton>
              ]}
            ></SnackbarContent>
          </Snackbar>
        </CardContent>
      </Card>
    );
  }
}

export const ImportContent = withStyles(styles)(ImportContentComponent);
