
-- Problems table

CREATE TABLE IF NOT EXISTS public.problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL DEFAULT 'Anonymous',

  content TEXT NOT NULL
    CHECK (
      char_length(trim(content))
      BETWEEN 1 AND 1000
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add name column to an existing table

ALTER TABLE public.problems
ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Anonymous';

-- Enable security

ALTER TABLE public.problems
ENABLE ROW LEVEL SECURITY;

-- Read policy

DROP POLICY IF EXISTS
"Anyone can read problems"
ON public.problems;

CREATE POLICY "Anyone can read problems"
ON public.problems
FOR SELECT
TO anon, authenticated
USING (true);

-- Insert policy

DROP POLICY IF EXISTS
"Anyone can submit problems"
ON public.problems;

CREATE POLICY "Anyone can submit problems"
ON public.problems
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(trim(name)) BETWEEN 1 AND 60
  AND char_length(trim(content)) BETWEEN 1 AND 1000
);

-- Index

CREATE INDEX IF NOT EXISTS problems_created_at_idx
ON public.problems (created_at DESC);

-- Agreements table

CREATE TABLE IF NOT EXISTS public.problem_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  problem_id UUID NOT NULL
    REFERENCES public.problems(id)
    ON DELETE CASCADE,

  voter_id UUID NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_agreement_per_voter
  UNIQUE (problem_id, voter_id)
);

-- Agreement index

CREATE INDEX IF NOT EXISTS problem_agreements_problem_id_idx
ON public.problem_agreements (problem_id);

-- Enable RLS

ALTER TABLE public.problem_agreements
ENABLE ROW LEVEL SECURITY;

-- Read agreements

DROP POLICY IF EXISTS
"Anyone can read agreements"
ON public.problem_agreements;

CREATE POLICY "Anyone can read agreements"
ON public.problem_agreements
FOR SELECT
TO anon, authenticated
USING (true);

-- Insert agreements

DROP POLICY IF EXISTS
"Anyone can agree"
ON public.problem_agreements;

CREATE POLICY "Anyone can agree"
ON public.problem_agreements
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Enable realtime for problems

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
  ADD TABLE public.problems;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime for agreements

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
  ADD TABLE public.problem_agreements;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
