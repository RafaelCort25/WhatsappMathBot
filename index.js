const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
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

// Set para controlar mensajes duplicados
const processedMessages = new Set();
const messageTimestamps = new Map();
const DEBOUNCE_TIME = 2000; // 2 segundos de debounce

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
        console.log('Procesando mensaje:', message);
        const escapedMessage = message.replace(/(['"])/g, '\\$1');
        const command = `python summarize.py process "${escapedMessage}"`;
        console.log('Ejecutando comando:', command);

        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error procesando mensaje:', error);
                console.error('stderr:', stderr);
                reject('Lo siento, ocurrió un error al procesar tu mensaje.');
                return;
            }
            if (stderr) {
                console.error('Error en stderr:', stderr);
            }
            console.log('Respuesta del procesamiento:', stdout);
            resolve(stdout.trim());
        });
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
        console.log('Mensaje guardado en Google Sheets');
    } catch (error) {
        console.error('Error guardando en Google Sheets:', error);
    }
}

// Verificar si un mensaje es duplicado usando debounce
function isDuplicate(messageId, currentTime) {
    const lastProcessed = messageTimestamps.get(messageId);
    if (lastProcessed && (currentTime - lastProcessed) < DEBOUNCE_TIME) {
        console.log(`Mensaje ${messageId} ignorado por debounce (${currentTime - lastProcessed}ms)`);
        return true;
    }
    messageTimestamps.set(messageId, currentTime);
    return false;
}

// Función principal del bot
async function startBot() {
    try {
        console.log('Iniciando bot de WhatsApp...');
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            defaultQueryTimeoutMs: undefined,
            // Configuración adicional para evitar duplicados
            shouldIgnoreJid: jid => jid === 'status@broadcast',
            retryRequestDelayMs: 2000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('Por favor escanea este código QR con WhatsApp:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada. Reconectar:', shouldReconnect);
                if (shouldReconnect) {
                    console.log('Reconectando en 5 segundos...');
                    setTimeout(() => {
                        console.log('Iniciando reconexión...');
                        startBot();
                    }, 5000);
                } else {
                    console.log('Sesión cerrada. El bot se detendrá.');
                    process.exit(0);
                }
            } else if (connection === 'open') {
                console.log('Bot conectado correctamente a WhatsApp');
                processedMessages.clear();
                messageTimestamps.clear();
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                // Solo procesar mensajes nuevos
                if (type !== 'notify') {
                    console.log('Ignorando evento que no es notify:', type);
                    return;
                }

                const m = messages[0];
                if (!m.message || m.key.remoteJid === 'status@broadcast') {
                    console.log('Mensaje ignorado: broadcast o vacío');
                    return;
                }

                // Verificar si el mensaje es del bot
                if (m.key.fromMe) {
                    console.log('Mensaje ignorado: mensaje propio');
                    return;
                }

                const messageId = m.key.id;
                const currentTime = Date.now();
                console.log('ID del mensaje recibido:', messageId);

                // Verificar duplicados usando debounce
                if (isDuplicate(messageId, currentTime)) {
                    return;
                }

                const sender = m.key.remoteJid;
                const messageText = m.message.conversation || 
                                  m.message.extendedTextMessage?.text || 
                                  '';

                if (!messageText.trim()) {
                    console.log('Mensaje ignorado: texto vacío');
                    return;
                }

                console.log(`Mensaje recibido de ${sender}: ${messageText}`);

                try {
                    // Procesar mensaje
                    console.log('Procesando mensaje...');
                    const response = await processMessage(messageText);
                    console.log('Respuesta generada:', response);

                    // Guardar conversación en SQLite
                    saveConversation(sender, messageText, response);
                    console.log('Conversación guardada en SQLite');

                    // Enviar respuesta
                    await sock.sendMessage(sender, { text: response });
                    console.log('Respuesta enviada exitosamente');

                    // Guardar en Google Sheets (no bloqueante)
                    saveToSheet(sender, messageText).catch(error => {
                        console.error('Error guardando en Google Sheets:', error);
                    });
                } catch (error) {
                    console.error('Error procesando mensaje:', error);
                    await sock.sendMessage(sender, { 
                        text: 'Lo siento, ocurrió un error al procesar tu mensaje.' 
                    });
                }

                // Limpiar caché de mensajes y timestamps antiguos
                const MAX_CACHE_SIZE = 1000;
                if (processedMessages.size > MAX_CACHE_SIZE) {
                    const entries = Array.from(processedMessages);
                    processedMessages.clear();
                    entries.slice(-MAX_CACHE_SIZE).forEach(id => processedMessages.add(id));
                }
                if (messageTimestamps.size > MAX_CACHE_SIZE) {
                    const oldEntries = Array.from(messageTimestamps.entries())
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, MAX_CACHE_SIZE);
                    messageTimestamps.clear();
                    oldEntries.forEach(([id, time]) => messageTimestamps.set(id, time));
                }
            } catch (error) {
                console.error('Error en el manejador de mensajes:', error);
            }
        });

        return sock;
    } catch (error) {
        console.error('Error iniciando el bot:', error);
        throw error;
    }
}

// Iniciar el bot
console.log('Iniciando proceso del bot...');
startBot().catch(error => {
    console.error('Error fatal iniciando el bot:', error);
    process.exit(1);
});