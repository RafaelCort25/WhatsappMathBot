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
        logging.info(f"Sanitizando expresión original (repr): {repr(expression)}")

        # Extraer la expresión matemática después de "cuanto es" o "cuánto es"
        matches = re.search(r'cu[aá]nto\s+es\s+(.*)', expression.lower())
        if not matches:
            logging.warning(f"No se encontró patrón 'cuánto es' en: {repr(expression)}")
            return None

        # Obtener la expresión
        expr = matches.group(1).strip()
        logging.info(f"Expresión extraída antes de limpieza (repr): {repr(expr)}")

        # Eliminar caracteres especiales y espacios
        expr = re.sub(r'[¿?!¡]', '', expr)  # Eliminar signos de puntuación
        expr = re.sub(r'\s+', '', expr)     # Eliminar espacios
        logging.info(f"Expresión después de eliminar caracteres especiales (repr): {repr(expr)}")

        # Mantener solo caracteres válidos
        expr = ''.join(c for c in expr if c in '0123456789+-*/()')
        logging.info(f"Expresión final después de filtrar caracteres válidos (repr): {repr(expr)}")

        # Validar que haya al menos un número
        if not re.search(r'\d', expr):
            logging.warning("La expresión no contiene números")
            return None

        # Validar la estructura de la expresión
        try:
            compile(expr, '<string>', 'eval')
            return expr
        except SyntaxError as e:
            logging.warning(f"Error de sintaxis en la expresión: {e}")
            return None

    except Exception as e:
        logging.error(f"Error en sanitize_math_expression: {str(e)}")
        return None

def evaluate_math_expression(expression):
    """Evalúa una expresión matemática de forma segura."""
    try:
        clean_expr = sanitize_math_expression(expression)
        if not clean_expr:
            return "Por favor, escribe una operación matemática simple como 'cuánto es 2+2'"

        result = eval(clean_expr)
        if isinstance(result, float):
            result = round(result, 2)

        return f"El resultado de {clean_expr} es {result}"
    except Exception as e:
        logging.error(f"Error en evaluate_math_expression: {str(e)}")
        return "Hubo un error al calcular. Por favor, verifica que la operación sea válida (ejemplo: 2+2, 3*4, 10/2)"

def processMessageLocal(message):
    """Procesa mensajes de texto y retorna una respuesta."""
    try:
        message = message.strip()
        logging.info(f"Procesando mensaje: {message}")

        # Detectar si es una operación matemática
        if re.search(r'cu[aá]nto\s+es', message.lower()):
            logging.info("Detectada operación matemática")
            return evaluate_math_expression(message)

        # Saludos
        greetings = ['hola', 'buenos días', 'buenas tardes', 'buenas noches']
        if any(greeting in message.lower() for greeting in greetings):
            return "¡Hola! ¿En qué puedo ayudarte?"

        return f"He recibido tu mensaje: '{message}'. ¿En qué puedo ayudarte?"

    except Exception as e:
        logging.error(f"Error en processMessageLocal: {str(e)}")
        return "Lo siento, ocurrió un error al procesar tu mensaje."

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python summarize.py process <input>")
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