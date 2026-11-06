import { Valkey } from "iovalkey";
import { env } from "../config.ts";

export const valkey = new Valkey(env.VALKEY_URL, { maxRetriesPerRequest: null });
