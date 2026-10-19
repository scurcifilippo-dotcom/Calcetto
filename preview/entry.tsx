import React from "react";
import { createRoot } from "react-dom/client";
import App from "../components/calcetto-app";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<App />);
