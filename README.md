
# ![FT-1-ezgif com-video-to-gif-converter](https://github.com/user-attachments/assets/e19e7746-0dde-488d-8083-7264d933b4b9)

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=Vite&logoColor=white)
![MUI](https://img.shields.io/badge/MUI-%230081CB.svg?style=for-the-badge&logo=mui&logoColor=white)
![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)

A modern, highly configurable typing simulation engine built with Electron, React, and TypeScript. This application is designed to simulate human-like typing patterns with adjustable speed, error rates, and natural variations.

## Features

### ⌨️ Keyboard Gate Mode
- **Type While Keys Active:** When enabled, typing only progresses while you are actively pressing keys. The simulation auto-pauses when your keyboard goes idle and auto-resumes the moment you start pressing keys again.
- **Low-Level Input Detection:** Uses Windows low-level keyboard hooks to distinguish real user keystrokes from the simulator's own injected input — so it never triggers itself.
- **Optional Input Blocking:** Blocks real user keyboard input from reaching the target application while the simulator is actively typing, preventing interference.

### 🎨 Dynamic Theming
- **Any Color, Everywhere:** Choose any accent color from a full-spectrum color picker and the entire UI adapts — backgrounds, surfaces, and accent tones are algorithmically generated for both light and dark modes.
- **12 Preset Swatches:** Quick-pick from curated colors: Violet, Blue, Cyan, Green, Lime, Amber, Orange, Red, Pink, Rose, Slate, and Teal.
- **Cohesive Palette Generation:** HSL-based algorithm ensures proper contrast ratios and harmonious color relationships across all UI elements.

### ⚡ Humanized Typing Simulation
- **Humanization Rate:** A single slider (0–10%) that proportionally scales mistakes, micro-pauses, burst breaks, and synonym replacements. Set it to zero for perfectly clean output, or crank it up for more human-like imperfections.
- **Natural Variation:** Simulates human speed drift so typing isn't robotic. Toggle dynamic speed mode and control variance intensity.
- **Burst Mode:** Simulate bursts of speed followed by brief thinking pauses, mimicking natural thought processing.
- **Markdown Support:** Paste Markdown-formatted text and it will be automatically stripped to plain text before typing.

### ⚠️ Advanced Error Handling
- **Dynamic Mistakes:** Error frequency scales based on typing complexity and the humanization rate.
- **Realistic Corrections:**
  - **Reflex Rate:** Percentage of errors corrected instantly vs. delayed.
  - **Correction Delay:** Adjustable delay before pressing backspace.
  - **Backtrack Sensitivity:** Controls how far back the typer will go to fix errors.
- **Synonym Replacement:** Occasionally substitutes words with synonyms, then corrects them — simulating a genuine writing thought process.

### 🛡️ Safety & Control
- **Emergency Stop:** A dedicated kill button in the overlay that immediately stops typing and closes the application.
- **Pause / Resume:** Manually pause and resume at any time, with a configurable countdown before resuming.
- **Auto-Overlay:** Automatically switches to a compact floating overlay when typing begins.

### 🛠️ Fine-Tuning (Advanced Panel)
- **Pause Multiplier:** Scale the duration of natural pauses (e.g., after sentences or paragraphs).
- **Micro-Pauses:** Random brief hesitations scaled by the humanization rate.
- **Hyperdrive Mode:** Burst-accelerated typing for longer passages.
- **Fix Sessions:** Periodic "look-back" correction passes that scroll up, fix accumulated errors, then return to the insertion point.
- **Word Swaps:** Simulates synonym usage with configurable correction behavior (live or backtrack).
- **ETA Calibration:** The estimated time display self-corrects over sessions by blending observed vs. predicted durations.

### 💻 Tech Stack
- **Frontend:** React, Material UI (MUI), Framer Motion
- **Backend/Shell:** Electron, TypeScript
- **Native Input:** C# (.NET 9) `Typer.exe` using Windows `SendInput` API with low-level keyboard hooks
- **Build Tool:** Vite

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Peteryhs/Final-Typer
    cd Final-Typer
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in Development Mode:**
    ```bash
    npm run electron:dev
    ```

## Building

To create a standalone executable for your system:

```bash
npm run build
```
This will generate both an NSIS installer and a portable executable in the `release/` directory.
*Supports both x64 and arm64 architectures on Windows.*

## Usage

1.  Paste the text you want to type into the main input area (Markdown is automatically converted to plain text).
2.  Open the **Config Panel** (drag from the right side or click the handle).
3.  Adjust your target **WPM**, **Humanization Rate**, and toggle features like **Natural Variation** or **Keyboard Gate**.
4.  Click **Start Engine** to begin the simulation.
5.  Focus on the target window where you want the typing to occur. The app will switch to a compact overlay automatically.

## Images
<img width="1754" height="1234" alt="image" src="https://github.com/user-attachments/assets/60bed08e-fce7-4d88-9720-add7e43e7554" />


## License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.
