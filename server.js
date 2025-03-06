const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const dotenv = require('dotenv');
const gtts = require('gtts');

dotenv.config();

const app = express();
const port = 3000;

// Middleware para parsear JSON
app.use(express.json());

// Ruta de bienvenida (GET)
app.get('/', (req, res) => {
  res.send('¡Bienvenido al WhatsappMathBot!');
});

// Ruta para manejar mensajes (POST)
app.post('/message', async (req, res) => {
  const { sender, message } = req.body;

  if (!sender || !message) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  try {
    // Procesar el mensaje
    const response = await processMessage(message);

    // Guardar en Google Sheets (opcional)
    if (process.env.SHEET_ID && process.env.GOOGLE_CREDENTIALS) {
      await saveToGoogleSheets(sender, message, response);
    }

    // Enviar respuesta
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Error al procesar el mensaje' });
  }
});

// Función para procesar el mensaje
async function processMessage(message) {
  // Si el mensaje es una operación matemática
  if (/[\d\s\+\-\*\/\(\)]/.test(message)) {
    try {
      const result = eval(message); // ¡Cuidado con eval! Solo para este ejemplo.
      return `El resultado es: ${result}`;
    } catch (error) {
      return 'No pude resolver la operación.';
    }
  }

  // Si el mensaje es un audio (aquí deberías integrar Vosk)
  return 'Procesamiento de audio no implementado aún.';
}

// Función para guardar en Google Sheets
async function saveToGoogleSheets(sender, message, response) {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth(require('./credentials.json'));
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];
  await sheet.addRow({
    Sender: sender,
    Message: message,
    Response: response,
    Timestamp: new Date().toISOString(),
  });
}

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});