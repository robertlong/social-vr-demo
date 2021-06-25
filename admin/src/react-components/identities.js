import React from "react";
import { withStyles } from "@material-ui/core/styles";
import {
  Create,
  Datagrid,
  DateField,
  Edit,
  EditButton,
  Filter,
  List,
  ReferenceField,
  SimpleForm,
  TextField,
  TextInput
} from "react-admin";

const styles = {
  hide: { display: "none" },
  noBorder: { border: "0px" }
};

const IdentityFilter = props => (
  <Filter {...props}>
    <TextInput label="Search Identity" source="name" alwaysOn />
  </Filter>
);

export const IdentityList = withStyles(styles)(props => (
  <List {...props} filters={<IdentityFilter />}>
    <Datagrid>
      <DateField source="inserted_at" />
      <DateField source="updated_at" />
      <TextField source="name" />
      <ReferenceField label="Account" reference="accounts" source="account_id">
        <TextField source="id" />
      </ReferenceField>
      <EditButton />
    </Datagrid>
  </List>
));

export const IdentityEdit = props => (
  <Edit {...props}>
    <SimpleForm redirect={(path, id, data) => `/accounts/${data.account_id}`}>
      <ReferenceField label="Identity for Account ID" reference="accounts" source="account_id" link={false}>
        <TextField source="id" />
      </ReferenceField>
      <TextInput source="name" />
    </SimpleForm>
  </Edit>
);

export const IdentityCreate = props => (
  <Create {...props}>
    <SimpleForm redirect={(path, id, data) => `/accounts/${data.account_id}`}>
      <ReferenceField label="Identity for Account ID" reference="accounts" source="account_id" link={false}>
        <TextField source="id" />
      </ReferenceField>
      <TextInput source="name" />
    </SimpleForm>
  </Create>
);
