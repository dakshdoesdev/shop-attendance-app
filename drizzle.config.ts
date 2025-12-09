import { defineConfig } from "drizzle-kit";
// Ensure .env is loaded when running via CLI
import "dotenv/config";

// Optional dev override to bypass TLS verification when encountering
// "self signed certificate in certificate chain" in certain networks.
// Set PG_NO_SSL_VERIFY=true in .env to enable (NOT recommended for production).
const noSslVerify = (process.env.PG_NO_SSL_VERIFY || "").toLowerCase() === "true";
if (noSslVerify) {
  // Disable TLS verification for this CLI process
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
