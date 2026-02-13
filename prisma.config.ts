import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Direct TCP connection for CLI operations (migrate, push, seed)
    url: env("POSTGRES_URL"),
  },
});
