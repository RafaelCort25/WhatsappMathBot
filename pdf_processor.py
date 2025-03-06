import sys
import pdfplumber
from transformers import pipeline
import logging

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('pdf_processor.log'),
        logging.StreamHandler()
    ]
)

def extract_text_from_pdf(pdf_path):
    """Extraer texto de un PDF."""
    try:
        text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() + "\n"
        return text
    except Exception as e:
        logging.error(f"Error extrayendo texto del PDF: {str(e)}")
        raise

def summarize_text(text):
    """Resumir texto usando el modelo de Hugging Face."""
    try:
        summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
        
        # Dividir el texto en chunks si es muy largo
        max_chunk_length = 1024
        chunks = [text[i:i + max_chunk_length] for i in range(0, len(text), max_chunk_length)]
        
        summaries = []
        for chunk in chunks:
            if len(chunk.strip()) > 100:  # Solo resumir chunks con suficiente texto
                summary = summarizer(chunk, max_length=130, min_length=30, do_sample=False)
                summaries.append(summary[0]['summary_text'])
        
        return " ".join(summaries)
    except Exception as e:
        logging.error(f"Error resumiendo texto: {str(e)}")
        raise

def process_pdf(pdf_path):
    """Procesar un PDF: extraer texto y resumirlo."""
    try:
        logging.info(f"Procesando PDF: {pdf_path}")
        
        # Extraer texto
        text = extract_text_from_pdf(pdf_path)
        logging.info(f"Texto extraído: {len(text)} caracteres")
        
        # Resumir si hay suficiente texto
        if len(text.strip()) < 100:
            return text
        
        # Generar resumen
        summary = summarize_text(text)
        logging.info("Resumen generado exitosamente")
        
        return summary
    
    except Exception as e:
        logging.error(f"Error procesando PDF: {str(e)}")
        return f"Error procesando el PDF: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python pdf_processor.py <ruta_del_pdf>")
        sys.exit(1)
    
    try:
        result = process_pdf(sys.argv[1])
        print(result)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
