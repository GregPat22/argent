import { dataPaths, apiToken, apiPort } from "./config.js";
import { makeServer } from "./http.js";
import { Store } from "./store.js";

const token = apiToken();
const paths = dataPaths();
const store = new Store(paths.database);
const server = makeServer(store, token, { artifactRoot: paths.workspaces });
server.listen(apiPort(), "127.0.0.1", () => {
  const address = server.address();
  console.log(
    JSON.stringify({
      service: "api",
      port: typeof address === "object" ? address?.port : null,
      simulation: true,
    }),
  );
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () =>
    server.close(() => {
      store.close();
    }),
  );
}
