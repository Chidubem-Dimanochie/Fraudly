import { Amplify } from "aws-amplify";

const origin = window.location.origin;

const redirectSignIn = `${origin}/auth/callback`;
const redirectSignOut = `${origin}/login`;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_HgEmPHJj8",
      userPoolClientId: "4aqnsricmqb5lk6e776ij36l51",
      loginWith: {
        oauth: {
          domain: "fraudly.auth.us-east-1.amazoncognito.com",
          scopes: ["openid", "email", "profile"], 
          redirectSignIn: [redirectSignIn],
          redirectSignOut: [redirectSignOut],
          responseType: "code",
        },
      },
    },
  },
});
