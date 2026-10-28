-- Rules the database itself enforces, so a bug in the API cannot break them.

-- FR 8.2, NFR 4: the audit log is append-only for everyone, including the owner.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (FR 8.2, NFR 4)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_change();

-- FR 5.3: the server never holds a Pending case.
ALTER TABLE "cases" ADD CONSTRAINT "cases_status_not_pending" CHECK ("status" <> 'PENDING');

-- FR 7.1: a Reviewed case always has a priority, a reviewer and a time.
ALTER TABLE "cases" ADD CONSTRAINT "cases_reviewed_complete"
  CHECK ("status" <> 'REVIEWED' OR ("priority" IS NOT NULL AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL));

-- FR 2.3: no patient record without consent.
ALTER TABLE "patients" ADD CONSTRAINT "patients_consent_required" CHECK ("consentGiven" = true);
ALTER TABLE "patients" ADD CONSTRAINT "patients_age_range" CHECK ("age" BETWEEN 0 AND 120);

-- FR 4.1: pain level 1-10.
ALTER TABLE "symptom_assessments" ADD CONSTRAINT "symptom_pain_range" CHECK ("painLevel" BETWEEN 1 AND 10);

-- FR 3.3: one image cannot exceed the whole-submission limit (2 MB = 2048 KB).
ALTER TABLE "oral_images" ADD CONSTRAINT "oral_images_size" CHECK ("sizeKB" > 0 AND "sizeKB" <= 2048);

-- NFR 4, NFR 6: the API's runtime role gets no DELETE anywhere and only
-- INSERT + SELECT on the audit log. The role is created by
-- infra/postgres/init/01-roles.sh; this block is skipped where it does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smilesync_app') THEN
    GRANT USAGE ON SCHEMA public TO smilesync_app;
    GRANT SELECT, INSERT, UPDATE ON "users", "patients", "cases", "oral_images",
      "symptom_assessments", "clinical_notes" TO smilesync_app;
    GRANT SELECT, INSERT ON "audit_log" TO smilesync_app;
  END IF;
END
$$;
