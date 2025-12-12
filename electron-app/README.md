# Final Typer (Electron)

A modern, highly configurable typing simulation engine built with Electron, React, and TypeScript. This application is designed to simulate human-like typing patterns with adjustable speed, error rates, and natural variations.

## Features

### 🧠 Smart & Custom Modes
- **Smart Mode:** Set a target duration (minutes and seconds), and the engine automatically calculates the required typing speed (WPM) to finish the text exactly on time.
- **Custom Mode:** Manually set your target WPM and fine-tune behavior.

### ⚡ Humanized Typing Simulation
- **Natural Variation:** Simulates human speed drift/fatigue so typing isn't robotic.
- **Variance Intensity:** Control how much the speed fluctuates during the session.
- **Burst Mode:** Simulate bursts of speed followed by brief pauses, mimicking natural thought processing.

### ⚠️ Advanced Error Handling
- **Configurable Mistake Rate:** Set the percentage of characters that will be mistyped.
- **Dynamic Mistakes:** Option to scale error frequency based on typing complexity.
- **Realistic Corrections:**
  - **Reflex Rate:** Percentage of errors corrected instantly vs. delayed.
  - **Correction Delay:** Adjustable delay before pressing backspace.
  - **Backtrack Sensitivity:** Controls how far back the typer will go to fix errors.

### 🛠️ Fine-Tuning
- **Pause Multiplier:** Scale the duration of natural pauses (e.g., after sentences or paragraphs).
- **Misalignment Chance:** Simulates hand misalignment errors.

### 💻 Tech Stack
- **Frontend:** React, Material UI (MUI), Framer Motion, Tailwind CSS
- **Backend/Shell:** Electron, TypeScript
- **Build Tool:** Vite

## Installation

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone <repository-url>
    cd final-typer-electron/electron-app
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
This will generate an installer in the `dist/` directory.
*Supports both x64 and arm64 architectures on Windows.*

## Usage

1.  Paste the text you want to type into the main input area.
2.  Open the **Config Panel** (drag from the right side or click the handle).
3.  Choose your mode (**Smart** or **Custom**) and adjust parameters.
4.  Click **Start Engine** to begin the simulation.
5.  Focus on the target window where you want the typing to occur (if applicable, or watch the simulation in-app).

## License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.
