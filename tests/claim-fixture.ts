import { Store } from "../src/store.js";
import { dataPaths } from "../src/config.js";

const store = new Store(dataPaths().database);
const run = store.claim(500);
console.log(JSON.stringify({ claimed: run?.id ?? null }));
if (process.argv.includes("--once")) store.close();
else setInterval(() => {}, 1000);
