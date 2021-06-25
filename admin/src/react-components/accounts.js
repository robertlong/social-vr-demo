import React, { Component } from "react";
import { connect } from "react-redux";
import { IdentityEditLink, IdentityCreateLink } from "./fields";
import { withStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import MuiTextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import Snackbar from "@material-ui/core/Snackbar";
import SnackbarContent from "@material-ui/core/SnackbarContent";
import { ToolbarWithoutDelete } from "./toolbar-without-delete";

import {
  BooleanField,
  BooleanInput,
  Datagrid,
  DateField,
  Edit,
  EditButton,
  Filter,
  List,
  ReferenceManyField,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  refreshView
} from "react-admin";

const styles = {
  searchCard: { marginBottom: "5px" },
  paddingRight: { paddingRight: "20px" },
  accountWrapper: { display: "flex", justifyContent: "space-between", flexWrap: "wrap" }
};

const AccountFilter = props => (
  <Filter {...props}>
    <TextInput label="Search ID" source="_text_id" alwaysOn />
  </Filter>
);

export const AccountList = withStyles(styles)(
  connect(
    undefined,
    { refreshView }
  )(
    class AccountList extends Component {
      state = {
        emailSearch: "",
        searching: false,
        searchStatus: null,
        batchCreate: "",
        creating: false,
        createStatus: null,
        createResults: ""
      };
      componentWillUnmount() {
        this.clearCreateStatusTimer();
        this.clearSearchStatusTimer();
      }
      clearCreateStatusTimer() {
        if (this.createStatusTimer) {
          clearTimeout(this.createStatusTimer);
          this.createStatusTimer = null;
        }
      }
      clearSearchStatusTimer() {
        if (this.searchStatusTimer) {
          clearTimeout(this.searchStatusTimer);
          this.searchStatusTimer = null;
        }
      }
      async onAccountSearch(e) {
        e.preventDefault();
        this.setState({ searching: true, searchStatus: null });
        const result = await fetch("/api/v1/accounts/search", {
          method: "post",
          headers: {
            "content-type": "application/json",
            authorization: `bearer ${window.APP.store.state.credentials.token}`
          },
          body: JSON.stringify({ email: this.state.emailSearch || "" })
        }).then(r => r.json());
        if (result && result.data) {
          window.location = `#/accounts/${result.data[0].id}`;
        } else {
          this.setState({ searching: false, searchStatus: "Account not found" });
        }
        // Quickfix snackbar component does not always close
        // Setting snackbar message to empty string closes
        this.clearSearchStatusTimer();
        this.searchStatusTimer = setTimeout(() => {
          this.setState({ searchStatus: "" });
          this.searchStatusTimer = null;
        }, 6000);
      }
      async onCreateAccount(e) {
        e.preventDefault();
        if (this.state.batchCreate.length === 0) return;
        this.setState({ creating: true, createStatus: null });
        const data = this.state.batchCreate
          .split(";") // ['email1,identity1', '', 'email2','email3,identity with spaces', 'email4']
          .filter(accounts => accounts !== "")
          .map(accounts => {
            const emailAndIdentity = accounts.split(",");
            return emailAndIdentity.length === 1
              ? {
                  email: emailAndIdentity[0].trim()
                }
              : {
                  email: emailAndIdentity[0].trim(),
                  name: emailAndIdentity[1].trim()
                };
          });
        const result = await fetch("/api/v1/accounts", {
          method: "post",
          headers: {
            "content-type": "application/json",
            authorization: `bearer ${window.APP.store.state.credentials.token}`
          },
          body: JSON.stringify({
            data: data.length === 1 ? data[0] : data
          })
        }).then(r => r.json());
        if (result && result.data) {
          // one email added successfully
          this.setState({ creating: false, createStatus: `Account created successfully` });
        } else if (result && result.errors) {
          // one email has errors
          this.setState({ creating: false, createStatus: result.errors[0].detail });
        } else if (Array.isArray(result)) {
          // Multiple email accounts created
          // results = {
          //   'successMsg': [email1, ..., email3],
          //   'errorMsg1': [email4],
          //   'errorMsg2': [email5, email6]
          // }
          const results = {};
          let isAllSuccess = true;
          let hasOneSuccess = false;
          result.forEach((emailResponse, index) => {
            isAllSuccess = isAllSuccess && emailResponse.status === 200;
            hasOneSuccess = hasOneSuccess || emailResponse.status === 200;
            const message =
              emailResponse.status === 200 ? "Created accounts successfully" : emailResponse.body.errors[0].detail;
            const email = data[index].email;
            if (results[message]) results[message].push(email);
            else results[message] = [email];
          });
          this.setState({
            creating: false,
            createStatus: isAllSuccess
              ? "Success adding all accounts"
              : hasOneSuccess
              ? "Success adding some accounts, Errors adding some accounts"
              : "Errors adding all accounts",
            createResults: results
          });
        }
        this.props.refreshView();
        // Quickfix snackbar component does not always close
        // Setting snackbar message to empty string closes
        this.clearCreateStatusTimer();
        this.createStatusTimer = setTimeout(() => {
          this.setState({ createStatus: "" });
          this.createStatusTimer = null;
        }, 6000);
      }
      render() {
        // refreshView() is only needed in onCreateAccounts()
        // eslint-disable-next-line no-unused-vars
        const { classes, refreshView, ...other } = this.props;
        return (
          <>
            <Card className={classes.searchCard}>
              <CardContent>
                <Typography component="h2">
                  <b>Create one or multiple accounts with (optional) identities</b>
                </Typography>
                <Typography component="h3">
                  <i>Single example:</i> email1,identity1
                </Typography>
                <Typography component="h3">
                  <i>Multiple example:</i> email1,identity1;email2;email3,identity3 with spaces;email4
                </Typography>
                <form onSubmit={this.onCreateAccount.bind(this)}>
                  <MuiTextField
                    label="Email, (optional) identity"
                    type="text"
                    style={{ minWidth: "300px" }}
                    required
                    onChange={e => this.setState({ batchCreate: e.target.value })}
                  />
                  <Button onClick={this.onCreateAccount.bind(this)}>Create</Button>
                  {this.state.creating && <CircularProgress />}
                  <Snackbar open={!!this.state.createStatus} autoHideDuration={5000}>
                    <SnackbarContent message={this.state.createStatus}></SnackbarContent>
                  </Snackbar>
                </form>
                {this.state.createResults &&
                  Object.keys(this.state.createResults).map(message => (
                    <>
                      <Typography
                        component="p"
                        color={message.includes("success") ? "textPrimary" : "error"}
                        style={{ paddingTop: "10px" }}
                      >
                        {message}
                      </Typography>
                      <Typography component="p" color="secondary" style={{ paddingBottom: "10px" }}>
                        [ {this.state.createResults[message].join(", ")} ]
                      </Typography>
                    </>
                  ))}
              </CardContent>
            </Card>
            <Card className={classes.searchCard}>
              <CardContent>
                <Typography component="h2">Find an account with an email address</Typography>
                <form onSubmit={this.onAccountSearch.bind(this)}>
                  <MuiTextField
                    label="Account Email"
                    type="email"
                    required
                    onChange={e => this.setState({ emailSearch: e.target.value })}
                  />
                  <Button onClick={this.onAccountSearch.bind(this)}>Find</Button>
                  {this.state.searching && <CircularProgress />}
                  <Snackbar open={!!this.state.searchStatus} autoHideDuration={5000}>
                    <SnackbarContent message={this.state.searchStatus}></SnackbarContent>
                  </Snackbar>
                </form>
              </CardContent>
            </Card>
            <List {...other} filters={<AccountFilter />}>
              <Datagrid>
                <TextField source="id" />
                <DateField source="inserted_at" />
                <DateField source="updated_at" />
                <ReferenceManyField label="Identity" source="_text_id" target="_account_id" reference="identities">
                  <IdentityInline />
                </ReferenceManyField>
                <IdentityCreateLink />
                <BooleanField source="is_admin" />
                <TextField source="state" />
                <EditButton />
              </Datagrid>
            </List>
          </>
        );
      }
    }
  )
);

export const AccountEdit = props => {
  return (
    <Edit {...props}>
      <SimpleForm toolbar={<ToolbarWithoutDelete />}>
        <TextField label="Account ID" source="id" />
        <BooleanInput source="is_admin" />
        <SelectInput
          source="state"
          choices={[{ id: "enabled", name: "enabled" }, { id: "disabled", name: "disabled" }]}
        />

        <ReferenceManyField label="Identity" source="_text_id" target="_account_id" reference="identities">
          <IdentityInline hasPadding />
        </ReferenceManyField>
      </SimpleForm>
    </Edit>
  );
};

const IdentityInline = withStyles(styles)(props => {
  return (
    <div>
      {props.ids &&
        props.ids.map(id => {
          return (
            <div
              key={id}
              className={props.classes.accountWrapper}
              style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}
            >
              <span className={props.hasPadding ? props.classes.paddingRight : ""}>
                {props.data[id].name ? props.data[id].name : ""}
              </span>
              <IdentityEditLink record={{ id }} />
            </div>
          );
        })}
    </div>
  );
});
