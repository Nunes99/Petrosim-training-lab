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

MVP 0.1

## Local development

1. Create a virtual environment and install `requirements.txt`.
2. Copy `.env.example` to `.env` and provide the public Supabase values.
3. Load the environment variables and run `uvicorn app:app --reload`.
4. Serve `public/` through Vercel CLI (`vercel dev`) for the same routes used in production.

## Supabase

Create a Supabase project and run `database/schema.sql` in its SQL editor.
The schema enables Row Level Security, so each authenticated user can only
access their own profile and simulations. Never expose a service-role key in
the browser.

## GitHub to Vercel

Import this GitHub repository into a Vercel project. Keep the root directory
at the repository root and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for
Production, Preview, and Development. The Vercel Git integration creates a
preview for branch pushes and deploys the production branch automatically.
