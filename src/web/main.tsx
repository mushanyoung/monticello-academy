import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <main>
    <h1>Monticello · Little days, big discoveries.</h1>
    <p>Monroe campus family notebook</p>
  </main>,
);
