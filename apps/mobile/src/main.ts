import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("No se encontró el nodo raíz de MAC Mobile");
}

mount(App, { target });
