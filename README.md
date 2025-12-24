<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🎮 Gemini Jeopardy: Jackbox Edition

A real-time, multiplayer Jeopardy game powered by Google's Gemini AI. This edition is designed to be played like a Jackbox game—host the board on your big screen and use your phones as buzzers!

## ✨ Features

- **Gemini-Generated Boards:** Enter any theme (e.g., "90s Pop Culture", "Quantum Physics", "80s Anime") and Gemini will craft a full Jeopardy board with categories, questions, and answers.
- **Real-Time Multiplayer:** Powered by **PeerJS** for instant, cross-device communication without a dedicated backend server.
- **Jackbox-Style Play:**
    - **Main Screen (Host):** Displays the board and reveals answers.
    - **Phone (Player):** Your personalized buzzer and score tracker.
    - **Phone (Host Controller):** A secret view for the host to see the answer key while walking around the room.
- **Modern UI:** Built with React, Tailwind CSS, and Framer Motion for a sleek, neon-game-show aesthetic.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+) or **Bun** (v1.0+)
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd gemini-jeopardy-jackbox-edition
   ```

2. **Install dependencies:**

   Using **Bun** (Recommended):
   ```bash
   bun install
   ```

   Using **npm**:
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file (or edit `.env.local`) and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Run the app:**

   Using **Bun**:
   ```bash
   bun dev
   ```

   Using **npm**:
   ```bash
   npm run dev
   ```

## 🕹️ How to Play

1. **Start the Game:** On your computer, click **"Create Game"**, enter a theme, and wait for Gemini to generate the board.
2. **Join as a Player:** On your phone, open the game URL, click **"Join Game"**, enter the 4-letter **Room Code** shown on the computer, and your name.
3. **Join as Host Controller (Optional):** If you want to see the answers on your phone while hosting, click **"Join Game"**, enter the code, and tap the **"Join as Host"** link at the bottom.
4. **Buzz In:** When a question is active, the first player to tap **BUZZ** on their phone gets to answer!
5. **Score Points:** The Host (on the computer) clicks **Correct** or **Incorrect** to update scores and reveal the answer.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **AI:** Google Generative AI (Gemini 1.5 Flash)
- **Networking:** PeerJS (WebRTC)
- **Styling:** Tailwind CSS
