// Vercel's Express framework detector requires the recognized root entrypoint
// to import Express directly. The app itself is created and configured once in
// server/index.js, then re-exported here for Vercel.
import express from "express";
import app from "./server/index.js";

// Keep the package import explicit for Vercel's Express entrypoint detection.
void express;

export default app;
