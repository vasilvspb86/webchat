-- Creates the companion test database on first container start.
-- Runs once thanks to Postgres docker-entrypoint-initdb.d contract.
CREATE DATABASE webchat_test OWNER webchat;
