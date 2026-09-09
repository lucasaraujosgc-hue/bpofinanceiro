// Valida req.body contra um schema zod. Falha → 400 com a primeira mensagem
// legível; sucesso → req.body vira o valor parseado (coerções já aplicadas).
export function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body ?? {});
        if (!result.success) {
            const first = result.error.issues[0];
            const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
            return res.status(400).json({ error: `Dados inválidos — ${where}${first?.message || 'formato incorreto'}` });
        }
        req.body = result.data;
        next();
    };
}
