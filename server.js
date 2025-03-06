const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./credentials.json');
const dotenv = require('dotenv');
const { exec } = require('child_process');
const gtts = require('gtts');
const fs = require('fs');

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

// Ruta para la raíz (/)
app.get('/', (req, res) => {
    res.send('¡Bienvenido al WhatsappMathBot!');
});

// Función para guardar en Google Sheets
async function saveToSheet(sender, message) {
    try {
        const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
        await doc.useServiceAccountAuth(creds);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow([sender, message, new Date().toISOString()]);
        console.log('✅ Datos guardados en Google Sheets.');
    } catch (error) {
        console.error('❌ Error al guardar en Google Sheets:', error);
    }
}

// Función para procesar mensajes con IA
async function processMessageLocal(message) {
    return new Promise((resolve, reject) => {
        const escapedMessage = message.replace(/"/g, '\\"');
        const command = `python -c "from summarize import processMessageLocal; print(processMessageLocal('${escapedMessage}'))"`;

        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en processMessageLocal:', stderr);
                reject('Lo siento, hubo un error procesando tu mensaje.');
            } else {
                resolve(`📝 **Respuesta:**\n${stdout.trim()}`);
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

// Ruta para recibir mensajes
app.post('/message', async (req, res) => {
    const { sender, message } = req.body;

    try {
        await saveToSheet(sender, message);
        const response = await processMessageLocal(message);
        const audioResponse = await generateSpeech(response);
        res.send({ response, audioUrl: audioResponse });
    } catch (error) {
        console.error('Error procesando el mensaje:', error);
        res.status(500).send('Lo siento, hubo un error procesando tu mensaje.');
    }
});

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});