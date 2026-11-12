# VLM Server (MLX-VLM)

Runs the MLX-VLM server for PaddleOCR document extraction. The backend expects this server at `http://localhost:8101/`.

## Setup

```bash
pip install -r requirements.txt
```

## Start Server

```bash
# Default port 8101 (matches backend config)
./start.sh

# Or use mlx_vlm directly
mlx_vlm.server --port 8101

# Custom port
mlx_vlm.server --port 8102
```

## Options

- `--port`: Port number (default: 8080 in mlx-vlm; use 8101 for backend compatibility)
- `--host`: Host address (default: 0.0.0.0)
- `--trust-remote-code`: Required for some models (e.g. PaddleOCR-VL)

Some models may need `--trust-remote-code`:

```bash
mlx_vlm.server --port 8101 --trust-remote-code
```

## Model cache and the network

`mlx_vlm.server` resolves the model repo id on the **first request**, not at startup. With no route to
Hugging Face that lookup stalls and answers **500 per request** (`httpx.ReadTimeout` in the server log,
`Loading model from: …` retried) — it reads like a broken VLM, not a broken download.

`start.sh` therefore sets `HF_ENDPOINT=https://hf-mirror.com` and `HF_HUB_OFFLINE=1`: the server serves
from the local cache and never reaches the network during a request.

- **First run** (model not cached yet): `VLM_ALLOW_DOWNLOAD=1 ./start.sh`, or prefetch once with
  `HF_ENDPOINT=https://hf-mirror.com hf download PaddlePaddle/PaddleOCR-VL-1.6`.
- **Check what the server would load**: `HF_HUB_OFFLINE=1 python -c "from mlx_vlm.utils import get_model_path; print(get_model_path('PaddlePaddle/PaddleOCR-VL-1.6'))"`.
- If you start `mlx_vlm.server` by hand instead of through `start.sh`, export both variables yourself.
