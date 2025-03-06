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
app.use('/static', express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        staticFiles: {
            path: path.join(__dirname, 'public'),
            exists: require('fs').existsSync(path.join(__dirname, 'public'))
        }
    });
});

// Ruta principal
app.get('/', (req, res) => {
    console.log('Sirviendo index.html desde:', path.join(__dirname, 'public', 'index.html'));
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error enviando index.html:', err);
            res.status(500).send('Error interno del servidor');
        }
    });
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

// Manejar errores
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar el servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log('Directorio público:', path.join(__dirname, 'public'));
}).on('error', (error) => {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
});