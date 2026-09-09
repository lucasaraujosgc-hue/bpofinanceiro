-- 0005_drop_accrual_date — remove a "data de competência".
--
-- O sistema é regime de caixa. A data de competência (accrual_date) foi
-- introduzida na 0002 para alimentar PMR/PMP, mas na prática poluía os
-- formulários de lançamento/previsão sem contrapartida clara. O Ciclo
-- Financeiro passa a estimar PMR/PMP só pela carteira de previsões em aberto.

ALTER TABLE transactions DROP COLUMN IF EXISTS accrual_date;
ALTER TABLE forecasts DROP COLUMN IF EXISTS accrual_date;
