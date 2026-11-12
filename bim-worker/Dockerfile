FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt extrair_ifc.py worker.py ./
RUN pip install --no-cache-dir -r requirements.txt
CMD ["python", "-u", "worker.py"]
