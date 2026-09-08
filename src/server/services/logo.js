import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import { fileURLToPath } from 'url';

// server.js roda na raiz do projeto; este módulo está em src/server/services/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_LOGO_DIR = path.join(__dirname, '..', '..', '..', 'logo');
if (!fs.existsSync(LOCAL_LOGO_DIR)) fs.mkdirSync(LOCAL_LOGO_DIR, { recursive: true });

export const PERSISTENT_LOGO_DIR = fs.existsSync('/backup') ? '/backup/logos' : './backup/logos';
if (!fs.existsSync(PERSISTENT_LOGO_DIR)) fs.mkdirSync(PERSISTENT_LOGO_DIR, { recursive: true });

// Grava um logo enviado como data URI. Só bitmap (SVG seria XSS armazenado),
// valida magic bytes, cap de 512 KB, nome 100% aleatório. Retorna /logo/<nome>
// ou null se inválido.
const LOGO_MAGIC = {
    png: [0x89, 0x50, 0x4e, 0x47],
    jpg: [0xff, 0xd8, 0xff],
    webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" (+ "WEBP" no offset 8)
};
export function saveBankLogo(logoData) {
    if (typeof logoData !== 'string') return null;
    const m = logoData.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return null;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    let buf;
    try { buf = Buffer.from(m[2], 'base64'); } catch { return null; }
    if (buf.length === 0 || buf.length > 512 * 1024) return null;
    const magic = LOGO_MAGIC[ext];
    if (!magic.every((b, i) => buf[i] === b)) return null;
    if (ext === 'webp' && buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const fileName = `bank_${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(PERSISTENT_LOGO_DIR, fileName), buf);
    return `/logo/${fileName}`;
}

// Serve os logos: primeiro o volume persistente, depois a pasta local do repo.
export function mountLogos(app) {
    app.use('/logo', (req, res, next) => {
        const persistentFile = path.join(PERSISTENT_LOGO_DIR, req.path);
        if (fs.existsSync(persistentFile)) return res.sendFile(persistentFile);
        next();
    });
    app.use('/logo', express.static(LOCAL_LOGO_DIR));
}
