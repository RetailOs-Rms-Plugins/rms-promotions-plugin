import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: "http://localhost:8000",
      adminCors: "http://localhost:9000",
      authCors: "http://localhost:9000",
      jwtSecret: "supersecret",
      cookieSecret: "supersecret",
    },
  },
  modules: [
    {
      resolve: "./src/modules/threshold-promotion",
    },
  ],
})
