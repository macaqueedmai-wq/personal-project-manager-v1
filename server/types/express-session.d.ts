import 'express-session';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    credentialFingerprint?: string;
    dataEpoch?: string;
    csrfToken?: string;
  }
}
