export const testConfig = {
  PHOTO_STORAGE_DIR: "/tmp/bambam-test-photos",
  APP_ENV: "development", DATABASE_URL: "postgres://bambam:bambam@127.0.0.1:55432/bambam_cr056_test",
  APP_SESSION_SECRET: "test-session-secret-separate-32-bytes-long", APP_SESSION_TTL: "12h",
  SSO_ISSUER: "https://rmc-sso.cipcloud.net", SSO_CLIENT_ID: "bam",
  SSO_CLIENT_SECRET: "test-provider-secret-at-least-32-bytes-long",
  SSO_AUTHORIZE_URL: "https://rmc-sso.cipcloud.net/api/auth/oauth2/authorize",
  SSO_TOKEN_URL: "https://rmc-sso.cipcloud.net/api/auth/oauth2/token",
  SSO_USERINFO_URL: "https://rmc-sso.cipcloud.net/api/auth/oauth2/userinfo",
  SSO_END_SESSION_URL: "https://rmc-sso.cipcloud.net/api/auth/oauth2/endsession",
  SSO_REDIRECT_URI: "http://localhost:3000/api/auth/callback/rmc-sso",
  SSO_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000/signed-out", ROLE_SWITCHER_ENABLED: "true",
};
