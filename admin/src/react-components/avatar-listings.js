import React from "react";
import { AvatarLink, OwnedFileImage, ConditionalReferenceField } from "./fields";
import { FeatureAvatarListingButton } from "./feature-listing-buttons";
import { ToolbarWithoutDelete } from "./toolbar-without-delete";

import {
  List,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  EditButton,
  SelectInput,
  Datagrid,
  TextField,
  DateField,
  BooleanField,
  Filter,
  ArrayInput,
  SimpleFormIterator
} from "react-admin";

const AvatarListingFilter = props => (
  <Filter {...props}>
    <TextInput label="Search Name" source="name" alwaysOn />
    <TextInput label="Search SID" source="avatar_listing_sid" alwaysOn />
  </Filter>
);

export const AvatarListingEdit = props => (
  <Edit {...props}>
    <SimpleForm toolbar={<ToolbarWithoutDelete />}>
      <TextInput source="name" />
      <TextInput source="description" />
      <TextInput source="attribution" />
      <ArrayInput source="tags.tags" defaultValue={[]}>
        <SimpleFormIterator>
          <TextInput />
        </SimpleFormIterator>
      </ArrayInput>
      <NumberInput source="order" />
      <SelectInput source="state" choices={[{ id: "active", name: "active" }, { id: "delisted", name: "delisted" }]} />
    </SimpleForm>
  </Edit>
);

const rowStyle = record => ({
  opacity: record.state === "delisted" ? 0.3 : 1
});

export const AvatarListingList = props => (
  <List {...props} filters={<AvatarListingFilter />} bulkActionButtons={false}>
    <Datagrid rowStyle={rowStyle}>
      <OwnedFileImage
        source="thumbnail_owned_file_id"
        aspect="tall"
        defaultImage="https://asset-bundles-prod.reticulum.io/bots/avatar_unavailable.png"
      />
      <TextField source="name" />
      <TextField source="order" />
      <AvatarLink source="avatar_listing_sid" />
      <ConditionalReferenceField link="" reference="avatar_listings" source="parent_avatar_listing_id">
        <TextField source="name" />
      </ConditionalReferenceField>
      <OwnedFileImage source="base_map_owned_file_id" aspect="square" />
      <OwnedFileImage source="emissive_map_owned_file_id" aspect="square" />
      <OwnedFileImage source="normal_map_owned_file_id" aspect="square" />
      <OwnedFileImage source="orm_map_owned_file_id" aspect="square" />
      <TextField source="attributions" />
      <BooleanField source="allow_remixing" />
      <DateField source="updated_at" />
      <FeatureAvatarListingButton />
      <EditButton />
    </Datagrid>
  </List>
);
