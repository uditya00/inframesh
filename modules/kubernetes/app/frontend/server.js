const express = require("express");
const client = require("prom-client");

const app = express();
const port = process.env.PORT || 8080;
const backendUrl =
  process.env.BACKEND_URL || "http://stratomesh-backend:3000";

// ============================================================
// Prometheus Metrics
// ============================================================

const register = new client.Registry();

// Collect default Node.js metrics
client.collectDefaultMetrics({ register });

// ------------------------------------------------------------
// HTTP Request Counter
// ------------------------------------------------------------

const httpRequests = new client.Counter({
  name: "frontend_http_requests_total",
  help: "Total number of HTTP requests received by the frontend",
  labelNames: ["method", "route", "status_code"],
});

// ------------------------------------------------------------
// HTTP Request Duration Histogram
// Used for p99 latency calculation
// ------------------------------------------------------------

const httpRequestDuration = new client.Histogram({
  name: "frontend_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2,
    5,
  ],
});

// Register custom metrics
register.registerMetric(httpRequests);
register.registerMetric(httpRequestDuration);

// ============================================================
// HTTP Metrics Middleware
// ============================================================

app.use((req, res, next) => {
  const start = process.hrtime();

  res.on("finish", () => {
    // Calculate request duration in seconds
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;

    // Count HTTP request
    httpRequests.inc({
      method: req.method,
      route: req.path,
      status_code: res.statusCode,
    });

    // Record HTTP request duration
    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.path,
        status_code: res.statusCode,
      },
      duration
    );
  });

  next();
});

// ============================================================
// Prometheus Metrics Endpoint
// ============================================================

app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error("Metrics generation failed:", error.message);
    res.status(500).send("Metrics unavailable");
  }
});

// ============================================================
// Main Dashboard
// ============================================================

app.get("/", async (req, res) => {
  let backendStatus = "unavailable";
  let databaseStatus = "unavailable";

  try {
    // Check backend health
    const healthResponse = await fetch(`${backendUrl}/health`);

    if (healthResponse.ok) {
      backendStatus = "healthy";
    }

    // Check backend database readiness
    const readyResponse = await fetch(`${backendUrl}/ready`);

    if (readyResponse.ok) {
      const data = await readyResponse.json();
      databaseStatus = data.database || "connected";
    }
  } catch (error) {
    console.error("Backend connection failed:", error.message);
  }

  res.send(`
    <!DOCTYPE html>
    <html>

    <head>
      <title>StratoMesh Dashboard</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 40px;
          background: #f4f6f8;
        }

        .container {
          max-width: 800px;
          margin: auto;
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        h1 {
          margin-top: 0;
        }

        .status {
          padding: 15px;
          margin: 12px 0;
          border-radius: 8px;
          background: #eef2f7;
        }

        .value {
          font-weight: bold;
        }
      </style>

    </head>

    <body>

      <div class="container">

        <h1>StratoMesh Platform</h1>

        <p>GitOps & Self-Healing Cloud Platform</p>

        <div class="status">
          Frontend:
          <span class="value">Running</span>
        </div>

        <div class="status">
          Backend:
          <span class="value">${backendStatus}</span>
        </div>

        <div class="status">
          Database:
          <span class="value">${databaseStatus}</span>
        </div>

      </div>

    </body>

    </html>
  `);
});

// ============================================================
// Health Check
// ============================================================

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
  });
});

// ============================================================
// Start Server
// ============================================================

app.listen(port, "0.0.0.0", () => {
  console.log(`StratoMesh frontend listening on port ${port}`);
});