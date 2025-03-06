# summarize.py
import os
import json
from vosk import Model, KaldiRecognizer
from pydub import AudioSegment

# Cargar el modelo de Vosk
model_path = "model"  # Asegúrate de tener el modelo Vosk descargado
if not os.path.exists(model_path):
    print("Por favor, descarga el modelo de Vosk y colócalo en la carpeta 'model'.")
    exit(1)

model = Model(model_path)

# Función para transcribir audio
def transcribe_audio(audio_path):
    recognizer = KaldiRecognizer(model, 16000)
    audio = AudioSegment.from_file(audio_path)
    audio = audio.set_frame_rate(16000).set_channels(1)
    transcript = ""

    for chunk in audio[::5000]:  # Procesar en chunks de 5 segundos
        data = chunk.raw_data
        if recognizer.AcceptWaveform(data):
            result = json.loads(recognizer.Result())
            transcript += result.get("text", "") + " "

    return transcript.strip()

# Función para procesar mensajes de texto
def process_message(message):
    try:
        result = eval(message)  # ¡Cuidado con eval! Solo para este ejemplo.
        return f"El resultado es: {result}"
    except:
        return "No pude resolver la operación."

# Ejemplo de uso
if __name__ == "__main__":
    # Procesar un mensaje de texto
    print(process_message("2 + 2"))

    # Transcribir un archivo de audio (asegúrate de tener un archivo de audio)
    # print(transcribe_audio("audio.wav"))