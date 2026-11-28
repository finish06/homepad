-- 0026_hidden_widgets.up.sql — health as a widget (SPEC-health-widget §4.2).
--
-- users.hidden_widgets is each person's list of hidden widgets and widget
-- parts: clock, weather, health, healthDetails, tiles. It replaces the
-- show_health_bar and show_widgets switches. The Go side checks the keys
-- against one allowlist (storage.WidgetKeys), not a CHECK, so a later key
-- needs no migration.
--
-- system_settings.health_enabled is the household switch for health, beside
-- clock_enabled and weather_enabled. It starts on, so no install changes on
-- upgrade.
--
-- The backfill copies every existing choice into the list (AC-002, AC-003),
-- in the fixed key order. The mapping differs by role on purpose: for an
-- adult, show_health_bar = false meant "verdict only" (healthDetails); for a
-- kid it meant "no panel" (health). A kid's show_widgets was never read, so
-- it is not copied.
--
-- The runner (storage.Migrate) records each file and runs it once. The
-- backfill still runs only in the batch that adds the column, as in 0023, so
-- a re-run (a lost record) never undoes a later choice.
--
-- Roll-back-safe: show_health_bar and show_widgets stay, and the API writes
-- them from the list on every change until 19.0.0, so an 18.7 image sees
-- what each person chose.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users'
          AND column_name = 'hidden_widgets'
    ) THEN
        ALTER TABLE users ADD COLUMN hidden_widgets TEXT[] NOT NULL DEFAULT '{}';
        -- Adults: carry both old switches over.
        UPDATE users SET hidden_widgets = array_remove(ARRAY[
                 CASE WHEN NOT show_widgets    THEN 'clock'         END,
                 CASE WHEN NOT show_widgets    THEN 'weather'       END,
                 CASE WHEN NOT show_health_bar THEN 'healthDetails' END,
                 CASE WHEN NOT show_widgets    THEN 'tiles'         END], NULL)
         WHERE role <> 'kid';
        -- Kids: show_health_bar gated the whole panel; show_widgets was ignored.
        UPDATE users SET hidden_widgets = '{health}'
         WHERE role = 'kid' AND NOT show_health_bar;
    END IF;
END $$;

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS health_enabled BOOLEAN NOT NULL DEFAULT TRUE;
