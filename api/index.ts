// Vercel serverless entry — the whole Express app behind one function.
// vercel.json rewrites every path here.
import { createApp } from "../src/app";

export default createApp();
