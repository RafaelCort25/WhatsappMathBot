document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('upload-btn').addEventListener('click', uploadPDF);

function sendMessage() {
    const userInput = document.getElementById('user-input').value;
    if (userInput.trim() === '') return;

    addMessage('user', userInput);
    document.getElementById('user-input').value = '';

    // Mostrar mensaje de carga
    const loadingMessage = addMessage('bot', 'Procesando tu mensaje...');

    fetch('/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userInput }),
    })
    .then(response => response.json())
    .then(data => {
        // Eliminar mensaje de carga y mostrar respuesta
        loadingMessage.remove();
        addMessage('bot', data.response);
    })
    .catch(error => {
        console.error('Error:', error);
        loadingMessage.remove();
        addMessage('bot', 'Lo siento, hubo un error procesando tu mensaje.');
    });
}

function uploadPDF() {
    const fileInput = document.getElementById('pdf-upload');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('pdf', file);

    // Mostrar mensaje de carga
    const loadingMessage = addMessage('bot', 'Procesando el PDF...');

    fetch('/upload', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        // Eliminar mensaje de carga y mostrar respuesta
        loadingMessage.remove();
        addMessage('bot', `Resumen del PDF: ${data.summary}`);
    })
    .catch(error => {
        console.error('Error:', error);
        loadingMessage.remove();
        addMessage('bot', 'Lo siento, hubo un error procesando el PDF.');
    });
}

function addMessage(sender, message) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageElement; // Devuelve el mensaje para poder eliminarlo
}