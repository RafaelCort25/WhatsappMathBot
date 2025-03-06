const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { google } = require('googleapis');
const axios = require('axios');
const dotenv = require('dotenv');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./credentials.json');
const { exec } = require('child_process');
const fs = require('fs');
const gtts = require('gtts');
const sqlite3 = require('sqlite3').verbose();

// Configuración de variables de entorno
dotenv.config();

// API Keys
const SHEET_ID = process.env.SHEET_ID;

// Configuración de Google Sheets
const doc = new GoogleSpreadsheet(SHEET_ID);

// Configuración de la base de datos SQLite
const db = new sqlite3.Database('conversations.db');

// Crear tabla para almacenar conversaciones
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS conversations (user_id TEXT, message TEXT, response TEXT, timestamp DATETIME)");
});

// Función para guardar conversación
function saveConversation(userId, message, response) {
    const timestamp = new Date().toISOString();
    db.run("INSERT INTO conversations (user_id, message, response, timestamp) VALUES (?, ?, ?, ?)", [userId, message, response, timestamp]);
}

// Función para obtener historial de conversación
function getConversationHistory(userId, callback) {
    db.all("SELECT message, response FROM conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5", [userId], (err, rows) => {
        if (err) {
            console.error('Error al obtener historial:', err);
            callback([]);
        } else {
            callback(rows.reverse()); // Ordenar de más antiguo a más reciente
        }
    });
}

// Función para acceder a Google Services
async function accessGoogleServices() {
    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.send',
        ],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const calendar = google.calendar({ version: 'v3', auth: client });
    const gmail = google.gmail({ version: 'v1', auth: client });

    return { sheets, calendar, gmail, client };
}

// Función para guardar mensajes en Google Sheets
async function saveToSheet(sender, message) {
    try {
        const { sheets } = await accessGoogleServices();
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Bot!A:C',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [sender, message, new Date().toISOString()],
                ],
            },
        });
        console.log('✅ Datos guardados en Google Sheets.');
    } catch (error) {
        console.error('❌ Error al guardar en Google Sheets:', error);
    }
}

// Función para procesar mensajes con modelo local
async function processMessageLocal(message) {
    return new Promise((resolve, reject) => {
        // Escapar el mensaje correctamente
        const escapedMessage = message.replace(/'/g, "\\'"); // Escapar comillas simples
        const command = `python -c "from summarize import processMessageLocal; print(processMessageLocal('${escapedMessage}'))"`;

        // Ejecutar el script de Python
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en processMessageLocal:', stderr);
                reject('Lo siento, hubo un error procesando tu mensaje.');
            } else {
                resolve(`📝 **Respuesta:**\n${stdout.trim()}`);
            }
        });
    });
}

// Función para transcribir audio con Vosk
async function transcribeAudio(audioUrl) {
    return new Promise((resolve, reject) => {
        exec(`python summarize.py transcribe "${audioUrl}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en transcribeAudio:', stderr);
                reject('Lo siento, hubo un error transcribiendo el audio.');
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// Función para generar audio con gTTS
async function generateSpeech(text) {
    return new Promise((resolve, reject) => {
        const tts = new gtts(text, 'es');
        const filePath = 'output.mp3';
        tts.save(filePath, (err) => {
            if (err) {
                console.error('Error en generateSpeech:', err);
                reject('Lo siento, hubo un error generando el audio.');
            } else {
                resolve(filePath);
            }
        });
    });
}

// Función para manejar mensajes de voz
async function handleVoiceMessage(userId, audioUrl) {
    try {
        const transcribedText = await transcribeAudio(audioUrl);
        const responseText = await processMessageLocal(transcribedText);
        const audioResponse = await generateSpeech(responseText);
        return audioResponse; // Devuelve la ruta del archivo de audio
    } catch (error) {
        console.error('Error en handleVoiceMessage:', error);
        throw error;
    }
}

// Función principal para iniciar el bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconectando...');
                startBot();
            } else {
                console.log('❌ Bot cerrado.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot conectado correctamente a WhatsApp.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.remoteJid === 'status@broadcast') return; // Ignorar mensajes de estado

        const sender = m.key.remoteJid;
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        if (m.key.fromMe || sender === botNumber) return; // Evita responder a sus propios mensajes

        const messageText = m.message.conversation || m.message.extendedTextMessage?.text;
        console.log(`📩 Mensaje recibido de ${sender}: ${messageText}`);

        try {
            await saveToSheet(sender, messageText);
            console.log('✅ Datos guardados en Google Sheets.');
        } catch (error) {
            console.error('❌ Error al guardar en Google Sheets:', error);
        }

        let response;
        try {
            // Procesar mensajes de texto
            if (messageText) {
                response = await processMessageLocal(messageText);
            }
            // Procesar mensajes de audio
            else if (m.message.audioMessage) {
                const audioUrl = await sock.downloadMediaMessage(m);
                const audioResponse = await handleVoiceMessage(sender, audioUrl);
                await sock.sendMessage(sender, { audio: { url: audioResponse } });
                return;
            }
        } catch (error) {
            console.error('Error procesando el mensaje:', error);
            response = 'Lo siento, hubo un error procesando tu mensaje.';
        }

        // Dividir la respuesta si es demasiado larga
        const maxLength = 200; // Longitud máxima por mensaje
        if (response && response.length > maxLength) {
            const parts = response.match(new RegExp(`.{1,${maxLength}}`, 'g'));
            for (const part of parts) {
                await sock.sendMessage(sender, { text: part });
            }
        } else if (response) {
            await sock.sendMessage(sender, { text: response });
        }
        console.log(`✅ Respuesta enviada: ${response}`);
    });
}

// Iniciar el bot
startBot();