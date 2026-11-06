import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config.ts";
import { healthRoutes } from "./modules/health/health.routes.ts";
import { compileRoutes } from "./modules/compile/compile.routes.ts";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: env.WEB_ORIGIN,
});

app.register(healthRoutes);

app.register(compileRoutes, { prefix: "/compile" });

app.listen({ port: env.PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
