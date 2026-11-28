-- 0026_hidden_widgets.down.sql — reverse of 0026_hidden_widgets.up.sql.
-- show_health_bar and show_widgets were kept in step with the list, so they
-- still hold each person's choices and nothing is lost.
ALTER TABLE users DROP COLUMN IF EXISTS hidden_widgets;
ALTER TABLE system_settings DROP COLUMN IF EXISTS health_enabled;
