# -*- coding: utf-8 -*-
from vosk import Model, KaldiRecognizer
import wave
import sys
import os
import json
from pydub import AudioSegment
import re  # Para manejar expresiones regulares

# Función para convertir MP3 a WAV
def convert_mp3_to_wav(mp3_file, wav_file):
    try:
        audio = AudioSegment.from_mp3(mp3_file)
        audio.export(wav_file, format="wav")
        return wav_file
    except Exception as e:
        return f"Error al convertir MP3 a WAV: {e}"

# Función para transcribir audio
def transcribe_audio(file_path):
    try:
        # Verifica si el archivo existe
        if not os.path.exists(file_path):
            return f"Error: El archivo '{file_path}' no existe."

        # Verifica si el archivo es un WAV válido
        try:
            wf = wave.open(file_path, "rb")
        except wave.Error:
            return f"Error: El archivo '{file_path}' no es un archivo WAV válido."

        # Carga el modelo de Vosk
        model = Model("models/vosk-model-small-es-0.22")
        rec = KaldiRecognizer(model, wf.getframerate())

        # Transcribe el audio
        transcription = ""
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = rec.Result()
                result_dict = json.loads(result)
                transcription += result_dict.get("text", "") + " "
            else:
                partial_result = rec.PartialResult()
                partial_dict = json.loads(partial_result)
                print("Transcripción parcial:", partial_dict.get("partial", ""))

        # Devuelve la transcripción final
        final_result = rec.FinalResult()
        final_dict = json.loads(final_result)
        transcription += final_dict.get("text", "")

        return transcription.strip() if transcription.strip() else "No se pudo transcribir el audio."

    except Exception as e:
        return f"Error inesperado: {e}"

# Función para procesar mensajes de texto con IA
def processMessageLocal(message):
    # Verifica si el mensaje contiene una expresión matemática
    if "cuánto es" in message.lower() or "cuanto es" in message.lower():
        try:
            # Extraer la expresión matemática del mensaje
            expression = message.lower().replace("cuánto es", "").replace("cuanto es", "").strip()
            
            # Eliminar espacios en blanco y caracteres no deseados
            expression = expression.replace(" ", "")
            
            # Validar que la expresión solo contenga números y operadores matemáticos
            if not re.match(r'^[\d+\-*/().\s]+$', expression):
                return "La expresión matemática no es válida. Solo se permiten números y los operadores +, -, *, /."

            # Evaluar la expresión matemática (¡Cuidado con eval! Solo para demostración)
            result = eval(expression)
            return f"El resultado de {expression} es {result}."
        except Exception as e:
            return f"No pude resolver la operación. Asegúrate de que sea una expresión matemática válida. Error: {str(e)}"
    else:
        # Respuesta genérica si no se detecta una operación matemática
        return f"Recibí tu mensaje: {message}. ¿En qué más puedo ayudarte?"

# Función principal
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python summarize.py transcribe <archivo.mp3>")
        sys.exit(1)

    action = sys.argv[1]
    input_file = sys.argv[2]

    if action == "transcribe":
        # Si el archivo es MP3, conviértelo a WAV
        if input_file.endswith(".mp3"):
            wav_file = "temp.wav"
            print("Convirtiendo MP3 a WAV...")
            result = convert_mp3_to_wav(input_file, wav_file)
            if result.startswith("Error"):
                print(result)
                sys.exit(1)
            input_file = wav_file

        print("Transcribiendo audio...")
        print("Transcripción:", transcribe_audio(input_file))

        # Elimina el archivo WAV temporal si se creó
        if input_file == "temp.wav":
            os.remove(input_file)
    else:
        print("Acción no válida. Usa 'transcribe'.")