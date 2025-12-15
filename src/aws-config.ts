import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_HgEmPHJj8",
      userPoolClientId: "4aqnsricmqb5lk6e776ij36l51",
      loginWith: {
        oauth: {
          domain: "fraudly.auth.us-east-1.amazoncognito.com",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            "http://localhost:3000/auth/callback",
            "https://fraudly-1.onrender.com/auth/callback"
          ],
          redirectSignOut: [
            "http://localhost:3000/login",
            "https://fraudly-1.onrender.com/login"
          ],
          responseType: "code",
        },
      },
    },
  },
});
