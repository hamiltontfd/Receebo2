# Dev demo account seed

Fictional data only (same story as the landing media). Dev database only; never
run against production.

1. Insert the four receipts (refuses if the user already has receipts):
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v uid='user_xxx' -f scripts/demo-seed/seed-demo.sql`
2. Upload their receipt images and link them:
   `scripts/node_modules/.bin/tsx scripts/demo-seed/upload-files.ts user_xxx`

Images live in `receipts/` and are stored privately at
`/objects/demo-seed/<user id>/<file>.jpg`. Step 2 is idempotent and also repairs
receipts from the old seed that used `__seed__/demo-*.jpg` placeholder paths
(those never had a file, so "Open" stayed disabled).
