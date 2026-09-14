-- 0001_extensions.sql
-- Enables extensions required by later migrations (UUID generation).

create extension if not exists "pgcrypto";
