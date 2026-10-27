import { execSync } from "node:child_process";

export default function setup() {
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: "postgresql://elshams:elshams_dev@localhost:5433/elshams_test" } });
}
