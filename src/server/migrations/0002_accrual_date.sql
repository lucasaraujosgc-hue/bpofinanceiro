-- 0002_accrual_date — data de competência/emissão (opcional).
--
-- O sistema é regime de caixa: `date` é a data do movimento financeiro. Este
-- campo guarda a data em que a receita/despesa foi GERADA (emissão da nota,
-- fechamento da venda). NULL = à vista (competência = caixa). É a base do
-- cálculo de PMR/PMP na aba Ciclo Financeiro.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS accrual_date TEXT;
ALTER TABLE forecasts    ADD COLUMN IF NOT EXISTS accrual_date TEXT;
