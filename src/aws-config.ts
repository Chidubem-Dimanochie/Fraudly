import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_HgEmPHJj8',
      userPoolClientId: '4aqnsricmqb5lk6e776ij36l51',
      loginWith: {
        oauth: {
          domain: 'fraudly.auth.us-east-1.amazoncognito.com',
          scopes: ['openid', 'email', 'phone'],
          // We point to /auth/callback to handle the sync logic before showing the dashboard
          redirectSignIn: ['http://localhost:3000/auth/callback'],
          redirectSignOut: ['http://localhost:3000/login'],
          responseType: 'code',
        }
      }
    }
  }
});