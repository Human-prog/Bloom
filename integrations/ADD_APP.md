# Add New App (Easy Method)

Use `registerApp()` from `integrations/custom.js`:

```js
const custom = require('./integrations/custom');
custom.registerApp({
  name: 'MyApp',
  id: 'myapp',
  baseUrl: 'https://api.myapp.com',
  authType: 'token', // or 'oauth'
  endpoints: {
    status: { method: 'GET', path: '/status' }
  },
  // optional for OAuth:
  redirectUri: 'http://127.0.0.1:8765/callback',
  clientId: '',
  scope: 'read'
});
```

Future users only fill `name`, `id`, `baseUrl`, `authType`, `endpoints` — `sanitizeConfig` handles rest, `registerApp` saves config and validates HTTPS URLs.
