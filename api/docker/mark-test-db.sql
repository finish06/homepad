-- Runs once, when the compose Postgres volume is first created. It marks
-- homepad_test as a throwaway test database, so the integration tests'
-- server check (internal/dbguard) accepts it even after `make run` has
-- created tables in it.
COMMENT ON DATABASE homepad_test IS 'homepad-throwaway-test';
