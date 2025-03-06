const express = require('express');
const multer = require('multer');
const path = require('path');
const { 
    processWithAI, 
    summarizePDF, 
    updateFeedback,
    getConversationHistory
} = require('./ai_handler');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Ruta para el chat con IA
app.post('/chat', async (req, res) => {
    try {
        const { message, userId, context } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        const response = await processWithAI(message, userId, context);
        res.json({ response });
    } catch (error) {
        console.error('Error en /chat:', error);
        res.status(500).json({ error: 'Error procesando el mensaje' });
    }
});

// Ruta para procesar PDFs
app.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Archivo PDF requerido' });
        }

        const summary = await summarizePDF(req.file.path);
        res.json({ summary });
    } catch (error) {
        console.error('Error en /upload:', error);
        res.status(500).json({ error: 'Error procesando el PDF' });
    }
});

// Ruta para actualizar el feedback
app.post('/feedback', async (req, res) => {
    try {
        const { conversationId, feedback } = req.body;
        if (!conversationId || feedback === undefined) {
            return res.status(400).json({ error: 'ID de conversación y feedback requeridos' });
        }

        await updateFeedback(conversationId, feedback);
        res.json({ success: true });
    } catch (error) {
        console.error('Error en /feedback:', error);
        res.status(500).json({ error: 'Error actualizando el feedback' });
    }
});

// Ruta para obtener el historial de conversación
app.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit } = req.query;

        const history = await getConversationHistory(userId, parseInt(limit) || 5);
        res.json({ history });
    } catch (error) {
        console.error('Error en /history:', error);
        res.status(500).json({ error: 'Error obteniendo el historial' });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});