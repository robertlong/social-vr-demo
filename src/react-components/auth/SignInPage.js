import React, { useCallback, useState, useReducer, useContext, useEffect } from "react";
import PropTypes from "prop-types";
import { Page } from "../layout/Page";
import styles from "./SignInPage.scss";
import configs from "../../utils/configs";
import IfFeature from "../if-feature";
import { FormattedMessage } from "react-intl";
import { AuthContext } from "../auth/AuthContext";

const SignInStep = {
  submit: "submit",
  waitForVerification: "waitForVerification",
  complete: "complete"
};

const SignInAction = {
  submitEmail: "submitEmail",
  submitOIDC: "submitOIDC",
  verificationReceived: "verificationReceived",
  cancel: "cancel"
};

const initialSignInState = {
  step: SignInStep.submit,
  email: ""
};

function loginReducer(state, action) {
  switch (action.type) {
    case SignInAction.submitEmail:
      return { step: SignInStep.waitForVerification, email: action.email };
    case SignInAction.submitOIDC:
      return { step: SignInStep.waitForVerification };
    case SignInAction.verificationReceived:
      return { ...state, step: SignInStep.complete };
    case SignInAction.cancel:
      return { ...state, step: SignInStep.submit };
  }
}

function useSignIn() {
  const auth = useContext(AuthContext);
  const [state, dispatch] = useReducer(loginReducer, initialSignInState);

  const submitEmail = useCallback(
    email => {
      auth.signIn(email).then(() => {
        dispatch({ type: SignInAction.verificationReceived });
      });
      dispatch({ type: SignInAction.submitEmail, email });
    },
    [auth]
  );

  const submitOIDC = useCallback(
    () => {
      auth.signIn("oidc").then(() => {
        dispatch({ type: SignInAction.verificationReceived });
      });
      dispatch({ type: SignInAction.submitOIDC });
    },
    [auth]
  );

  const cancel = useCallback(() => {
    dispatch({ type: SignInAction.cancel });
  }, []);

  return {
    step: state.step,
    email: state.email,
    submitEmail,
    submitOIDC,
    cancel
  };
}

function SubmitEmail({ onSubmitEmail, initialEmail }) {
  const [email, setEmail] = useState(initialEmail);

  const onSubmitForm = useCallback(
    e => {
      e.preventDefault();
      onSubmitEmail(email);
    },
    [onSubmitEmail, email]
  );

  return (
    <form onSubmit={onSubmitForm} className={styles.signInContainer}>
      <h1>
        <FormattedMessage id="sign-in.in" />
      </h1>
      <b>
        <FormattedMessage id="sign-in.prompt" />
      </b>
      <input
        name="email"
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="example@example.com"
      />
      {(configs.feature("show_terms") || configs.feature("show_privacy")) && (
        <b className={styles.terms}>
          By proceeding, you agree to the{" "}
          <IfFeature name="show_terms">
            <a
              rel="noopener noreferrer"
              target="_blank"
              href={configs.link("terms_of_use", "https://github.com/mozilla/hubs/blob/master/TERMS.md")}
            >
              terms of use
            </a>{" "}
          </IfFeature>
          {configs.feature("show_terms") && configs.feature("show_privacy") && "and "}
          <IfFeature name="show_privacy">
            <a
              rel="noopener noreferrer"
              target="_blank"
              href={configs.link("privacy_notice", "https://github.com/mozilla/hubs/blob/master/PRIVACY.md")}
            >
              privacy notice
            </a>
          </IfFeature>.
        </b>
      )}
      <button type="submit">next</button>
    </form>
  );
}
SubmitEmail.defaultProps = {
  initialEmail: ""
};
SubmitEmail.propTypes = {
  initialEmail: PropTypes.string,
  onSubmitEmail: PropTypes.func.isRequired
};

function SubmitOIDC({ onSubmitOIDC }) {
  const onSubmitForm = useCallback(
    e => {
      e.preventDefault();
      onSubmitOIDC();
    },
    [onSubmitOIDC]
  );

  return (
    <form onSubmit={onSubmitForm} className={styles.signInContainer}>
      <button type="submit">{configs.APP_CONFIG.auth.oidc_button_label || "Sign In"}</button>
    </form>
  );
}
SubmitOIDC.propTypes = {
  onSubmitOIDC: PropTypes.func.isRequired
};

function WaitForVerification({ email, onCancel }) {
  return (
    <div className={styles.signInContainer}>
      <p>
        {email ? (
          <FormattedMessage id="sign-in.auth-started" values={{ email }} />
        ) : (
          <FormattedMessage className="preformatted" id="sign-in.oidc-auth-started" />
        )}
      </p>
      <IfFeature name="show_newsletter_signup">
        <p>
          Want Hubs news sent to your inbox?{"\n"}
          <a href="https://eepurl.com/gX_fH9" target="_blank" rel="noopener noreferrer">
            Subscribe for updates
          </a>.
        </p>
      </IfFeature>
      <button onClick={onCancel}>cancel</button>
    </div>
  );
}

WaitForVerification.propTypes = {
  email: PropTypes.string,
  onCancel: PropTypes.func.isRequired
};

export function SignInPage() {
  const qs = new URLSearchParams(location.search);
  const { step, submitEmail, submitOIDC, cancel, email } = useSignIn();
  const redirectUrl = qs.get("sign_in_destination_url") || "/";

  useEffect(
    () => {
      if (step === SignInStep.complete) {
        window.location = redirectUrl;
      }
    },
    [step, redirectUrl]
  );

  return (
    <Page style={{ backgroundImage: configs.image("home_background", true), backgroundSize: "cover" }}>
      {step === SignInStep.submit ? (
        configs.APP_CONFIG.auth.use_oidc ? (
          <SubmitOIDC onSubmitOIDC={submitOIDC} />
        ) : (
          <SubmitEmail onSubmitEmail={submitEmail} initialEmail={email} signInReason={qs.get("sign_in_reason")} />
        )
      ) : (
        <WaitForVerification onCancel={cancel} email={email} />
      )}
    </Page>
  );
}
