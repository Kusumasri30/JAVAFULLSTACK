# Ridgeline

A small full-stack hill-climbing game. The browser runs the canvas game; a dependency-free Java HTTP server serves the game and records the current session's top eight scores.

## Run

Requires JDK 17 or newer. From this folder, double-click `run.bat` or run it from a terminal. Open [http://localhost:8080](http://localhost:8080). Set the `PORT` environment variable to use another port.

## Controls

- `Space` or `Up`: throttle
- `A` / `D`: balance in the air
- `Down`: brake
- `Esc`: pause or resume
- On touch screens, use the four on-screen controls

Collect coins and fuel cans as you ride. Enter a name after your run to add the distance to the local trail board. Scores are held in server memory and clear when the server restarts.

## Stack

- Java 17+ `HttpServer`, no external dependencies
- HTML, CSS, and Canvas 2D
- `GET /api/leaderboard` and `POST /api/score`