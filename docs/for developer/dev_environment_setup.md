# openKMS Developer Environment Setup

## Overview

- **Backend** (`backend/`): FastAPI service with PostgreSQL, uses PaddleOCRVL for document parsing
- **VLM Server** (`vlm-server/`): MLX-VLM server at `http://localhost:8101` – required by PaddleOCRVL as VLM backend
- **Frontend** (`frontend/`): React/Vite app

### Database Setup
Login to postgres as superuser and run:

```sql
CREATE USER openkms_user WITH PASSWORD 'openkms_user_password';
CREATE DATABASE openkms;
GRANT ALL PRIVILEGES ON DATABASE openkms TO openkms_user;

-- Required for PostgreSQL 15+: allow openkms_user to create tables in public schema
\c openkms
GRANT ALL ON SCHEMA public TO openkms_user;
GRANT CREATE ON SCHEMA public TO openkms_user;
```

### Document Parsing Solution

Dependence packages are:
```
paddleocr==3.4.0
paddlepaddle==3.3.0
paddlex[ocr]==3.4.2
# Required by GenAIClient when using remote VLM backend (mlx-vlm-server, vllm-server, etc.)
openai>=1.0.0
# For paddleocr vl model, numpy version should less than 2.4
numpy==2.3.5
```

Example code are:
```python
from pathlib import Path
from paddleocr import PaddleOCRVL

input_file = "..."
output_path = Path("./output")

pipeline = PaddleOCRVL(
  vl_rec_backend="mlx-vlm-server", 
  vl_rec_server_url="http://localhost:8101/",
  vl_rec_api_model_name="PaddlePaddle/PaddleOCR-VL-1.5",
  vl_rec_max_concurrency=3,
  )

output = pipeline.predict(input=input_file)

pages_res = list(output)

output = pipeline.restructure_pages(pages_res)

for res in output:
    res.print() ## 打印预测的结构化输出
    res.save_to_json(save_path="output") ## 保存当前图像的结构化json结果
    res.save_to_markdown(save_path="output") ## 保存当前图像的markdown格式的结果
```

### Backend Integration

The backend (`backend/app/services/document_parser.py`) uses PaddleOCRVL with the mlx-vlm-server as the VLM backend. Configuration is via environment variables:

- `OPENKMS_PADDLEOCR_VL_SERVER_URL` – mlx-vlm-server URL (default: `http://localhost:8101/`)
- `OPENKMS_PADDLEOCR_VL_MODEL` – VLM model name (default: `PaddlePaddle/PaddleOCR-VL-1.5`)
- `OPENKMS_PADDLEOCR_VL_MAX_CONCURRENCY` – max concurrent VLM requests (default: `3`)

**Full stack setup:**

1. Start vlm-server (mlx-vlm) for VLM inference:
   ```bash
   cd vlm-server && ./start.sh
   ```

2. Install backend dependencies (includes PaddleOCRVL):
   ```bash
   cd backend && pip install -r requirements.txt
   ```

3. Run database migrations and start the backend:
   ```bash
   cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000
   ```