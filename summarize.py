# -*- coding: utf-8 -*-
import sys
import os
import json
import re
import logging
from vosk import Model, KaldiRecognizer
import wave
from pydub import AudioSegment

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

def sanitize_math_expression(expression):
    """Sanitiza y valida una expresión matemática."""
    # Eliminar todo excepto números y operadores básicos
    clean_expr = re.sub(r'[^0-9+\-*/().\s]', '', expression)
    # Validar que la expresión sea segura
    if not re.match(r'^[\d+\-*/().\s]+$', clean_expr):
        return None
    return clean_expr.strip()

def evaluate_math_expression(expression):
    """Evalúa una expresión matemática de forma segura."""
    try:
        # Reemplazar operadores textuales por símbolos
        expression = expression.lower()
        expression = expression.replace('más', '+').replace('menos', '-')
        expression = expression.replace('por', '*').replace('entre', '/')

        # Sanitizar la expresión
        clean_expr = sanitize_math_expression(expression)
        if not clean_expr:
            return "La expresión matemática no es válida. Solo se permiten números y los operadores +, -, *, /."

        # Evaluar la expresión
        result = eval(clean_expr)
        return f"El resultado de {clean_expr} es {result}"
    except Exception as e:
        logging.error(f"Error al evaluar expresión matemática: {str(e)}")
        return "No pude resolver la operación matemática. Por favor, verifica el formato."

def processMessageLocal(message):
    """Procesa mensajes de texto y retorna una respuesta."""
    try:
        message = message.lower().strip()
        logging.info(f"Procesando mensaje: {message}")

        # Detectar si es una operación matemática
        math_patterns = [
            r'cuánto es', r'cuanto es', r'calcul[aa]', 
            r'resuelve', r'resultado de'
        ]

        if any(re.search(pattern, message) for pattern in math_patterns):
            # Extraer la expresión matemática
            for pattern in math_patterns:
                message = re.sub(pattern, '', message, flags=re.IGNORECASE)
            return evaluate_math_expression(message)

        # Otras respuestas
        greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches']
        if any(greeting in message for greeting in greetings):
            return "¡Hola! ¿En qué puedo ayudarte?"

        return f"He recibido tu mensaje: '{message}'. ¿En qué puedo ayudarte?"

    except Exception as e:
        logging.error(f"Error procesando mensaje: {str(e)}")
        return "Lo siento, ocurrió un error al procesar tu mensaje."

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python summarize.py [process] <input>")
        sys.exit(1)

    action = sys.argv[1]
    input_data = sys.argv[2]

    if action == "process":
        try:
            # Asegurar que la entrada esté en UTF-8
            input_data = input_data.encode('utf-8').decode('utf-8')
            # Procesar el mensaje y codificar la respuesta en UTF-8
            result = processMessageLocal(input_data)
            print(result.encode('utf-8').decode('utf-8'))
        except Exception as e:
            print(f"Error: {str(e)}".encode('utf-8').decode('utf-8'))
    else:
        print("Acción no válida. Use 'process'.")