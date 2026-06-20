<p align="center">
  <img src="https://img.shields.io/badge/%E2%99%AB-APEXFlow-b6d6c6?style=for-the-badge&labelColor=1a1a1a" alt="APEXFlow" height="54">
</p>

<h1 align="center">APEXFlow</h1>

<p align="center">
  <strong>A local-first AI music studio for ACE-Step 1.5</strong><br>
  <em>Generation, synced lyrics, visualizers, library playback, and local workflow tuning.</em>
</p>

<p align="center">
  <a href="https://github.com/FrancoCotter/ace-step-ui">
    <img src="https://img.shields.io/badge/Studio-Repo-1a1a1a?style=for-the-badge&logo=github" alt="Studio repo">
  </a>
  <a href="https://x.com/Mariano_arti">
    <img src="https://img.shields.io/badge/Follow-@Mariano__arti-b6d6c6?style=for-the-badge&logo=x&logoColor=111111" alt="Follow Mariano on X">
  </a>
  <a href="https://github.com/fspecii/ace-step-ui">
    <img src="https://img.shields.io/badge/Based_on-ACE--Step_UI-4b5563?style=for-the-badge&logo=github" alt="Original ACE-Step UI">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/TailwindCSS-Local-06B6D4?style=flat-square&logo=tailwindcss" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/SQLite-Local_First-003B57?style=flat-square&logo=sqlite" alt="SQLite">
  <img src="https://img.shields.io/badge/ACE--Step-1.5-8fb68f?style=flat-square" alt="ACE-Step 1.5">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="#-about">About</a> •
  <a href="#-what-changed">What Changed</a> •
  <a href="#-features">Features</a> •
  <a href="#-setup">Setup</a> •
  <a href="#-running">Running</a> •
  <a href="#-local-data">Local Data</a> •
  <a href="#-credits--links">Credits & Links</a>
</p>

---

## 🎧 About

APEXFlow is a local-first music generation studio customized around
[ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5).

