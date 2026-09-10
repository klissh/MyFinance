# ManageMyMoney — Scan Struk API (EasyOCR + LayoutLMv3), CPU-only.
# HF Space "Docker" SDK. App wajib listen di 0.0.0.0:7860.
FROM python:3.10-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/home/user/.cache/huggingface \
    HF_HUB_DISABLE_TELEMETRY=1 \
    MODEL_DIR=/home/user/app/model \
    EASYOCR_DIR=/home/user/.EasyOCR \
    TRANSFORMERS_NO_ADVISORY_WARNINGS=1

# Dependensi sistem: libgomp1 (OpenMP untuk torch), libglib2.0-0 (opencv-headless).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces menjalankan kontainer sebagai uid 1000 — samakan supaya cache/model
# yang di-bake saat build tetap terbaca saat runtime.
RUN useradd -m -u 1000 user
USER user
ENV PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

# 1. PyTorch CPU dulu (hindari tarik wheel CUDA yang besar).
RUN pip install --user --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        "torch==2.2.2" "torchvision==0.17.2"

# 2. Sisa dependensi.
COPY --chown=user:user requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 3. Bake bobot model LayoutLMv3 (repo publik) ke dalam image.
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='Klissh/layoutlmv3-cord-v2', local_dir='${MODEL_DIR}', \
    ignore_patterns=['*.bin','.gitattributes','README.md'])" \
 && python -c "import os; assert os.path.exists(os.path.join('${MODEL_DIR}','model.safetensors')), 'model.safetensors tidak ke-bake'"

# 4. Bake bobot EasyOCR — jalankan Reader dengan kombinasi bahasa yang PERSIS
#    dipakai app (lihat OCR_LANGS di app.py) supaya runtime bisa download_enabled=False.
RUN python -c "import easyocr; easyocr.Reader(['en','id'], gpu=False, \
    model_storage_directory='${EASYOCR_DIR}', download_enabled=True)" \
 && python -c "import os; print('EasyOCR files:', os.listdir('${EASYOCR_DIR}'))"

# 5. Kode aplikasi (paling akhir supaya layer di atas ter-cache saat edit app.py).
COPY --chown=user:user app.py .

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS http://localhost:7860/health || exit 1

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--timeout-keep-alive", "75"]
