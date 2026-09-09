import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas de validação (um por endpoint de escrita). Filosofia:
//   - LENIENTES na forma (.loose() deixa passar chave extra que o handler ignora)
//   - RÍGIDOS nos campos perigosos: value (>=0, finito), type (enum),
//     date (AAAA-MM-DD, senão quebra ::date nos relatórios), email.
// Assim rejeitamos lixo sem quebrar telas que já funcionam.
// ---------------------------------------------------------------------------

// Valor monetário: número finito >= 0, teto são. Rejeita NaN, negativo, Infinity.
const money = z.coerce.number()
    .refine(Number.isFinite, 'valor inválido')
    .min(0, 'valor não pode ser negativo')
    .max(1e12, 'valor acima do limite');

// Idem, mas obrigatório: null/undefined/'' viram NaN e são rejeitados
// (um lançamento com value ausente entra como 0 e suja o relatório).
const requiredMoney = z.preprocess(
    (v) => (v === null || v === undefined || v === '' ? NaN : v),
    money,
);

// Data AAAA-MM-DD (sufixo de hora tolerado — o ::date do Postgres aceita).
// Valida também que é um dia real do calendário: '2026-13-99' passaria no
// regex mas quebra o `::date` dos relatórios com 500 (DoS auto-infligido).
const isoDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}([ T].*)?$/, 'data deve ser AAAA-MM-DD')
    .refine((s) => {
        const [y, m, d] = s.slice(0, 10).split('-').map(Number);
        if (m < 1 || m > 12 || d < 1 || d > 31) return false;
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }, 'data inexistente no calendário');

const txType = z.enum(['credito', 'debito']);

// FK opcional: aceita número, string numérica, 0, '', null, undefined →
// normaliza para inteiro positivo ou null (o handler faz `id || null`).
const idRef = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int('id inválido').nonnegative('id inválido').nullable(),
).transform((v) => (v && v > 0 ? v : null));

const dayOfMonth = z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(1).max(31).nullable(),
);

const description = z.string().trim().max(500).optional().default('');
const shortText = z.string().trim().max(200);
const email = z.string().trim().toLowerCase().pipe(z.email('e-mail inválido').max(255));

// bool que aceita 0/1/"true"/"false" além de boolean.
const boolish = z.preprocess((v) => {
    if (v === 1 || v === '1' || v === 'true' || v === true) return true;
    if (v === 0 || v === '0' || v === 'false' || v === false) return false;
    return v;
}, z.boolean().optional());

// --- auth ------------------------------------------------------------------

export const loginSchema = z.object({
    email: z.string().trim().max(255),
    password: z.string().max(200),
}).loose();

export const requestSignupSchema = z.object({
    email,
    cnpj: z.string().trim().max(25).optional(),
    razaoSocial: shortText.optional(),
    phone: z.string().trim().max(30).optional(),
    businessType: z.string().trim().max(20).optional(),
}).loose();

export const completeSignupSchema = z.object({
    token: z.string().min(10).max(200),
    password: z.string().min(8, 'a senha precisa de ao menos 8 caracteres').max(200),
}).loose();

export const recoverPasswordSchema = z.object({ email }).loose();

export const resetPasswordConfirmSchema = z.object({
    token: z.string().min(10).max(200),
    newPassword: z.string().min(8, 'a senha precisa de ao menos 8 caracteres').max(200),
}).loose();

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1).max(400),
}).loose();

export const logoutSchema = z.object({
    refreshToken: z.string().max(400).optional(),
}).loose();

// --- banks / cartões -----------------------------------------------------

export const bankCreateSchema = z.object({
    name: shortText.min(1, 'nome obrigatório'),
    accountNumber: z.string().trim().max(60).nullish(),
    nickname: z.string().trim().max(120).nullish(),
    logo: z.string().max(400).nullish(),
}).loose();

export const bankUpdateSchema = z.object({
    nickname: z.string().trim().max(120).nullish(),
    active: z.preprocess(
        (v) => (v === true ? 1 : v === false ? 0 : v === '' || v === null || v === undefined ? null : v),
        z.coerce.number().int().min(0).max(1).nullable(),
    ),
}).loose();

