declare namespace NodeJS {
  interface ProcessEnv {
    /** Public https origin the app is served from, without a trailing slash. */
    APP_ORIGIN?: string;
    FENIX_CLIENT_ID?: string;
    FENIX_CLIENT_SECRET?: string;
    FENIX_REDIRECT_URI?: string;
    FENIX_COOKIE_SECRET?: string;
  }
}
