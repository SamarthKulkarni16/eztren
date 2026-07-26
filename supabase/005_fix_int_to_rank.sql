-- Fixes: "function chr(bigint) does not exist"
-- chr() only accepts integer, but the rank math was done in bigint.

create or replace function eztren.int_to_rank(n bigint) returns text
language plpgsql immutable as $$
declare
  result text := '';
  num bigint := n;
begin
  while num > 0 loop
    num := num - 1;
    result := chr((65 + (num % 26))::int) || result;
    num := num / 26;
  end loop;
  return result;
end;
$$;
