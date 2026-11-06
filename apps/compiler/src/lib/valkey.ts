import { Valkey } from "iovalkey";
import { env } from "../config.ts";

// BullMQ workers require maxRetriesPerRequest: null
export const valkey = new Valkey(env.VALKEY_URL, { maxRetriesPerRequest: null });
