const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');
const axios = require('axios');
const dotenv = require('dotenv');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { exec } = require('child_process');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Configuración de variables de entorno
dotenv.config();

// API Keys
const SHEET_ID = process.env.SHEET_ID;

// Configuración de Google Sheets
const doc = new GoogleSpreadsheet(SHEET_ID);

// Configuración de la base de datos SQLite
const db = new sqlite3.Database('conversations.db');

// Set para controlar mensajes duplicados
const processedMessages = new Set();
const messageTimestamps = new Map();
const DEBOUNCE_TIME = 2000; // 2 segundos de debounce

// Crear tabla para almacenar conversaciones
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS conversations (user_id TEXT, message TEXT, response TEXT, timestamp DATETIME)");
});

// Función para guardar conversación
function saveConversation(userId, message, response) {
    const timestamp = new Date().toISOString();
    db.run("INSERT INTO conversations (user_id, message, response, timestamp) VALUES (?, ?, ?, ?)", [userId, message, response, timestamp]);
}

// Función para procesar mensajes
async function processMessage(message) {
    return new Promise((resolve, reject) => {
        console.log('Procesando mensaje:', message);
        // Escapar el mensaje para la línea de comandos
        const escapedMessage = message
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        const command = `python3 summarize.py process "${escapedMessage}"`;
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
            console.log('Respuesta del procesamiento:', stdout.trim());
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

// Función principal del bot
async function startBot() {
    try {
        console.log('Iniciando proceso del bot...');
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            defaultQueryTimeoutMs: undefined,
            // Configuración adicional para evitar duplicados
            shouldIgnoreJid: jid => jid === 'status@broadcast',
            retryRequestDelayMs: 2000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
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

                // Verificar duplicados y debounce
                const lastProcessed = messageTimestamps.get(messageId);
                if (lastProcessed && (currentTime - lastProcessed) < DEBOUNCE_TIME) {
                    console.log(`Mensaje duplicado detectado (debounce), ignorando. ID: ${messageId}`);
                    return;
                }

                if (processedMessages.has(messageId)) {
                    console.log(`Mensaje duplicado detectado (caché), ignorando. ID: ${messageId}`);
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

                // Marcar mensaje como procesado
                processedMessages.add(messageId);
                messageTimestamps.set(messageId, currentTime);
                console.log('Mensaje marcado como procesado. ID:', messageId);

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

                // Limpiar caché de mensajes antiguos
                if (processedMessages.size > 1000) {
                    const entries = Array.from(processedMessages);
                    processedMessages.clear();
                    entries.slice(-1000).forEach(id => processedMessages.add(id));
                }

                // Limpiar timestamps antiguos
                const now = Date.now();
                for (const [id, timestamp] of messageTimestamps.entries()) {
                    if (now - timestamp > DEBOUNCE_TIME * 10) { // Mantener solo los últimos 20 segundos
                        messageTimestamps.delete(id);
                    }
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