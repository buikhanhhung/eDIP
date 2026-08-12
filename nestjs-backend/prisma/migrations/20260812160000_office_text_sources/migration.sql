-- Spreadsheets and decks are read through their own converters, so the column
-- that records how a document's text was obtained needs to be able to say so.
ALTER TYPE "TextSource" ADD VALUE IF NOT EXISTS 'xlsx';
ALTER TYPE "TextSource" ADD VALUE IF NOT EXISTS 'pptx';
