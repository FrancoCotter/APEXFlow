#!/usr/bin/env python3
"""Create an official ACE-Step simple-mode sample via Python fallback.

This uses ACE-Step's `create_sample()` helper, which is the documented
"Simple Mode / Inspiration Mode" Python entrypoint for generating caption,
lyrics, and metadata from a natural-language query.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import torch

# Get ACE-Step path from environment or use default
ACESTEP_PATH = os.environ.get("ACESTEP_PATH", "/home/ambsd/Desktop/aceui/ACE-Step-1.5")
sys.path.insert(0, ACESTEP_PATH)

from acestep.inference import create_sample  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402
from acestep.model_downloader import download_submodel  # noqa: E402

_llm_handler = None


def get_llm_handler(lm_model=None, lm_backend=None):
    global _llm_handler
    if _llm_handler is None:
        _llm_handler = LLMHandler()
        checkpoint_dir = os.path.join(ACESTEP_PATH, "checkpoints")
        lm_model_path = lm_model or "acestep-5Hz-lm-0.6B"
        backend = lm_backend or "pt"

        model_dir = os.path.join(checkpoint_dir, lm_model_path)
        if not os.path.exists(model_dir) or not os.listdir(model_dir):
            print(f"[create_sample] Model {lm_model_path} not found, downloading...", file=sys.stderr)
            success, msg = download_submodel(lm_model_path, Path(checkpoint_dir))
            if not success:
                raise RuntimeError(f"Failed to download model {lm_model_path}: {msg}")
            print(f"[create_sample] Download complete: {msg}", file=sys.stderr)

        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

        status, success = _llm_handler.initialize(
            checkpoint_dir=checkpoint_dir,
            lm_model_path=lm_model_path,
            backend=backend,
            device=device,
            offload_to_cpu=True,
        )

        if not success:
            raise RuntimeError(f"Failed to initialize LLM: {status}")

    return _llm_handler


def create_simple_sample(
    query: str,
    instrumental: bool = False,
    vocal_language: str = "unknown",
    temperature: float = 0.85,
    top_k: int = 0,
    top_p: float = 0.9,
    lm_model: str = None,
    lm_backend: str = None,
):
    handler = get_llm_handler(lm_model=lm_model, lm_backend=lm_backend)
    top_k_value = None if not top_k or top_k == 0 else int(top_k)
    top_p_value = None if not top_p or top_p >= 1.0 else top_p
    language_value = None if not vocal_language or vocal_language == "unknown" else vocal_language

    result = create_sample(
        llm_handler=handler,
        query=query,
        instrumental=instrumental,
        vocal_language=language_value,
        temperature=temperature,
        top_k=top_k_value,
        top_p=top_p_value,
        use_constrained_decoding=True,
    )

    return {
        "success": result.success,
        "caption": result.caption,
        "lyrics": result.lyrics,
        "bpm": result.bpm,
        "duration": result.duration,
        "key_scale": result.keyscale,
        "vocal_language": result.language,
        "time_signature": result.timesignature,
        "instrumental": result.instrumental,
        "status_message": result.status_message,
    }


def main():
    parser = argparse.ArgumentParser(description="Create a simple-mode ACE-Step sample")
    parser.add_argument("--query", type=str, required=True, help="Natural language music description")
    parser.add_argument("--instrumental", action="store_true", help="Generate instrumental sample")
    parser.add_argument("--vocal-language", type=str, default="unknown", help="Optional vocal language hint")
    parser.add_argument("--temperature", type=float, default=0.85, help="LLM temperature")
    parser.add_argument("--top-k", type=int, default=0, help="LLM top-k")
    parser.add_argument("--top-p", type=float, default=0.9, help="LLM top-p")
    parser.add_argument("--lm-model", type=str, default=None, help="LM model name")
    parser.add_argument("--lm-backend", type=str, default=None, help="LM backend (pt or vllm)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    try:
        start_time = time.time()
        result = create_simple_sample(
            query=args.query,
            instrumental=args.instrumental,
            vocal_language=args.vocal_language,
            temperature=args.temperature,
            top_k=args.top_k,
            top_p=args.top_p,
            lm_model=args.lm_model,
            lm_backend=args.lm_backend,
        )
        result["elapsed_seconds"] = time.time() - start_time

        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"Caption: {result['caption']}")
                print(f"Lyrics: {result['lyrics'][:100]}...")
            else:
                print(f"Error: {result['status_message']}")
    except Exception as exc:
        if args.json:
            print(json.dumps({"success": False, "error": str(exc)}))
        else:
            print(f"Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
