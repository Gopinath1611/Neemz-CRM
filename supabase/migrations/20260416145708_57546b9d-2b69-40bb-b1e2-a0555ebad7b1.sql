
ALTER TABLE public.attendance_logs
  ADD COLUMN check_in_lat numeric NULL,
  ADD COLUMN check_in_lng numeric NULL,
  ADD COLUMN check_out_lat numeric NULL,
  ADD COLUMN check_out_lng numeric NULL;

ALTER TABLE public.clinic_settings
  ADD COLUMN geofence_lat numeric NULL,
  ADD COLUMN geofence_lng numeric NULL,
  ADD COLUMN geofence_radius_meters integer NULL DEFAULT 200;