export const creditCardCreateSchema = z.object({
    bankId: idRef,
    name: shortText.min(1, 'nome obrigatório'),
    closingDay: dayOfMonth,
    dueDay: dayOfMonth,
    limitValue: money.nullish(),
}).loose();

export const creditCardUpdateSchema = z.object({
    name: shortText.min(1, 'nome obrigatório'),
    closingDay: dayOfMonth,
    dueDay: dayOfMonth,
    limitValue: money.nullish(),
}).loose();

// --- categorias --------------------------------------------------------

const categoryShape = {
    name: shortText.min(1, 'nome obrigatório'),
    type: z.enum(['receita', 'despesa']).optional(),
    groupType: z.string().trim().max(60).nullish(),
    mainGroup: z.string().trim().max(60).nullish(),
    subGroup: z.string().trim().max(60).nullish(),
    nature: z.string().trim().max(60).nullish(),
    affectsDre: boolish,
    affectsCashflow: boolish,
    affectsBalance: boolish,
    costClassification: z.string().trim().max(60).nullish(),
    behaviorType: z.string().trim().max(30).nullish(),
};
export const categoryCreateSchema = z.object(categoryShape).loose();
export const categoryUpdateSchema = z.object(categoryShape).loose();

// --- transações ------------------------------------------------------

export const transactionCreateSchema = z.object({
    date: isoDate,
    description,
    value: requiredMoney,
    type: txType,
    categoryId: idRef,
    bankId: idRef,
    creditCardId: idRef,
    reconciled: boolish,
    ofxImportId: idRef,
}).loose();

export const transactionUpdateSchema = z.object({
    date: isoDate,
    description,
    value: requiredMoney,
    type: txType,
    categoryId: idRef,
    bankId: idRef,
    creditCardId: idRef,
    reconciled: boolish,
}).loose();

export const transactionReconcileSchema = z.object({
    reconciled: boolish,
}).loose();

export const transactionBatchUpdateSchema = z.object({
    transactionIds: z.array(z.coerce.number().int().positive()).max(5000),
    categoryId: idRef,
}).loose();

// --- previsões -------------------------------------------------------

export const forecastCreateSchema = z.object({
    date: isoDate,
    description,
    value: requiredMoney,
    type: txType,
    categoryId: idRef,
    bankId: idRef,
    creditCardId: idRef,
    realized: boolish,
    installmentCurrent: z.coerce.number().int().min(0).max(1200).nullish(),
    installmentTotal: z.coerce.number().int().min(0).max(1200).nullish(),
    groupId: z.string().max(60).nullish(),
}).loose();

export const forecastUpdateSchema = z.object({
    date: isoDate,
    description,
    value: requiredMoney,
    type: txType,
    categoryId: idRef,
    bankId: idRef,
    creditCardId: idRef,
}).loose();

// --- OFX -------------------------------------------------------------

export const ofxImportCreateSchema = z.object({
    fileName: z.string().trim().max(255).nullish(),
    importDate: z.string().max(40).nullish(),
    bankId: idRef,
    transactionCount: z.coerce.number().int().min(0).max(100000).nullish(),
    content: z.string().max(5_000_000).nullish(),
}).loose();

// --- keyword rules --------------------------------------------------

export const keywordRuleCreateSchema = z.object({
    keyword: z.string().trim().min(1, 'palavra-chave obrigatória').max(120),
    type: txType,
    categoryId: idRef,
    bankId: idRef,
}).loose();

// --- integração NFe -----------------------------------------------

export const integrationSettingsSchema = z.object({
    token: z.string().max(400).nullish(),
    start_date: z.string().max(40).nullish(),
    target_type: z.enum(['transaction', 'forecast']).optional(),
    category_in_id: idRef,
    category_out_id: idRef,
    bank_in_id: idRef,
    bank_out_id: idRef,
}).loose();

// --- admin ---------------------------------------------------------

export const adminBlockSchema = z.object({
    blocked: boolish,
}).loose();

export const adminBankCreateSchema = z.object({
    name: shortText.min(1, 'nome obrigatório'),
    logoData: z.string().max(1_000_000).nullish(),
}).loose();

export const adminBankUpdateSchema = z.object({
    name: shortText.min(1, 'nome obrigatório'),
    logoData: z.string().max(1_000_000).nullish(),
}).loose();
