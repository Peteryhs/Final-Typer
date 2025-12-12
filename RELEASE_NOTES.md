# Release Notes - Final Typer v2.0.0

We are excited to announce the release of **Final Typer v2.0.0**, a complete rewrite of the typing simulation engine. This release transitions the application from a Python script to a robust, high-performance **Electron** desktop application featuring a modern **React + Material UI** interface.

## ?? Key Highlights

*   **Complete Overhaul:** Rebuilt from scratch using Electron, React, TypeScript, and Vite for superior performance and cross-platform compatibility.
*   **Modern UI:** A sleek, dark-themed interface powered by Material UI (MUI) and Framer Motion animations.
*   **Dual Architectures:** Native support for both **x64** and **ARM64** Windows systems.

## ? New Features

### ?? Smart Configuration
*   **Smart Mode:** Define a *target duration* (e.g., "finish this text in 2 minutes 30 seconds"), and the engine automatically calculates the necessary typing speed.
*   **Custom Mode:** Classic manual control over WPM (Words Per Minute).

### ?? Human-Like Simulation
*   **Natural Variation:** Algorithms now simulate human "drift" and fatigue, making the typing speed fluctuate naturally rather than staying robotic.
*   **Burst Mode:** Simulates thought processing by typing in bursts followed by micro-pauses.
*   **Misalignment & Fatigue:** Configurable options to simulate hand misalignment errors and typing fatigue over time.

### ? Advanced Error Handling
*   **Dynamic Mistakes:** Error rates can now scale based on text complexity.
*   **Realistic Corrections:**
    *   **Reflex Rate:** Determines how often errors are caught instantly vs. after a delay.
    *   **Backtrack Sensitivity:** Controls how far back the simulator will delete to fix a mistake.

## ?? Technical Improvements
*   **Performance:** Optimized rendering loop using React 18.
*   **Build System:** Automated build pipeline producing optimized installers (\.exe\) for Windows.
*   **Security:** Context-isolated preload scripts for safer IPC communication.

## ?? Installation
Download the latest installer (\Final Typer Setup 2.0.0.exe\) from the releases page. The installer is universal and supports both x64 and ARM64 Windows devices.

---
*Distributed under the Apache 2.0 License.*
