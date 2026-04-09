-- Add method and ai_confidence columns to respiratory_measurements
-- method: 'manual' or 'ai' to distinguish measurement source
-- ai_confidence: 'alta', 'media', 'baja' for AI measurements
ALTER TABLE respiratory_measurements ADD COLUMN method TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE respiratory_measurements ADD COLUMN ai_confidence TEXT;
