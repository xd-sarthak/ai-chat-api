import {neon} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";

config({path: '.env'});

if(!process.env.DATABASE_URL){
    throw new Error("database url is undefined");
}

//init neon client
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql);