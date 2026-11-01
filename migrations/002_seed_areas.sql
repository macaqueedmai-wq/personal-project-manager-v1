-- 002_seed_areas.sql
-- The seven areas are fixed seed data. Re-running this statement never
-- duplicates a row and never overwrites a name that already exists.

insert into areas (id, name, sort_order) values
  ('study', '學業 HKU-MAAIES', 1),
  ('degree', '申博申碩', 2),
  ('career-hk', '香港找工作／實習', 3),
  ('internship-sz', '深圳找實習', 4),
  ('health', '健康管理與運動', 5),
  ('social', '社交圈子管理', 6),
  ('outreach', '其他外展活動', 7)
on conflict (id) do nothing;

do $$
begin
  if (select count(*) from areas) <> 7 then
    raise exception 'areas table must contain exactly seven seeded areas';
  end if;
end
$$;
