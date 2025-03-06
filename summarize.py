# -*- coding: utf-8 -*-
import sys
import os
import json
import re
import logging

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
    try:
        # Eliminar todo excepto números y operadores básicos
        expression = expression.lower().replace('cuánto es', '').replace('cuanto es', '').strip()
        # Limpiar espacios extras alrededor de operadores
        expression = re.sub(r'\s*([+\-*/])\s*', r'\1', expression)
        # Validar que la expresión sea segura
        if not re.match(r'^[\d+\-*/().\s]+$', expression):
            logging.warning(f"Expresión matemática no válida: {expression}")
            return None
        logging.info(f"Expresión matemática sanitizada: {expression}")
        return expression
    except Exception as e:
        logging.error(f"Error sanitizando expresión matemática: {e}")
        return None

def evaluate_math_expression(expression):
    """Evalúa una expresión matemática de forma segura."""
    try:
        # Sanitizar la expresión
        clean_expr = sanitize_math_expression(expression)
        if not clean_expr:
            return "La expresión matemática no es válida. Solo se permiten números y los operadores +, -, *, /."

        # Evaluar la expresión
        logging.info(f"Evaluando expresión: {clean_expr}")
        result = eval(clean_expr)
        return f"El resultado de {clean_expr} es {result}"
    except Exception as e:
        logging.error(f"Error al evaluar expresión matemática: {str(e)}")
        return "No pude resolver la operación matemática. Por favor, verifica el formato."

def processMessageLocal(message):
    """Procesa mensajes de texto y retorna una respuesta."""
    try:
        message = message.strip()
        logging.info(f"Procesando mensaje: {message}")

        # Detectar si es una operación matemática
        if 'cuánto es' in message.lower() or 'cuanto es' in message.lower():
            logging.info("Detectada operación matemática")
            return evaluate_math_expression(message)

        # Otras respuestas
        greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches']
        if any(greeting in message.lower() for greeting in greetings):
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
            logging.info(f"Procesando entrada: {input_data}")
            result = processMessageLocal(input_data)
            print(result)
        except Exception as e:
            logging.error(f"Error: {str(e)}")
            print(f"Error: {str(e)}")
    else:
        print("Acción no válida. Use 'process'.")