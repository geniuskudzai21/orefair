-- Seed reference prices with realistic approximations (USD per gram).
-- Idempotent: safe to run more than once.

INSERT INTO reference_prices (mineral_key, mineral_name, price_per_gram, currency, source) VALUES
  ('gold',    'Gold',                   75.0,    'USD', 'approx. spot, ~USD 2,330/oz'),
  ('platinum','Platinum',               28.0,    'USD', 'approx. spot, ~USD 870/oz'),
  ('silver',  'Silver',                 0.84,    'USD', 'approx. spot, ~USD 26/oz'),
  ('copper',  'Copper',                 0.009,   'USD', 'approx. refined copper, ~USD 9,000/t'),
  ('chrome',  'Chrome (chromite ore)',  0.0002,  'USD', 'approx. chromite concentrate, ~USD 180/t')
ON CONFLICT (mineral_key) DO UPDATE SET
  mineral_name = EXCLUDED.mineral_name,
  price_per_gram = EXCLUDED.price_per_gram,
  source = EXCLUDED.source,
  updated_at = now();