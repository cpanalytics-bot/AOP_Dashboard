-- Test Prep Teacher Count: number of teachers who will be given test-prep samples
-- (captured with name + phone). Mandatory in the wizard; nullable at rest.
alter table public.aop_sampling_conversion
  add column if not exists test_prep_teacher_count numeric;
