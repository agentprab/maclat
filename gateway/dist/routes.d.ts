import type { Hono } from 'hono';
import type Database from 'better-sqlite3';
export declare function createRoutes(app: Hono, db: Database.Database): void;
