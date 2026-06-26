"""Download Transformers.js + ONNX WASM + all-MiniLM-L6-v2 model files for offline use.

Transformers.js 2.17.2 depends on onnxruntime-web 1.14.0 — WASM files MUST match.
"""
import urllib.request
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(ROOT, "lib")
MODEL = os.path.join(ROOT, "models", "Xenova", "all-MiniLM-L6-v2")
ONNX_DIR = os.path.join(MODEL, "onnx")

os.makedirs(LIB, exist_ok=True)
os.makedirs(ONNX_DIR, exist_ok=True)

ONNX_VERSION = "1.14.0"  # Must match @xenova/transformers@2.17.2 dependency

FILES = [
    # Transformers.js UMD bundle (~900 KB)
    {
        "url": "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js",
        "dest": os.path.join(LIB, "transformers.min.js"),
        "label": "transformers.min.js",
    },
    # ONNX Runtime WASM backends (~10 MB each) — v1.14.0 required
    {
        "url": f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ONNX_VERSION}/dist/ort-wasm-simd-threaded.wasm",
        "dest": os.path.join(LIB, "ort-wasm-simd-threaded.wasm"),
        "label": "ort-wasm-simd-threaded.wasm",
    },
    {
        "url": f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ONNX_VERSION}/dist/ort-wasm-simd.wasm",
        "dest": os.path.join(LIB, "ort-wasm-simd.wasm"),
        "label": "ort-wasm-simd.wasm",
    },
    {
        "url": f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ONNX_VERSION}/dist/ort-wasm-threaded.wasm",
        "dest": os.path.join(LIB, "ort-wasm-threaded.wasm"),
        "label": "ort-wasm-threaded.wasm",
    },
    {
        "url": f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ONNX_VERSION}/dist/ort-wasm.wasm",
        "dest": os.path.join(LIB, "ort-wasm.wasm"),
        "label": "ort-wasm.wasm",
    },
    # Model configs
    {
        "url": "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json",
        "dest": os.path.join(MODEL, "config.json"),
        "label": "config.json",
    },
    {
        "url": "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json",
        "dest": os.path.join(MODEL, "tokenizer.json"),
        "label": "tokenizer.json",
    },
    {
        "url": "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json",
        "dest": os.path.join(MODEL, "tokenizer_config.json"),
        "label": "tokenizer_config.json",
    },
    # Quantized ONNX model (~22 MB)
    {
        "url": "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx",
        "dest": os.path.join(ONNX_DIR, "model_quantized.onnx"),
        "label": "model_quantized.onnx",
    },
]

def download(url, dest, label):
    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        print(f"  [SKIP] {label} ({size_mb:.1f} MB) — already exists")
        return True

    print(f"  [DOWNLOAD] {label} ...", end=" ", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FocusValve/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        size_mb = len(data) / (1024 * 1024)
        print(f"{size_mb:.1f} MB")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

def main():
    print("FocusValve — downloading dependencies\n")
    ok = 0
    fail = 0
    for f in FILES:
        if download(f["url"], f["dest"], f["label"]):
            ok += 1
        else:
            fail += 1

    print(f"\nDone: {ok} succeeded, {fail} failed")
    if fail > 0:
        print("\nSome files failed to download. Check URLs and network, then re-run.")
        sys.exit(1)
    else:
        print("All dependencies ready. Load the extension in chrome://extensions.")

if __name__ == "__main__":
    main()
