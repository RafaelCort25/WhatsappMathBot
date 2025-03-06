const { HfInference } = require('@huggingface/inference');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

// Inicializar el cliente de Hugging Face
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Base de datos para el feedback y el aprendizaje
const db = new sqlite3.Database('conversations.db');

// Crear tablas necesarias
db.serialize(() => {
    // Tabla para el historial de conversaciones con feedback
    db.run(`CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        message TEXT,
        response TEXT,
        feedback INTEGER,
        context TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Función para procesar texto con IA y contexto
async function processWithAI(text, userId = null, context = null) {
    try {
        console.log('Procesando mensaje con IA:', { text, userId, context });

        // Preparar el prompt con contexto si existe
        let prompt = text;
        if (context) {
            prompt = `Contexto previo: ${context}\n\nMensaje actual: ${text}`;
        }

        // Procesar con el modelo de Hugging Face
        const response = await hf.textGeneration({
            model: 'deepseek-ai/deepseek-coder-6.7b-instruct',
            inputs: prompt,
            parameters: {
                max_length: 500,
                temperature: 0.7,
                top_p: 0.95,
                repetition_penalty: 1.2
            }
        });

        const aiResponse = response.generated_text;
        console.log('Respuesta generada:', aiResponse);

        // Guardar en el historial si tenemos un userId
        if (userId) {
            await saveConversation(userId, text, aiResponse, context);
        }

        return aiResponse;
    } catch (error) {
        console.error('Error en processWithAI:', error);
        return "Lo siento, hubo un error procesando tu mensaje. ¿Podrías intentarlo de nuevo?";
    }
}

// Función para guardar conversación
function saveConversation(userId, message, response, context = null) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO conversation_history (user_id, message, response, context) VALUES (?, ?, ?, ?)',
            [userId, message, response, context],
            function(err) {
                if (err) {
                    console.error('Error guardando conversación:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Función para actualizar feedback
async function updateFeedback(conversationId, feedback) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE conversation_history SET feedback = ? WHERE id = ?',
            [feedback, conversationId],
            function(err) {
                if (err) {
                    console.error('Error actualizando feedback:', err);
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Función para obtener el historial de conversación
async function getConversationHistory(userId, limit = 5) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM conversation_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
            [userId, limit],
            (err, rows) => {
                if (err) {
                    console.error('Error obteniendo historial:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Función para procesar PDFs
async function summarizePDF(filePath) {
    try {
        console.log('Procesando PDF:', filePath);

        const response = await hf.summarization({
            model: 'facebook/bart-large-cnn',
            inputs: filePath,
            parameters: {
                max_length: 250,
                min_length: 50,
                do_sample: false
            }
        });

        console.log('Resumen generado exitosamente');
        return response.summary_text;
    } catch (error) {
        console.error('Error en summarizePDF:', error);
        throw new Error('No se pudo procesar el PDF. Por favor, verifica que el archivo sea válido.');
    }
}

module.exports = {
    processWithAI,
    summarizePDF,
    updateFeedback,
    getConversationHistory
};