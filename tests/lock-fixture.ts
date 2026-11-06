import { DatabaseSync } from "node:sqlite";
import { dataPaths } from "../src/config.js";

const db = new DatabaseSync(dataPaths().database);
db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
console.log("locked");
setTimeout(() => {
  db.exec("COMMIT");
  db.close();
}, 600);
