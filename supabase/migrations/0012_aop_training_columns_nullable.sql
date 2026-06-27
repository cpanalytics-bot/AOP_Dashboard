-- BUGFIX (Save draft): "Trainings & Workshops" is an OPTIONAL wizard section, but
-- its columns were NOT NULL. A draft with training left blank sends null -> the
-- aop_training upsert returned 400, which rejected the entire "Save draft"
-- (liveSaveAop runs the section upserts in Promise.all). Make the optional
-- training columns nullable so a blank section saves as null, like every other
-- section.
alter table public.aop_training
  alter column user_school_trainings drop not null,
  alter column non_user_school_trainings drop not null,
  alter column digital_trainings drop not null,
  alter column physical_trainings drop not null,
  alter column teacher_workshops drop not null,
  alter column principal_workshops drop not null,
  alter column stem_workshops drop not null,
  alter column product_demonstrations drop not null;
