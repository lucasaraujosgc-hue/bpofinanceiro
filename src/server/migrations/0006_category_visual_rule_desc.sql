-- 0006 — categoria com ícone + cor (âncora visual da tela de Lançamentos) e
-- regra de importação que também sobrescreve a descrição do lançamento.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE keyword_rules ADD COLUMN IF NOT EXISTS set_description TEXT;
