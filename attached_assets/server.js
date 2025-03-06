const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));

// Ruta para el chat
app.post('/chat', async (req, res) => {
    const { message } = req.body;
    try {
        const response = await processMessageLocal(message);
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

// Función para procesar mensajes con modelo local
async function processMessageLocal(message) {
    return new Promise((resolve, reject) => {
        exec(`python -c "from summarize import processMessageLocal; print(processMessageLocal('${message.replace(/'/g, "\\'")}'))"`, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en processMessageLocal:', stderr);
                reject('Lo siento, hubo un error procesando tu mensaje.');
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// Función para resumir PDFs
async function summarizePDF(filePath) {
    return new Promise((resolve, reject) => {
        exec(`python summarize.py summarize "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en summarizePDF:', stderr);
                reject('Lo siento, hubo un error procesando el PDF.');
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});