-- Receebo DEV demo seed: 4 fictional saved receipts for demo+clerk_test@receebo.net
-- Run from the workspace root: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v uid='user_xxx' -f scripts/demo-seed/seed-demo.sql
-- Shape copied from receipt #286 (status completed, is_draft false). Fictional data only.
-- object_path is /objects/demo-seed/<uid>/<file>.jpg. Afterwards run
--   scripts/node_modules/.bin/tsx scripts/demo-seed/upload-files.ts <uid>
-- to upload the images in scripts/demo-seed/receipts/ (see README.md).
-- original_file_name deliberately NOT prefixed __seed__ so admin seed-cleanup (admin.ts:583) won't delete them.
-- legal/manufacturer_warranty_expires_on + warranty_calc_version left NULL so the server backfill computes them.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('seed.uid', :'uid', true);
-- guard: refuse to seed if this user already has receipts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM receipts WHERE user_id = current_setting('seed.uid')) THEN
    RAISE EXCEPTION 'user already has receipts, aborting';
  END IF;
END $$;
INSERT INTO receipts (user_id, object_path, original_file_name, content_type, status, is_draft,
  warranty, merchant, purchase_date, delivery_date, total, currency, category, summary, ocr_text,
  transaction_number, products, notable_items, purchase_country, is_online_purchase)
VALUES
(:'uid', '/objects/demo-seed/' || :'uid' || '/demo-casa-lumen.jpg', 'demo_casa_lumen.jpg', 'image/jpeg', 'completed', false,
 '2-year manufacturer warranty', 'Casa Lumen Electrónica', '2026-10-23', NULL, 649.00, 'EUR', 'Electronics',
 'In-store purchase at Casa Lumen Electrónica of a 55" 4K Smart TV.',
 E'CASA LUMEN ELECTRÓNICA\nPorto\n23/10/2026\n1 x 55" 4K Smart TV   649,00\nTOTAL EUR   649,00\nGarantia do fabricante: 2 anos',
 NULL,
 '[{"name":"55\" 4K Smart TV","price":649.00,"quantity":1}]'::jsonb,
 '[{"name":"55\" 4K Smart TV","price":649.00,"category":"Electronics","reason":"high-value electronics with legal and manufacturer warranty"}]'::jsonb,
 'PT', false),
(:'uid', '/objects/demo-seed/' || :'uid' || '/demo-casa-jardim.jpg', 'demo_casa_jardim.jpg', 'image/jpeg', 'completed', false,
 '2-year manufacturer warranty', 'Casa & Jardim Braga', '2026-10-12', NULL, 229.00, 'EUR', 'Home',
 'In-store purchase at Casa & Jardim Braga of a cordless vacuum.',
 E'CASA & JARDIM BRAGA\nBraga\n12/10/2026\n1 x Cordless vacuum   229,00\nTOTAL EUR   229,00\nGarantia do fabricante: 2 anos',
 NULL,
 '[{"name":"Cordless vacuum","price":229.00,"quantity":1}]'::jsonb,
 '[{"name":"Cordless vacuum","price":229.00,"category":"Home","reason":"durable appliance likely covered by warranty"}]'::jsonb,
 'PT', false),
(:'uid', '/objects/demo-seed/' || :'uid' || '/demo-mercado-verde.jpg', 'demo_mercado_verde.jpg', 'image/jpeg', 'completed', false,
 NULL, 'Mercado Verde', '2026-10-19', NULL, 38.47, 'EUR', 'Groceries',
 'Grocery shopping at Mercado Verde.',
 E'MERCADO VERDE\n19/10/2026\nFruta e legumes   12,35\nPão e padaria   6,20\nLaticínios   9,82\nMercearia   10,10\nTOTAL EUR   38,47',
 NULL,
 '[{"name":"Fruta e legumes","price":12.35,"quantity":1},{"name":"Pão e padaria","price":6.20,"quantity":1},{"name":"Laticínios","price":9.82,"quantity":1},{"name":"Mercearia","price":10.10,"quantity":1}]'::jsonb,
 '[]'::jsonb, 'PT', false),
(:'uid', '/objects/demo-seed/' || :'uid' || '/demo-atelier-norte.jpg', 'demo_atelier_norte.jpg', 'image/jpeg', 'completed', false,
 NULL, 'Atelier Norte', '2026-10-04', NULL, 59.90, 'EUR', 'Clothing & Apparel',
 'In-store clothing purchase at Atelier Norte.',
 E'ATELIER NORTE\n04/10/2026\n1 x Camisa de linho   59,90\nTOTAL EUR   59,90',
 NULL,
 '[{"name":"Camisa de linho","price":59.90,"quantity":1}]'::jsonb,
 '[]'::jsonb, 'PT', false)
RETURNING id, merchant, total, purchase_date;
COMMIT;
