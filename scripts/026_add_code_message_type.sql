-- Add 'code' type to messages table check constraint
-- Run this in Supabase SQL Editor

-- First, drop the existing constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;

-- Add the new constraint with 'code' type included
ALTER TABLE messages ADD CONSTRAINT messages_type_check 
  CHECK (type IN ('text', 'image', 'file', 'video', 'audio', 'system', 'code'));










