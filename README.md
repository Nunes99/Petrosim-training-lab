# PetroSim Training Lab

PetroSim Training Lab is a virtual training and simulation platform
for petroleum and gas engineering.

## MVP modules

1. Reservoir Reserves Lab
2. Petroleum Economics Lab
3. HSE Decision Trainer

## Initial technology stack

- HTML5
- CSS3
- JavaScript
- Python
- FastAPI
- Supabase
- Vercel
- GitHub

## Current version

MVP 0.2

## Local development

1. Create a virtual environment and install `requirements.txt`.
2. Copy `.env.example` to `.env` and provide the public Supabase values.
3. Load the environment variables and run `uvicorn api.index:app --reload`.
4. Serve `public/` through Vercel CLI (`vercel dev`) for the same routes used in production.

## Supabase

Create a Supabase project and run `database/schema.sql` in its SQL editor.
The schema enables Row Level Security, student profiles, training modules and
administrative policies. Re-run the complete script after updates; it is
designed to preserve existing records.

To assign the first administrator, replace the e-mail and run this separately
in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'admin@example.com'
);
```

The administration console is then available at `/admin`. Never expose a
service-role key in the browser.

## GitHub to Vercel

Import this GitHub repository into a Vercel project. Keep the root directory
at the repository root and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for
Production, Preview, and Development. The Vercel Git integration creates a
preview for branch pushes and deploys the production branch automatically.
