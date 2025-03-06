const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Verificar que Python esté disponible
async function checkPythonAvailability() {
    return new Promise((resolve, reject) => {
        exec('python3 --version', (error, stdout, stderr) => {
            if (error) {
                console.error('Error verificando Python:', error);
                reject(new Error('Python no está disponible'));
                return;
            }
            console.log('Python disponible:', stdout.trim());
            resolve(true);
        });
    });
}

// Función para procesar mensajes
async function processMessage(message) {
    return new Promise((resolve, reject) => {
        const escapedMessage = message.replace(/["\\]/g, '\\$&');
        const command = `python3 summarize.py process "${escapedMessage}"`;
        console.log('Ejecutando comando:', command);

        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error procesando mensaje:', error);
                console.error('stderr:', stderr);
                reject(new Error('Error procesando el mensaje'));
                return;
            }
            if (stderr) {
                console.error('Error en stderr:', stderr);
            }
            console.log('Respuesta del procesamiento:', stdout.trim());
            resolve(stdout.trim());
        });
    });
}

// Ruta para el chat
app.post('/chat', async (req, res) => {
    console.log('Recibida petición POST /chat');
    try {
        const { message } = req.body;
        console.log('Mensaje recibido:', message);

        if (!message || typeof message !== 'string') {
            console.error('Mensaje inválido recibido');
            return res.status(400).json({ error: 'Mensaje inválido' });
        }

        const response = await processMessage(message);
        console.log('Respuesta generada:', response);
        res.json({ response });
    } catch (error) {
        console.error('Error en /chat:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear directorios necesarios
function createRequiredDirectories() {
    const directories = ['uploads', 'public'];
    directories.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            console.log(`Creando directorio: ${dirPath}`);
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
}

// Inicialización del servidor
async function initializeServer() {
    try {
        console.log('Iniciando servidor...');

        // Crear directorios necesarios
        createRequiredDirectories();
        console.log('Directorios verificados');

        // Verificar Python
        await checkPythonAvailability();
        console.log('Python verificado correctamente');

        // Iniciar servidor
        const PORT = 5000;
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
        }).on('error', (err) => {
            console.error('Error iniciando el servidor:', err);
            process.exit(1);
        });
    } catch (error) {
        console.error('Error en la inicialización:', error);
        process.exit(1);
    }
}

// Iniciar el servidor
initializeServer().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});