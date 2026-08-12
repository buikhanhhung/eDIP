-- Gemini's embedding endpoint reports no token usage, so the characters sent
-- are counted locally. A real measurement of the same work beats dividing the
-- character count by four and presenting the result as tokens.
ALTER TABLE "TokenUsage" ADD COLUMN "inputChars" INTEGER NOT NULL DEFAULT 0;
