const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

// Configuración de logging mejorado
function log(message, data = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data) : '');
}

// Configuración de variables de entorno
dotenv.config();

// Configuración de la base de datos SQLite
const db = new sqlite3.Database('conversations.db');

// Control de mensajes procesados
const processedMessages = new Map(); // messageId -> { timestamp, processingCount }
const MESSAGE_TIMEOUT = 5000; // 5 segundos
const MAX_PROCESSING_ATTEMPTS = 2;

// Crear tabla para almacenar conversaciones
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS conversations (user_id TEXT, message TEXT, response TEXT, timestamp DATETIME)");
});

// Función para guardar conversación
function saveConversation(userId, message, response) {
    const timestamp = new Date().toISOString();
    db.run("INSERT INTO conversations (user_id, message, response, timestamp) VALUES (?, ?, ?, ?)", 
        [userId, message, response, timestamp]);
}

// Función para evaluar expresiones matemáticas simples
function evaluarOperacionMatematica(expresion) {
    try {
        log('Evaluando expresión matemática:', expresion);

        // Extraer la parte matemática
        const match = expresion.toLowerCase().match(/cu[aá]nto\s+es\s+(.*)/i);
        if (!match) {
            log('No se encontró patrón "cuánto es"');
            return null;
        }

        let expr = match[1].trim();
        log('Expresión extraída:', expr);

        // Limpiar y validar la expresión
        expr = expr.replace(/[^0-9+\-*/()\s.]/g, '').trim();
        expr = expr.replace(/\s+/g, '');
        log('Expresión limpia:', expr);

        if (!/^[\d+\-*/(). ]+$/.test(expr)) {
            log('Expresión contiene caracteres no permitidos');
            return "Por favor, usa solo números y operadores básicos (+, -, *, /)";
        }

        // Evaluar usando Function para mayor seguridad
        const resultado = Function('"use strict";return (' + expr + ')')();
        log('Resultado calculado:', resultado);

        if (typeof resultado !== 'number' || isNaN(resultado)) {
            throw new Error('Resultado inválido');
        }

        // Formatear el resultado
        const resultadoFormateado = Number.isInteger(resultado) ? 
            resultado : 
            parseFloat(resultado.toFixed(2));

        const respuesta = `El resultado de ${expr} es ${resultadoFormateado}`;
        log('Respuesta final:', respuesta);
        return respuesta;

    } catch (error) {
        log('Error evaluando expresión:', error.message);
        return "Lo siento, no pude resolver esa operación. Por favor, verifica que sea una expresión válida (ejemplo: 2+2 o 3*4)";
    }
}

// Función para verificar si un mensaje puede ser procesado
function canProcessMessage(messageId) {
    const now = Date.now();
    const messageInfo = processedMessages.get(messageId);

    if (!messageInfo) {
        // Primer intento de procesar el mensaje
        processedMessages.set(messageId, { timestamp: now, processingCount: 1 });
        return true;
    }

    // Verificar si el mensaje es muy antiguo
    if (now - messageInfo.timestamp > MESSAGE_TIMEOUT) {
        processedMessages.delete(messageId);
        processedMessages.set(messageId, { timestamp: now, processingCount: 1 });
        return true;
    }

    // Verificar si se ha excedido el número máximo de intentos
    if (messageInfo.processingCount >= MAX_PROCESSING_ATTEMPTS) {
        log('Mensaje excedió máximo de intentos:', messageId);
        return false;
    }

    // Incrementar contador de intentos
    messageInfo.processingCount += 1;
    return true;
}

// Función para limpiar mensajes antiguos
function cleanupOldMessages() {
    const now = Date.now();
    for (const [id, info] of processedMessages.entries()) {
        if (now - info.timestamp > MESSAGE_TIMEOUT) {
            processedMessages.delete(id);
        }
    }
}

// Función principal para iniciar el bot
async function startBot() {
    try {
        log('Iniciando bot...');
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            defaultQueryTimeoutMs: undefined,
            shouldIgnoreJid: jid => jid === 'status@broadcast'
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                log('Conexión cerrada. Reconectar:', shouldReconnect);
                if (shouldReconnect) {
                    log('Reconectando en 5 segundos...');
                    setTimeout(startBot, 5000);
                }
            } else if (connection === 'open') {
                log('Bot conectado correctamente a WhatsApp');
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                log('Tipo de evento recibido:', type);
                if (type !== 'notify') {
                    log('Ignorando evento que no es notify:', type);
                    return;
                }

                const m = messages[0];
                if (!m.message || m.key.remoteJid === 'status@broadcast' || m.key.fromMe) {
                    log('Mensaje ignorado: broadcast, vacío o propio');
                    return;
                }

                const messageId = m.key.id;
                const sender = m.key.remoteJid;
                const messageText = m.message.conversation || 
                                  m.message.extendedTextMessage?.text || 
                                  '';

                if (!messageText.trim()) {
                    log('Mensaje ignorado: texto vacío');
                    return;
                }

                // Verificar si el mensaje puede ser procesado
                if (!canProcessMessage(messageId)) {
                    log('Mensaje no puede ser procesado:', messageId);
                    return;
                }

                log('Procesando mensaje:', { id: messageId, sender, text: messageText });

                try {
                    let response;
                    if (/cu[aá]nto\s+es/i.test(messageText)) {
                        log('Detectada operación matemática');
                        response = evaluarOperacionMatematica(messageText);
                    } else {
                        const greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches'];
                        if (greetings.some(greeting => messageText.toLowerCase().includes(greeting))) {
                            response = "¡Hola! ¿En qué puedo ayudarte?";
                        } else {
                            response = `He recibido tu mensaje: '${messageText}'. ¿En qué puedo ayudarte?`;
                        }
                    }

                    // Guardar la conversación
                    saveConversation(sender, messageText, response);
                    log('Conversación guardada para:', sender);

                    // Enviar respuesta
                    await sock.sendMessage(sender, { text: response });
                    log('Respuesta enviada:', response);

                } catch (error) {
                    log('Error procesando mensaje:', error.message);
                    await sock.sendMessage(sender, { 
                        text: 'Lo siento, hubo un error procesando tu mensaje.' 
                    });
                }

                // Limpiar mensajes antiguos periódicamente
                cleanupOldMessages();

            } catch (error) {
                log('Error en el manejador de mensajes:', error.message);
            }
        });

        return sock;
    } catch (error) {
        log('Error iniciando el bot:', error.message);
        throw error;
    }
}

// Iniciar el bot
log('Iniciando proceso del bot...');
startBot().catch(error => {
    log('Error fatal iniciando el bot:', error.message);
    process.exit(1);
});