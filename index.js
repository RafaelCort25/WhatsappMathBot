const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');
const axios = require('axios');
const dotenv = require('dotenv');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { exec } = require('child_process');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Configuración
dotenv.config();
const SHEET_ID = process.env.SHEET_ID;
const doc = new GoogleSpreadsheet(SHEET_ID);
const db = new sqlite3.Database('conversations.db');

// Configurar base de datos
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        user_id TEXT,
        message TEXT,
        response TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Función para guardar conversación
function saveConversation(userId, message, response) {
    const stmt = db.prepare("INSERT INTO conversations (user_id, message, response) VALUES (?, ?, ?)");
    stmt.run([userId, message, response], (err) => {
        if (err) console.error('Error guardando conversación:', err);
    });
    stmt.finalize();
}

// Función para procesar mensajes
async function processMessage(message) {
    return new Promise((resolve, reject) => {
        // Escapar caracteres especiales en el mensaje
        const escapedMessage = message.replace(/(['"])/g, '\\$1');

        exec(`python summarize.py process "${escapedMessage}"`, 
            { encoding: 'utf8' },
            (error, stdout, stderr) => {
                if (error) {
                    console.error('Error procesando mensaje:', error);
                    reject('Lo siento, ocurrió un error al procesar tu mensaje.');
                    return;
                }
                // Asegurar que la respuesta esté en UTF-8
                let response = stdout.toString('utf8').trim();
                resolve(response);
            }
        );
    });
}

// Función para guardar en Google Sheets
async function saveToSheet(sender, message) {
    try {
        await doc.useServiceAccountAuth(require('./credentials.json'));
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow({
            Sender: sender,
            Message: message,
            Timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error guardando en Google Sheets:', error);
    }
}

// Función principal del bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconectando...');
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot conectado correctamente a WhatsApp.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.remoteJid === 'status@broadcast') return;

        const sender = m.key.remoteJid;
        const messageText = m.message.conversation || 
                          m.message.extendedTextMessage?.text || 
                          '';

        console.log(`Mensaje recibido de ${sender}: ${messageText}`);

        try {
            // Guardar mensaje en Google Sheets
            await saveToSheet(sender, messageText);
            console.log('Mensaje guardado en Google Sheets');

            // Procesar mensaje
            const response = await processMessage(messageText);
            console.log('Respuesta generada:', response);

            // Guardar conversación en SQLite
            saveConversation(sender, messageText, response);

            // Enviar respuesta
            await sock.sendMessage(sender, { 
                text: response 
            });

            console.log('Respuesta enviada exitosamente');
        } catch (error) {
            console.error('Error procesando mensaje:', error);
            await sock.sendMessage(sender, { 
                text: 'Lo siento, ocurrió un error al procesar tu mensaje.' 
            });
        }
    });
}

// Iniciar el bot
console.log('Iniciando bot...');
startBot().catch(console.error);