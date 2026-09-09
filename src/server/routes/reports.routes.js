import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { dreBucketFor } from '../accounting.js';
import { computeDre } from '../lib/dre.js';
import { computeFinancialCycle } from '../lib/financialCycle.js';

// Lê year/month da query e valida antes de irem para o SQL — um `year=abc`
// vira NaN e quebra `EXTRACT(...) = $n` com 500. `month` é 0-indexado (JS);
// 0 = janeiro (é um mês de verdade, não "ano todo"). Retorna { y, m } ou { bad }.
function parsePeriod(q) {
    const y = parseInt(q.year, 10);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return { bad: 'ano inválido' };
    const raw = q.month;
    const hasMonth = raw !== undefined && raw !== '' && raw !== 'null' && raw !== null;
    let m = null;
    if (hasMonth) {
        m = parseInt(raw, 10);
        if (!Number.isInteger(m) || m < 0 || m > 11) return { bad: 'mês inválido' };
    }
    return { y, m };
}
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export default function register(app) {
app.get('/api/reports/cash-flow', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const userId = req.userId;

    try {
        let startDate, endDate;
        if (m !== null) {
            startDate = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0];
            endDate = new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1)).toISOString().split('T')[0];
        } else {
            startDate = new Date(Date.UTC(y, 0, 1)).toISOString().split('T')[0];
            endDate = new Date(Date.UTC(y + 1, 0, 1)).toISOString().split('T')[0];
        }

        const balancePromise = pool.query(`SELECT SUM(CASE WHEN type = 'credito' THEN value ELSE -value END) as balance FROM transactions WHERE user_id = $1 AND date < $2`, [userId, startDate]);
        const startBalanceRes = await balancePromise;
        const startBalance = Number(startBalanceRes.rows[0]?.balance || 0);

        const { rows } = await pool.query(
            `SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = $1 AND t.date >= $2 AND t.date < $3`,
            [userId, startDate, endDate]
        );

        const totalReceitas = rows.filter(r => r.type === 'credito').reduce((sum, r) => sum + Number(r.value), 0);
        const totalDespesas = rows.filter(r => r.type === 'debito').reduce((sum, r) => sum + Number(r.value), 0);
        
        const receitasCat = {};
        const despesasCat = {};

        rows.forEach(r => {
            const catName = r.category_name || 'Sem Categoria';
            const value = Number(r.value);
            if (r.type === 'credito') receitasCat[catName] = (receitasCat[catName] || 0) + value;
            else despesasCat[catName] = (despesasCat[catName] || 0) + value;
        });

        res.json({
            startBalance,
            totalReceitas,
            totalDespesas,
            endBalance: startBalance + totalReceitas - totalDespesas,
            receitasByCategory: Object.entries(receitasCat).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
            despesasByCategory: Object.entries(despesasCat).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value)
        });
            
    } catch (e) {
        console.error("Cashflow Report Error:", e.stack);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/reports/daily-flow', authenticateToken, async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Datas necessárias' });
    if (!isYmd(startDate) || !isYmd(endDate)) return res.status(400).json({ error: 'Datas inválidas (use AAAA-MM-DD)' });

    try {
        // Saldo de abertura: tudo que entrou/saiu ANTES de startDate.
        const openRes = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'credito' THEN value ELSE -value END), 0) AS saldo
             FROM transactions WHERE user_id = $1 AND date::date < $2::date`,
            [req.userId, startDate]
        );
        const openingBalance = Number(openRes.rows[0].saldo || 0);

        // ::date normaliza lançamentos que vierem com hora (ex.: import de NFe).
        const { rows } = await pool.query(
            `SELECT (date::date)::text AS d, type, SUM(value) AS total
             FROM transactions
             WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date
             GROUP BY date::date, type`,
            [req.userId, startDate, endDate]
        );
        const byDay = {};
        rows.forEach(r => {
            if (!byDay[r.d]) byDay[r.d] = { income: 0, expense: 0 };
            if (r.type === 'credito') byDay[r.d].income += Number(r.total);
            else byDay[r.d].expense += Number(r.total);
        });

        // Série contínua (todos os dias) para a linha de saldo acumulado não ter buracos.
        const series = [];
        let running = openingBalance;
        let minSaldo = openingBalance, minDate = startDate;
        const cur = new Date(startDate + 'T00:00:00Z');
        const end = new Date(endDate + 'T00:00:00Z');
        let guard = 0;
        while (cur <= end && guard++ < 1100) {
            const key = cur.toISOString().split('T')[0];
            const d = byDay[key] || { income: 0, expense: 0 };
            const net = d.income - d.expense;
            running += net;
            if (running < minSaldo) { minSaldo = running; minDate = key; }
            series.push({ date: key, income: d.income, expense: d.expense, net, saldo: running });
            cur.setUTCDate(cur.getUTCDate() + 1);
        }

        res.json({ openingBalance, closingBalance: running, minSaldo, minDate, series });
    } catch (err) {
        console.error("Daily Flow Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});

// DRE CORRIGIDO COM LÓGICA CONTÁBIL E POSTGRES SQL
app.get('/api/reports/dre', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const userId = req.userId;

    let query = `SELECT t.*, c.name as category_name, c.group_type FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { 
        query += ` AND EXTRACT(MONTH FROM t.date::date) = $3`; 
        params.push(m + 1); 
    }

    try {
        const { rows } = await pool.query(query, params);

        let dre = { 
            receitaBruta: 0, 
            deducoes: 0, 
            cmv: 0, 
            outrasReceitas: 0,
            despesasOperacionais: 0, 
            resultadoFinanceiro: 0, 
            receitaNaoOperacional: 0, 
            despesaNaoOperacional: 0, 
            impostos: 0 
        };

        rows.forEach(t => {
            const group = t.group_type || '';
            const val = Number(t.value);
            const isCredit = t.type === 'credito';

            // Agrupamento
            if (group === 'receita_bruta') dre.receitaBruta += val;
            else if (group === 'impostos') { 
                if(!isCredit) {
                    dre.deducoes += val; 
                    dre.impostos += val;
                }
            }
            else if (group === 'custo_operacional') dre.cmv += val;
            else if (group === 'outras_receitas') dre.outrasReceitas += val;
            else if (group === 'receita_financeira') dre.resultadoFinanceiro += val;
            else if (group === 'despesa_financeira') dre.resultadoFinanceiro -= val;
            else if (group === 'receita_nao_operacional') dre.receitaNaoOperacional += val;
            else if (group === 'despesa_nao_operacional') dre.despesaNaoOperacional += val;
            else if (['despesa_operacional', 'despesa_pessoal', 'despesa_administrativa'].includes(group)) dre.despesasOperacionais += val;
            else if (group === 'nao_operacional') { /* Ignora */ }
            else { 
                const cat = (t.category_name || '').toLowerCase();
                if (!isCredit) dre.despesasOperacionais += val; 
                else if(cat.includes('venda') || cat.includes('serviço')) dre.receitaBruta += val;
                else dre.outrasReceitas += val;
            }
        });

        const receitaLiquida = dre.receitaBruta - dre.deducoes;
        const resultadoBruto = receitaLiquida - dre.cmv;
        const resultadoOperacional = resultadoBruto - dre.despesasOperacionais;
        const resultadoAntesNaoOperacional = resultadoOperacional + dre.resultadoFinanceiro + dre.outrasReceitas;
        const resultadoNaoOperacionalTotal = dre.receitaNaoOperacional - dre.despesaNaoOperacional;
        const lucroLiquido = resultadoAntesNaoOperacional + resultadoNaoOperacionalTotal;

        res.json({
            receitaBruta: dre.receitaBruta, 
            deducoes: dre.deducoes, 
            receitaLiquida, 
            cmv: dre.cmv, 
            resultadoBruto,
            despesasOperacionais: dre.despesasOperacionais, 
            resultadoOperacional, 
            resultadoFinanceiro: dre.resultadoFinanceiro,
            outrasReceitas: dre.outrasReceitas,
            resultadoNaoOperacional: resultadoNaoOperacionalTotal, 
            resultadoAntesNaoOperacional,
            lucroLiquido
        });
    } catch (err) {
        console.error("DRE Report Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});

// DRE gerencial — estrutura do art. 187 da Lei 6.404/76 adaptada ao regime de
// caixa (o sistema só conhece lançamentos realizados). Base da análise
// vertical (AV): Receita Operacional Líquida.
app.get('/api/reports/dre-hierarchical', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const userId = req.userId;

    let query = `SELECT t.type, t.value, c.name AS category_name, c.group_type
                 FROM transactions t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { query += ` AND EXTRACT(MONTH FROM t.date::date) = $3`; params.push(m + 1); }

    try {
        const { rows } = await pool.query(query, params);

        const buckets = {};
        const add = (bk, cat, val) => {
            if (!buckets[bk]) buckets[bk] = { total: 0, children: {} };
            buckets[bk].total += val;
            buckets[bk].children[cat] = (buckets[bk].children[cat] || 0) + val;
        };
        rows.forEach(r => {
            const bk = dreBucketFor(r);
            if (!bk) return; // movimento patrimonial/interno — fora do DRE
            add(bk, r.category_name || 'Sem categoria', Number(r.value) || 0);
        });
        const B = k => (buckets[k] ? buckets[k].total : 0);
        const kids = (k, mult = 1) => Object.entries(buckets[k] ? buckets[k].children : {})
            .map(([label, value]) => ({ label, value: value * mult }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        const receitaBruta = B('receita_bruta');
        const deducoes = B('deducoes');
        const receitaLiquida = receitaBruta - deducoes;
        const cmv = B('cmv');
        const lucroBruto = receitaLiquida - cmv;
        const dVendas = B('desp_vendas');
        const dPessoal = B('desp_pessoal');
        const dAdmin = B('desp_admin');
        const dGerais = B('desp_gerais');
        const outrasRecOp = B('outras_receitas_op');
        const despesasOperacionais = dVendas + dPessoal + dAdmin + dGerais;
        const resultadoOperacional = lucroBruto - despesasOperacionais + outrasRecOp;
        const recFin = B('receita_financeira');
        const despFin = B('despesa_financeira');
        const resultadoFinanceiro = recFin - despFin;
        const resultadoAntesTributos = resultadoOperacional + resultadoFinanceiro;
        const recNaoOp = B('receita_nao_op');
        const despNaoOp = B('despesa_nao_op');
        const resultadoNaoOperacional = recNaoOp - despNaoOp;
        const irpjCsll = B('irpj_csll');
        const lucroLiquido = resultadoAntesTributos + resultadoNaoOperacional - irpjCsll;

        const base = receitaLiquida !== 0 ? Math.abs(receitaLiquida) : 1;
        const pct = v => (v / base) * 100;

        const lines = [
            { key: 'rb', kind: 'group', label: 'Receita Operacional Bruta', value: receitaBruta, pct: pct(receitaBruta), children: kids('receita_bruta') },
            { key: 'ded', kind: 'group', label: '(-) Impostos e Deduções sobre Vendas', value: -deducoes, pct: pct(-deducoes), children: kids('deducoes', -1) },
            { key: 'rl', kind: 'subtotal', label: '= Receita Operacional Líquida', value: receitaLiquida, pct: pct(receitaLiquida) },
            { key: 'cmv', kind: 'group', label: '(-) Custos (CMV / CPV / CSP)', value: -cmv, pct: pct(-cmv), children: kids('cmv', -1) },
            { key: 'lb', kind: 'subtotal', label: '= Lucro Bruto', value: lucroBruto, pct: pct(lucroBruto) },
            { key: 'dv', kind: 'group', label: '(-) Despesas com Vendas', value: -dVendas, pct: pct(-dVendas), children: kids('desp_vendas', -1) },
            { key: 'dp', kind: 'group', label: '(-) Despesas com Pessoal', value: -dPessoal, pct: pct(-dPessoal), children: kids('desp_pessoal', -1) },
            { key: 'da', kind: 'group', label: '(-) Despesas Administrativas', value: -dAdmin, pct: pct(-dAdmin), children: kids('desp_admin', -1) },
            { key: 'dg', kind: 'group', label: '(-) Despesas Gerais e Operacionais', value: -dGerais, pct: pct(-dGerais), children: kids('desp_gerais', -1) },
        ];
        if (outrasRecOp) lines.push({ key: 'oro', kind: 'group', label: '(+) Outras Receitas Operacionais', value: outrasRecOp, pct: pct(outrasRecOp), children: kids('outras_receitas_op') });
        lines.push({ key: 'ebit', kind: 'subtotal', label: '= Resultado Operacional (EBIT)', value: resultadoOperacional, pct: pct(resultadoOperacional) });
        lines.push({
            key: 'rf', kind: 'group', label: '(+/-) Resultado Financeiro', value: resultadoFinanceiro, pct: pct(resultadoFinanceiro),
            children: [...kids('receita_financeira'), ...kids('despesa_financeira', -1)],
        });
        lines.push({ key: 'rat', kind: 'subtotal', label: '= Resultado Antes dos Tributos', value: resultadoAntesTributos, pct: pct(resultadoAntesTributos) });
        if (recNaoOp || despNaoOp) lines.push({
            key: 'rno', kind: 'group', label: '(+/-) Outras Receitas e Despesas Não Operacionais', value: resultadoNaoOperacional, pct: pct(resultadoNaoOperacional),
            children: [...kids('receita_nao_op'), ...kids('despesa_nao_op', -1)],
        });
        if (irpjCsll) lines.push({ key: 'ir', kind: 'group', label: '(-) IRPJ e CSLL', value: -irpjCsll, pct: pct(-irpjCsll), children: kids('irpj_csll', -1) });
        lines.push({ key: 'll', kind: 'total', label: '= Lucro / Prejuízo Líquido do Exercício', value: lucroLiquido, pct: pct(lucroLiquido) });

        res.json({
            meta: { regime: 'caixa', baseAV: 'Receita Operacional Líquida', ano: y, mes: m !== null ? m + 1 : null },
            indicadores: {
                receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto,
                margemBrutaPct: receitaLiquida ? (lucroBruto / receitaLiquida) * 100 : 0,
                despesasOperacionais, outrasReceitasOperacionais: outrasRecOp,
                resultadoOperacional, margemOperacionalPct: receitaLiquida ? (resultadoOperacional / receitaLiquida) * 100 : 0,
                resultadoFinanceiro, resultadoAntesTributos, resultadoNaoOperacional, irpjCsll,
                lucroLiquido, margemLiquidaPct: receitaLiquida ? (lucroLiquido / receitaLiquida) * 100 : 0,
            },
            lines,
        });
    } catch (err) {
        console.error('DRE Report Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/analysis', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const userId = req.userId;

    const targetYear = y;
    const targetMonth = m !== null ? m + 1 : null;
    const prevYear = targetMonth ? (targetMonth === 1 ? y - 1 : y) : y - 1;
    const prevMonth = targetMonth ? (targetMonth === 1 ? 12 : targetMonth - 1) : null;

    let q = `SELECT t.type, t.value, t.date,
                    c.name AS category_name, c.group_type, c.behavior_type
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND (`;
    const params = [userId];
    if (targetMonth !== null) {
        q += `(EXTRACT(YEAR FROM t.date::date) = $2 AND EXTRACT(MONTH FROM t.date::date) = $3)
              OR (EXTRACT(YEAR FROM t.date::date) = $4 AND EXTRACT(MONTH FROM t.date::date) = $5))`;
        params.push(targetYear, targetMonth, prevYear, prevMonth);
    } else {
        q += `EXTRACT(YEAR FROM t.date::date) = $2 OR EXTRACT(YEAR FROM t.date::date) = $3)`;
        params.push(targetYear, prevYear);
    }

    try {
        const { rows } = await pool.query(q, params);
        const inPeriod = (r, yy, mm) => {
            const d = new Date((r.date || '').slice(0, 10) + 'T00:00:00Z');
            if (isNaN(d)) return false;
            return d.getUTCFullYear() === yy && (mm === null || d.getUTCMonth() + 1 === mm);
        };
        const cur = computeDre(rows.filter(r => inPeriod(r, targetYear, targetMonth)));
        const prev = computeDre(rows.filter(r => inPeriod(r, prevYear, prevMonth)));

        // Análise vertical (% da Receita Líquida)
        const baseAV = cur.receitaLiquida > 0 ? cur.receitaLiquida : 1;
        const av = [
            ['Receita Operacional Bruta', cur.receitaBruta],
            ['(-) Deduções sobre Vendas', -cur.deducoes],
            ['= Receita Operacional Líquida', cur.receitaLiquida],
            ['(-) Custos (CMV/CPV/CSP)', -cur.cmv],
            ['= Lucro Bruto', cur.lucroBruto],
            ['(-) Despesas com Vendas', -cur.despVendas],
            ['(-) Despesas com Pessoal', -cur.despPessoal],
            ['(-) Despesas Administrativas', -cur.despAdmin],
            ['(-) Despesas Gerais', -cur.despGerais],
            ['(+/-) Resultado Financeiro', cur.resultadoFinanceiro],
            ['= Resultado Operacional', cur.resultadoOperacional],
            ['= Lucro Líquido', cur.lucroLiquido],
        ].map(([label, valor]) => ({ label, valor, pct: (valor / baseAV) * 100 }));

        // Análise horizontal (período atual x anterior)
        const ah = [
            ['Receita Bruta', cur.receitaBruta, prev.receitaBruta],
            ['Receita Líquida', cur.receitaLiquida, prev.receitaLiquida],
            ['Lucro Bruto', cur.lucroBruto, prev.lucroBruto],
            ['Despesas Operacionais', cur.despesasOperacionais, prev.despesasOperacionais],
            ['Resultado Operacional', cur.resultadoOperacional, prev.resultadoOperacional],
            ['Lucro Líquido', cur.lucroLiquido, prev.lucroLiquido],
        ].map(([label, atual, anterior]) => ({
            label, atual, anterior,
            varAbs: atual - anterior,
            varPct: anterior !== 0 ? ((atual - anterior) / Math.abs(anterior)) * 100 : null,
        }));

        // Composição das despesas operacionais
        const composicaoDespesas = [
            ['Custos (CMV/CPV/CSP)', cur.cmv],
            ['Despesas com Vendas', cur.despVendas],
            ['Despesas com Pessoal', cur.despPessoal],
            ['Despesas Administrativas', cur.despAdmin],
            ['Despesas Gerais', cur.despGerais],
        ].filter(([, v]) => v > 0);
        const totalComp = composicaoDespesas.reduce((s, [, v]) => s + v, 0) || 1;

        // Curva ABC (Pareto) por categoria
        const pareto = (obj) => {
            const total = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
            let acc = 0;
            return Object.entries(obj)
                .map(([nome, valor]) => ({ nome, valor, impacto: (valor / total) * 100 }))
                .sort((a, b) => b.valor - a.valor)
                .map(i => { acc += i.impacto; return { ...i, acumulado: acc }; });
        };
        const paretoDespesas = pareto(cur.catDespesa);
        const paretoReceitas = pareto(cur.catReceita);

        // MoM
        const momReceita = prev.receitaLiquida > 0
            ? ((cur.receitaLiquida - prev.receitaLiquida) / prev.receitaLiquida) * 100 : null;
        const momDespesa = prev.despesasOperacionais > 0
            ? ((cur.despesasOperacionais - prev.despesasOperacionais) / prev.despesasOperacionais) * 100 : null;

        const pctDespesasReceita = cur.receitaLiquida > 0
            ? ((cur.cmv + cur.despesasOperacionais + cur.despesasFinanceiras) / cur.receitaLiquida) * 100 : 0;

        // Score financeiro (0–100)
        let score = 100;
        const hasData = cur.receitaBruta > 0 || cur.saidasCaixa > 0;
        if (!hasData) score = 0;
        else {
            if (cur.margemLiquidaPct < 0) score -= 25;
            else if (cur.margemLiquidaPct < 5) score -= 10;
            if (cur.resultadoOperacional < 0) score -= 20;
            if (cur.receitaLiquida > 0 && cur.margemContribuicaoPct < 25) score -= 15;
            if (cur.margemContribuicaoPct > 0 && cur.custosDespFixas > cur.margemContribuicao) score -= 20;
            if (cur.receitaLiquida > 0 && cur.despesasFinanceiras > cur.receitaLiquida * 0.05) score -= 10;
            if (pctDespesasReceita > 90) score -= 10;
        }
        score = Math.max(0, Math.min(100, score));

        // Insights
        const insights = [];
        const p1 = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
        if (cur.lucroLiquido < 0) insights.push({ type: 'alerta', message: `Prejuízo de R$ ${Math.abs(cur.lucroLiquido).toFixed(2)} no período. Margem líquida de ${cur.margemLiquidaPct.toFixed(1)}%.` });
        if (cur.resultadoOperacional < 0) insights.push({ type: 'alerta', message: 'A operação em si (antes de juros e impostos) está no vermelho — o problema não é financeiro, é operacional.' });
        if (cur.margemContribuicaoPct > 0 && cur.margemContribuicaoPct < 25 && cur.receitaLiquida > 0) insights.push({ type: 'alerta', message: `Margem de contribuição de ${cur.margemContribuicaoPct.toFixed(1)}%: cada venda deixa pouco para cobrir os custos fixos.` });
        if (cur.pontoEquilibrio && cur.receitaLiquida > 0 && cur.receitaLiquida < cur.pontoEquilibrio) insights.push({ type: 'alerta', message: `Faturamento abaixo do ponto de equilíbrio (R$ ${cur.pontoEquilibrio.toFixed(2)}). Faltam R$ ${(cur.pontoEquilibrio - cur.receitaLiquida).toFixed(2)} de receita para empatar.` });
        else if (cur.margemSegurancaPct !== null && cur.margemSegurancaPct > 0) insights.push({ type: 'insight', message: `Margem de segurança de ${cur.margemSegurancaPct.toFixed(1)}%: a receita pode cair até esse ponto antes de dar prejuízo.` });
        if (cur.receitaLiquida > 0 && cur.despesasFinanceiras > cur.receitaLiquida * 0.08) insights.push({ type: 'recomendacao', message: 'Despesas financeiras acima de 8% da receita líquida. Vale renegociar dívidas, taxas de maquininha e tarifas.' });
        if (cur.pctCustoFixo > 65 && cur.custosDespFixas > 0) insights.push({ type: 'recomendacao', message: `${cur.pctCustoFixo.toFixed(0)}% dos custos são fixos. Estrutura pesada: uma queda de receita derruba o resultado rápido.` });
        if (momReceita !== null && momReceita < -10) insights.push({ type: 'alerta', message: `Receita líquida caiu ${p1(momReceita)} vs. período anterior.` });
        else if (momReceita !== null && momReceita > 10) insights.push({ type: 'insight', message: `Receita líquida cresceu ${p1(momReceita)} vs. período anterior.` });
        if (momDespesa !== null && momReceita !== null && momDespesa > momReceita + 10) insights.push({ type: 'alerta', message: `Despesas subindo (${p1(momDespesa)}) mais rápido que a receita (${p1(momReceita)}).` });
        if (cur.lucroLiquido > 0 && cur.geracaoCaixa < 0) insights.push({ type: 'alerta', message: 'DRE com lucro mas caixa negativo no período — dinheiro saiu para investimentos, empréstimos ou retiradas.' });
        if (cur.lucroLiquido < 0 && cur.geracaoCaixa > 0) insights.push({ type: 'insight', message: 'Caixa positivo apesar do prejuízo contábil — provavelmente entrou aporte ou empréstimo. Cuidado ao confundir com lucro.' });

        // Resumo executivo
        const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const resumo = [];
        if (cur.receitaBruta > 0) {
            resumo.push(`Receita líquida de ${fmt(cur.receitaLiquida)}${momReceita !== null ? ` (${p1(momReceita)} vs. período anterior)` : ''}.`);
            resumo.push(`Lucro bruto de ${fmt(cur.lucroBruto)} (${cur.margemBrutaPct.toFixed(1)}%) e resultado operacional de ${fmt(cur.resultadoOperacional)} (${cur.margemOperacionalPct.toFixed(1)}%).`);
            resumo.push(cur.lucroLiquido >= 0
                ? `A operação fechou com lucro líquido de ${fmt(cur.lucroLiquido)} — margem de ${cur.margemLiquidaPct.toFixed(1)}%.`
                : `A operação fechou com prejuízo de ${fmt(Math.abs(cur.lucroLiquido))}.`);
            if (cur.pontoEquilibrio) resumo.push(`Ponto de equilíbrio no período: ${fmt(cur.pontoEquilibrio)} de receita líquida.`);
        } else {
            resumo.push('Sem receita registrada no período — cadastre os lançamentos para gerar a análise gerencial.');
        }

        // Projeção linear (ritmo do mês)
        let projecao = null;
        const hoje = new Date();
        if (targetMonth && hoje.getFullYear() === targetYear && hoje.getMonth() + 1 === targetMonth) {
            const diaAtual = Math.max(1, hoje.getDate());
            const diasNoMes = new Date(targetYear, targetMonth, 0).getDate();
            if (diaAtual < diasNoMes) {
                const f = diasNoMes / diaAtual;
                projecao = {
                    receitaLiquida: cur.receitaLiquida * f,
                    despesas: (cur.cmv + cur.despesasOperacionais) * f,
                    resultadoOperacional: cur.resultadoOperacional * f,
                    lucroLiquido: cur.lucroLiquido * f,
                    diaAtual, diasNoMes,
                };
            }
        }

        res.json({
            periodo: { ano: targetYear, mes: targetMonth },
            dre: cur,
            kpis: {
                margemBrutaPct: cur.margemBrutaPct,
                margemOperacionalPct: cur.margemOperacionalPct,
                margemLiquidaPct: cur.margemLiquidaPct,
                margemContribuicaoPct: cur.margemContribuicaoPct,
                pontoEquilibrio: cur.pontoEquilibrio,
                margemSegurancaPct: cur.margemSegurancaPct,
                grauAlavancagem: cur.grauAlavancagem,
                ticketMedio: cur.ticketMedio,
                pctCustoFixo: cur.pctCustoFixo,
                pctDespesasReceita,
                financialHealthScore: score,
            },
            advanced: {
                verticalAnalysis: av,
                horizontalAnalysis: ah,
                composicaoDespesas: composicaoDespesas.map(([label, value]) => ({ label, value, pct: (value / totalComp) * 100 })),
                paretoDespesas: paretoDespesas.slice(0, 10),
                paretoReceitas: paretoReceitas.slice(0, 10),
                fixoVariavel: { fixo: cur.custosDespFixas, variavel: cur.custosDespVariaveis },
                geracaoCaixa: cur.geracaoCaixa,
                lucroLiquidoVal: cur.lucroLiquido,
                resultadoOperacional: cur.resultadoOperacional,
                momReceita, momDespesa,
                insights,
                resumoExecutivo: resumo.join(' '),
                projecao,
            },
        });
    } catch (err) {
        console.error('Analysis Report Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});

// Ciclo Financeiro — PMR, PMP, PME, Ciclo Operacional, CCC, NCG, Capital de
// Giro, Saldo em Tesouraria. Ver src/server/lib/financialCycle.js.
app.get('/api/reports/financial-cycle', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const month = m !== null ? m : new Date().getMonth();
    const allowed = [6, 12, 24, 36];
    const months = allowed.includes(parseInt(req.query.months, 10)) ? parseInt(req.query.months, 10) : 12;
    try {
        const data = await computeFinancialCycle({ pool, userId: req.userId, year: y, month, months });
        res.json(data);
    } catch (err) {
        console.error('Financial Cycle Error:', err.stack);
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/reports/forecasts', authenticateToken, async (req, res) => {
    const p = parsePeriod(req.query);
    if (p.bad) return res.status(400).json({ error: p.bad });
    const { y, m } = p;
    const userId = req.userId;

    let query = `SELECT f.*, c.name as category_name FROM forecasts f LEFT JOIN categories c ON f.category_id = c.id WHERE f.user_id = $1 AND EXTRACT(YEAR FROM f.date::date) = $2`;
    const params = [userId, y];
    if (m !== null) { 
        query += ` AND EXTRACT(MONTH FROM f.date::date) = $3`; 
        params.push(m + 1); 
    }

    try {
        const { rows } = await pool.query(query, params);
        let summary = { predictedIncome: 0, predictedExpense: 0, realizedIncome: 0, realizedExpense: 0, pendingIncome: 0, pendingExpense: 0 };
        const items = rows.map(r => {
            const val = Number(r.value);
            const isCredit = r.type === 'credito';
            if (isCredit) summary.predictedIncome += val; else summary.predictedExpense += val;
            if (r.realized) {
                if (isCredit) summary.realizedIncome += val; else summary.realizedExpense += val;
            } else {
                if (isCredit) summary.pendingIncome += val; else summary.pendingExpense += val;
            }
            return { ...r, realized: !!r.realized };
        });
        res.json({ summary, items });
    } catch(err) {
        console.error("Forecasts Report Error:", err.stack);
        res.status(500).json({ error: err.message });
    }
});
}
