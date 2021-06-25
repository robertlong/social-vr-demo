import React from "react";
import { SceneLink, OwnedFileImage, OwnedFileSizeField } from "./fields";
import { FeatureSceneListingButton } from "./feature-listing-buttons";
import { ToolbarWithoutDelete } from "./toolbar-without-delete";

import {
  List,
  Edit,
  SimpleForm,
  TextInput,
  EditButton,
  SelectInput,
  Datagrid,
  TextField,
  ReferenceField,
  DateField,
  BooleanField,
  Filter,
  ArrayInput,
  SimpleFormIterator
} from "react-admin";

const SceneListingFilter = props => (
  <Filter {...props}>
    <TextInput label="Search Name" source="name" alwaysOn />
    <TextInput label="Search SID" source="scene_listing_sid" alwaysOn />
  </Filter>
);

export const SceneListingEdit = props => (
  <Edit {...props}>
    <SimpleForm toolbar={<ToolbarWithoutDelete />}>
      <TextInput source="name" />
      <ArrayInput source="tags.tags" defaultValue={[]}>
        <SimpleFormIterator>
          <TextInput />
        </SimpleFormIterator>
      </ArrayInput>
      <SelectInput
        label="Status"
        source="state"
        choices={[{ id: "active", name: "active" }, { id: "delisted", name: "delisted" }]}
      />
    </SimpleForm>
  </Edit>
);

export const SceneListingList = props => (
  <List {...props} filters={<SceneListingFilter />}>
    <Datagrid>
      <OwnedFileImage source="screenshot_owned_file_id" />
      <OwnedFileSizeField label="Model size" source="model_owned_file_id" />
      <TextField source="name" />
      <SceneLink source="scene_listing_sid" />
      <ReferenceField label="Scene" source="scene_id" reference="scenes">
        <TextField source="name" />
      </ReferenceField>
      <ReferenceField label="Allow remixing" source="scene_id" reference="scenes" link={false}>
        <BooleanField source="allow_remixing" />
      </ReferenceField>
      <ReferenceField label="Allow promotion" source="scene_id" reference="scenes" link={false}>
        <BooleanField source="allow_promotion" />
      </ReferenceField>
      <DateField source="updated_at" />
      <TextField label="Status" source="state" />
      <FeatureSceneListingButton />
      <EditButton />
    </Datagrid>
  </List>
);
