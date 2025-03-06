const express = require('express');
const multer = require('multer');
const path = require('path');
const { 
    processWithAI, 
    summarizePDF 
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

// Ruta para el chat
app.post('/chat', async (req, res) => {
    const { message } = req.body;
    try {
        const response = await processWithAI(message);
        res.json({ response });
    } catch (error) {
        console.error('Error en /chat:', error);
        res.status(500).json({ response: 'Lo siento, hubo un error procesando tu mensaje.' });
    }
});

// Ruta para subir PDFs
app.post('/upload', upload.single('pdf'), async (req, res) => {
    const filePath = req.file.path;
    try {
        const summary = await summarizePDF(filePath);
        res.json({ summary });
    } catch (error) {
        console.error('Error en /upload:', error);
        res.status(500).json({ summary: 'Lo siento, hubo un error procesando el PDF.' });
    }
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