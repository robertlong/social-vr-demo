import React from "react";
import Typography from "@material-ui/core/Typography";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Button from "@material-ui/core/Button";

export const UnauthorizedPage = () => (
  <div
    style={{
      marginLeft: "auto",
      marginRight: "auto",
      padding: "20px",
      maxWidth: "700px"
    }}
  >
    <Card>
      <CardContent
        style={{
          padding: "40px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}
      >
        <Typography variant="h6">Sorry! Your account is not an admin.</Typography>
        <Button variant="contained" style={{ marginTop: "40px" }} color="secondary" href="/">
          Return Home
        </Button>
      </CardContent>
    </Card>
  </div>
);