This repository started from the original
[ACE-Step UI](https://github.com/fspecii/ace-step-ui) by
[Ambsd](https://x.com/AmbsdOP), then evolved into a personal desktop workflow
for local music generation, lyric review, video creation, and library playback.

It is not an official ACE-Step project. It is a practical local fork/custom UI
for people who want to run ACE-Step on their own machine.

---

## 🎬 Quick Demo

<!-- ![APEXFlow Demo](docs/demo.gif) -->
<!-- If you recorded a high-quality .mov, uncomment the video player tag below instead: -->
<video autoplay loop muted playsinline src="https://github.com/user-attachments/assets/e177fc72-e05b-4e23-ac4f-c6fdec0f0c52" width="100%"></video>

---

## ✨ What Changed

This fork transforms the original client into a streamlined, local-first music station. The key changes focus on model flexibility, generation parameters, lyrics review, and minimalist design:

### 🧠 Generation & Model Optimizations
* **Multiple Model Support**: Choose between different DiT checkpoints (Turbo vs. Base/SFT).
* **Community VAE Support**: Select custom VAE checkpoints such as [ScragVAE](https://huggingface.co/scragnog/Ace-Step-1.5-ScragVAE) for significantly crisper transients and clearer vocals.
* **Smart Parameter Auto-settings**: Step counts and DCW (Double Classifier-Free Guidance Wrap) settings automatically follow the selected model family (e.g., Turbo sets 8 steps and enables DCW; Base/SFT defaults to 50 steps and disables DCW to prevent audio artifacts).
* **Official Examples**: Pre-integrated official generation examples to get you started immediately.

### 🎙️ Lyrics & Scoring Integration
* **Score & Synced LRC Sync**: Fully connected backend scoring (quality metrics) and LRC synced lyric generation.
   > [!WARNING]  
   > **Memory Hint**: If your GPU VRAM is limited (e.g., 4GB–8GB), it is **not recommended** to enable both **Score** and **LRC** simultaneously during generation. This saves memory and prevents Python fallback from running out of VRAM.
   >
   > [!NOTE]   
   > **LRC & CoT Alignment**: For high-quality synced lyrics, LRC generation **must be paired with Thinking Mode (CoT)** enabled. Enabling CoT allows the model to correctly reason about and output accurate timeline timestamps matching the vocals.
* **Karaoke Mode**: Synced LRC lyrics activate an interactive, Karaoke-style scrolling display in fullscreen playback.
* **Click-to-Seek**: Click on any scrolling lyric line to jump the player directly to that part of the song.

### 🎨 Clean & Minimalist Design
* **Interface Cleanup**: Removed unnecessary, irrelevant icons and clutter from the player and sidebar to ensure a focused, local-first studio workspace.
* **Liquid Cover Backgrounds**: Fully reworked the fullscreen visualizer with liquid gradients generated dynamically from the active song's cover art.

## 🚀 Features

| Area | Highlights |
| --- | --- |
| **Music generation** | Custom lyrics, style prompts, metadata, BPM/key/time controls, batch and bulk workflows |
| **ACE-Step modes** | Gradio API path plus local Python-first generation and simple-mode sample creation |
| **Lyrics** | Static lyrics, dynamic LRC/VTT lyrics, clickable seek, fullscreen lyric stage |
| **Library** | Search, likes, playlists, song details, play counts, cached covers |
| **Scores** | ACE-Step diagnostic score display when scorer output is available |
| **Local-first data** | SQLite database, local audio files, local cover cache |

*Note: APEXFlow also includes secondary utilities like a basic **Video Studio** (which supports Pexels stock video search, visual preset overlays, and dynamic LRC lyric rendering on exported videos) and built-in **Audio Editor** / **Stem Separation** links.*

---

## 🖥️ Current Status

APEXFlow is currently a local personal fork rather than a polished upstream
release. It works best as a desktop app running on the same machine as your
ACE-Step environment.

---

## ⚙️ Generation Modes: Python Fallback vs. Gradio API

APEXFlow supports two generation backends. Each has distinct technical trade-offs:

### 1. Python Fallback Mode (Recommended for Daily Local Use)
If the backend does not detect a running Gradio API server, it automatically runs Python generation by spawning a local Python subprocess.
* **Benefits**:
  * **Smooth UI Progress Tracking**: The Express backend parses stdout/stderr lines to update precise stages (`Thinking about metadata...`, `Running diffusion...`) and smooth progress percentages in the UI.
  * **Local Simple Mode Pipeline**: Simple mode can still create full local samples (`caption + lyrics + metadata`) through ACE-Step's Python `create_sample()` flow before generation starts, so automatic lyric writing does not depend on the REST API staying online.
  * **Auto VRAM Releasing**: The Python process exits immediately after generation, completely freeing GPU memory so you can play games, run Stable Diffusion, or use other AI tools without VRAM bottlenecks.
  * **Zero Setup**: You only need to run APEXFlow. No need to start the separate ACE-Step Gradio server process in the background.
* **Drawbacks**:
  * **Cold-Start Latency**: Every song pays a 15–20s penalty to boot the Python environment and reload PyTorch/model checkpoints into VRAM.

### 2. Gradio API Mode (Recommended for Generation Sprints)
To enable, start the official ACE-Step Gradio API server in the background (Default: `http://localhost:8001` with `--enable-api` flag).
* **Benefits**:
  * **Warm Model (Rapid Generation)**: Checkpoints remain loaded in GPU memory. Consecutive generations start instantly (saving 15–20s of loading time per song).
  * **Distributed Setup**: You can run the heavy ACE-Step Gradio server on a remote GPU server or a dedicated desktop in your LAN, and connect to it from a lightweight laptop.
* **Drawbacks**:
  * **Static Progress**: The API call is synchronous. The progress bar in the UI will stay at `3%` (`Generating music via Gradio...`) and jump directly to `100%` when finished.
  * **Persistent VRAM Usage**: GPU memory remains occupied as long as the Gradio server is running.

---

## 📋 Requirements & VRAM Guidelines

### System Requirements
| Requirement | Notes |
| --- | --- |
| **Node.js** | 18 or newer |
| **Python** | 3.10+ / 3.11 recommended (requires `opencv-python` and `mediapipe` for smart avatar/banner subject detection) |
| **ACE-Step 1.5** | Required for real generation |
| **FFmpeg** | Recommended for audio metadata and processing |
| **GPU** | NVIDIA CUDA recommended |
| **Pexels API key** | Optional (needed for Video Studio background searches) |

### ⚡ GPU VRAM Guidelines
ACE-Step 1.5 dynamically scales and adapts to your hardware using CPU offloading and INT8 quantization:
* **≤ 4GB VRAM (Entry Level)**:
  * Runs with aggressive CPU offloading and quantization.
  * **Recommendations**: Use standard/turbo models (e.g. `acestep-v15-turbo`) only. Keep batch size at **1**, and **turn off Thinking Mode** (Chain-of-Thought) to bypass loading the language model planner.
* **6GB – 8GB VRAM (Mid-Range)**:
  * Supports standard models.
  * Supports **Thinking Mode** using the smaller **0.6B LM planner**.
  * Uses the PyTorch (`pt`) backend by default (since `vllm` requires 8GB+).
* **8GB – 16GB VRAM (Performance Tier)**:
  * Supports standard models and newer **XL models** (XL models require ~9GB for weights, minimum **12GB VRAM recommended**).
  * Supports **Thinking Mode** with the standard **1.7B LM planner**.
  * Enables high-speed generation using the **`vllm` backend**.
* **≥ 20-24GB VRAM (Enthusiast / XL Tier)**:
  * Full unconstrained support for XL models, the largest **4B LM planner** in Thinking Mode, batch size **up to 4**, and full-length tracks (4+ minutes) with minimal offloading.

---

## ⚙️ Step-by-Step Setup Tutorial

Follow these steps to configure your local environment:

### Step 1: Preparation (ACE-Step 1.5)
1. Clone the [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) repository to any folder on your machine.
2. Download your favorite model checkpoints and place them inside the `checkpoints/` folder of the cloned `ACE-Step-1.5` repository.

### Step 2: Establish Directory Mapping (Symlink or Env Config)
By default, the backend server auto-detects `ACE-Step-1.5` inside the project root directory (e.g. `APEXFlow/ACE-Step-1.5`). You can link your external `ACE-Step-1.5` folder inside the `APEXFlow` directory:

* **Windows** (Run Command Prompt as Administrator):
  ```batch
  cd APEXFlow
  mklink /d ACE-Step-1.5 D:\ACE-Step-1.5
  ```
* **macOS / Linux**:
  ```bash
  cd APEXFlow
  ln -s /path/to/your/cloned/ACE-Step-1.5 ACE-Step-1.5
  ```

* **Alternative (No Symlink)**: You can simply edit `server/.env` after Step 3 and set the absolute path directly:
  ```env
  ACESTEP_PATH=D:\ACE-Step-1.5
  ```

### Step 3: Install Dependencies
Navigate into the `APEXFlow` directory and run the installation script:

* **Windows**:
  ```batch
  cd APEXFlow
  setup.bat
  ```
* **macOS / Linux**:
  ```bash
  cd APEXFlow
  chmod +x setup.sh start.sh start-all.sh stop-all.sh
  ./setup.sh
  ```

---

## ▶️ Running & Enjoying Music

Choose how you want to run the application. **Option A (Python Fallback)** is highly recommended for standard local desktop workflows.

### Option A: Python Fallback Mode (Primary - Recommended ⭐️)
Use this option to launch APEXFlow directly. There is no need to start any separate backend server manually.
* **Windows**:
  ```batch
  cd APEXFlow
  start.bat
  ```
* **macOS / Linux**:
  ```bash
  cd APEXFlow
  ./start.sh
  ```

Once launched, open **`http://localhost:3000`** in your browser and enjoy creating music!
* *Why it is recommended*: You get detailed, real-time stage progress updates in the UI, and your GPU memory is automatically freed immediately after each song generates.

### Option B: Gradio API Mode (Alternative ⚠️)
Use this option if you prefer to keep the model preloaded in VRAM for rapid consecutive generations, or if you are connecting to a remote machine on your LAN.

1. **Start the ACE-Step 1.5 Gradio Server first** (in your `ACE-Step-1.5` directory):
   * *Standard Python setup*:
     ```bash
     uv run acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1
     ```
   * *If using the official ACE-Step 1.5 Windows Portable release*:
     ```batch
     python_embeded\python -m acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1
     ```
2. **Start APEXFlow** (in the `APEXFlow` directory):
   * *Windows*: run `start.bat`
   * *macOS / Linux*: run `./start.sh`

> [!WARNING]  
> When using Gradio API Mode, the synchronous connection prevents the Node backend from reading real-time logs. The progress bar in the UI will stay static at `3%` (`Generating music via Gradio...`) and jump directly to `100%` when completed. Additionally, GPU VRAM remains occupied as long as the Gradio server runs.

To stop the services on macOS / Linux:
```bash
./stop-all.sh
```

---

## 🗂️ Local Data & Backups

Generated songs, cached covers, databases, and uploaded audio are completely local.

### 💾 Backup & Migration Guide
If you need to format your system, update APEXFlow, or migrate your library to another machine:
* **Your Library Database**: All metadata, playlist records, likes, and settings reside in `server/data/acestep.db`. Copy this database file to backup.
* **Your Audio Files**: Generated audio, reference files, and covers are saved in `server/public/audio/` and `server/public/covers/`. Copy these directories.
* To restore on a new setup, simply place these files back in their respective directories before launching setup.

### 🧹 Cleanup for Sharing
Before sharing your project folder with others, make sure to clean up personal data. Delete the following:
- `node_modules/` and `server/node_modules/`
- `dist/`
- `server/data/` (removes your personal song library and SQLite DB)
- `server/public/audio/` (removes generated audio)
- `server/public/covers/` (removes cached covers)
- `server/.env` (removes local paths and API keys)

Keep placeholder files such as `.gitkeep` when present so empty folders still exist after cloning.

---

## 📈 Notes on Lyrics and Scores

Synced lyrics depend on whether ACE-Step returns or saves a real LRC / VTT file.
If no synced file exists, APEXFlow falls back to static lyrics display.

The score modal shows diagnostic values from ACE-Step when available. These
scores are useful for comparing takes, not for declaring whether a song is
"good" in a musical or artistic sense.

---

## 🙏 Credits & Links

| Project / Person | Role |
| --- | --- |
| [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) | Local AI music generation engine |
| [ace-step-ui](https://github.com/fspecii/ace-step-ui) | Spotify-like Web UI for ACE-Step 1.5 by [Ambsd](https://x.com/AmbsdOP) |
| [AudioMass](https://github.com/pkalogiros/AudioMass) | Browser audio editor |
| [Demucs](https://github.com/facebookresearch/demucs) | Stem separation |
| [Pexels](https://www.pexels.com) | Optional stock video backgrounds (for Video Studio) |

---

## 📄 License

This project follows the license of the original repository. See
[LICENSE](LICENSE) for details.

<p align="center">
  <strong>APEXFlow is a local music workspace, shaped for hands-on ACE-Step experiments.</strong>
</p>
