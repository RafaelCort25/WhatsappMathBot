const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { evaluate } = require('mathjs');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

// Configuración de variables de entorno
dotenv.config();

// Configuración de la base de datos SQLite
const db = new sqlite3.Database('conversations.db');

// Set para controlar mensajes duplicados
const processedMessages = new Set();

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

// Función para procesar mensajes matemáticos
function processMathExpression(message) {
    try {
        // Extraer la expresión matemática
        const match = message.toLowerCase().match(/cu[aá]nto\s+es\s+(.*)/i);
        if (!match) return null;

        // Obtener y limpiar la expresión
        let expr = match[1].trim();
        expr = expr.replace(/[¿?!¡]/g, '').trim();

        // Validar que la expresión contenga solo números y operadores válidos
        if (!/^[\d\s+\-*/(). ]+$/.test(expr)) {
            return "Por favor, usa solo números y operadores básicos (+, -, *, /)";
        }

        // Limpiar espacios adicionales
        expr = expr.replace(/\s+/g, '');

        // Evaluar la expresión usando mathjs
        const result = evaluate(expr);

        // Formatear el resultado
        const formattedResult = typeof result === 'number' ? 
            Number.isInteger(result) ? result : parseFloat(result.toFixed(2)) :
            result.toString();

        return `El resultado de ${expr} es ${formattedResult}`;
    } catch (error) {
        console.error('Error procesando expresión matemática:', error);
        return "Lo siento, no pude resolver esa operación. Por favor, asegúrate de usar una expresión válida como '2+2' o '3*4'.";
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
            shouldIgnoreJid: jid => jid === 'status@broadcast'
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada. Reconectar:', shouldReconnect);
                if (shouldReconnect) {
                    console.log('Reconectando en 5 segundos...');
                    setTimeout(startBot, 5000);
                }
            } else if (connection === 'open') {
                console.log('Bot conectado correctamente a WhatsApp');
                processedMessages.clear();
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') {
                    console.log('Ignorando evento que no es notify:', type);
                    return;
                }

                const m = messages[0];
                if (!m.message || m.key.remoteJid === 'status@broadcast' || m.key.fromMe) {
                    console.log('Mensaje ignorado: broadcast, vacío o propio');
                    return;
                }

                const messageId = m.key.id;
                if (processedMessages.has(messageId)) {
                    console.log(`Mensaje duplicado detectado, ignorando. ID: ${messageId}`);
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
                processedMessages.add(messageId);

                try {
                    let response;
                    if (/cu[aá]nto\s+es/i.test(messageText)) {
                        console.log('Procesando operación matemática:', messageText);
                        response = processMathExpression(messageText);
                    } else {
                        const greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches'];
                        if (greetings.some(greeting => messageText.toLowerCase().includes(greeting))) {
                            response = "¡Hola! ¿En qué puedo ayudarte?";
                        } else {
                            response = `He recibido tu mensaje: '${messageText}'. ¿En qué puedo ayudarte?`;
                        }
                    }

                    // Guardar conversación
                    saveConversation(sender, messageText, response);
                    console.log('Conversación guardada en SQLite');

                    // Enviar respuesta
                    await sock.sendMessage(sender, { text: response });
                    console.log('Respuesta enviada:', response);

                } catch (error) {
                    console.error('Error procesando mensaje:', error);
                    await sock.sendMessage(sender, { 
                        text: 'Lo siento, ocurrió un error al procesar tu mensaje.' 
                    });
                }

                // Limpiar mensajes antiguos del Set (mantener últimos 1000)
                if (processedMessages.size > 1000) {
                    const entries = Array.from(processedMessages);
                    processedMessages.clear();
                    entries.slice(-1000).forEach(id => processedMessages.add(id));
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