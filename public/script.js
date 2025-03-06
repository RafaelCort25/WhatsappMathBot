document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    function addMessage(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
        messageDiv.textContent = text;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, true);
        userInput.value = '';

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            const data = await response.json();
            addMessage(data.response);
        } catch (error) {
            console.error('Error:', error);
            addMessage('Lo siento, hubo un error al procesar tu mensaje.');
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});

// Variables globales
let currentConversationId = null;
let userId = localStorage.getItem('userId') || `user_${Date.now()}`;

// Guardar userId si no existe
if (!localStorage.getItem('userId')) {
    localStorage.setItem('userId', userId);
}

// Elementos del DOM (Some elements are already defined in the DOMContentLoaded event listener)
const pdfUpload = document.getElementById('pdf-upload');
const feedbackSection = document.querySelector('.feedback-section');


// Event Listeners (Some are already defined in the DOMContentLoaded event listener)
pdfUpload.addEventListener('change', handlePDFUpload);

// Función para manejar la subida de PDFs
async function handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loadingMessage = addMessage('bot', 'Procesando el PDF...');
    const formData = new FormData();
    formData.append('pdf', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        loadingMessage.remove();

        if (data.error) {
            addMessage('bot', 'Error procesando el PDF.');
        } else {
            const botMessage = addMessage('bot', `Resumen del PDF: ${data.summary}`);
            showFeedbackButtons(botMessage);
        }
    } catch (error) {
        console.error('Error:', error);
        loadingMessage.remove();
        addMessage('bot', 'Error al procesar el archivo.');
    }
}

// Función para mostrar botones de feedback
function showFeedbackButtons(messageElement) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.classList.add('feedback-buttons');
    feedbackDiv.innerHTML = `
        <button class="feedback-btn" onclick="sendFeedback(1, this)">👍</button>
        <button class="feedback-btn" onclick="sendFeedback(0, this)">👎</button>
    `;
    messageElement.appendChild(feedbackDiv);
}

// Función para enviar feedback
async function sendFeedback(value, button) {
    const feedbackDiv = button.parentElement;
    try {
        await fetch('/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                conversationId: currentConversationId,
                feedback: value
            }),
        });

        feedbackDiv.innerHTML = '¡Gracias por tu feedback! 🎉';
    } catch (error) {
        console.error('Error enviando feedback:', error);
        feedbackDiv.innerHTML = 'Error al enviar feedback';
    }
}

// Función para obtener contexto reciente
function getRecentContext() {
    const messages = chatBox.querySelectorAll('.message');
    const recentMessages = Array.from(messages).slice(-4); // Últimos 4 mensajes
    return recentMessages
        .map(msg => `${msg.classList.contains('user') ? 'Usuario' : 'Bot'}: ${msg.textContent}`)
        .join('\n');
}

// Cargar historial inicial
async function loadHistory() {
    try {
        const response = await fetch(`/history/${userId}`);
        const data = await response.json();

        if (data.history) {
            data.history.forEach(item => {
                addMessage('user', item.message);
                addMessage('bot', item.response);
            });
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
    }
}

// Cargar historial al iniciar
loadHistory();