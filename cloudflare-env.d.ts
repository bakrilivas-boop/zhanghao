declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ACCOUNT_ENCRYPTION_KEY?: string;
  }
}
