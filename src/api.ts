import { dataPaths, apiToken, apiPort } from "./config.js";
import { makeServer } from "./http.js";
import { Store } from "./store.js";

const token = apiToken();
const store = new Store(dataPaths().database);
const server = makeServer(store, token);
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
